import { randomUUID } from "crypto";
import { Pool, PoolClient } from "pg";
import { aggregate, ApiError, destinations, EnrollmentEvent, MessagePart } from "./contract";

export interface Claim {
  id: string; event_id: string; destination: string; parts: MessagePart[];
  next_part: number; part_attempts: number; claim_token: string;
  roles: string[]; visitor_cancelled: boolean | null; payload: EnrollmentEvent;
}
export type Outcome = { messageId: number } | { error: string; retrySeconds?: number; cooldownSeconds?: number };

export class DeliveryStore {
  constructor(public pool: Pool) {}

  private async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async limit(bucket: string, maximum: number): Promise<void> {
    const result = await this.pool.query(`
      INSERT INTO website_delivery_limits(bucket, window_start, count)
      VALUES ($1, date_trunc('minute', now()), 1)
      ON CONFLICT (bucket) DO UPDATE SET
        window_start = EXCLUDED.window_start,
        count = CASE WHEN website_delivery_limits.window_start = EXCLUDED.window_start
                     THEN website_delivery_limits.count + 1 ELSE 1 END
      WHERE website_delivery_limits.window_start <> EXCLUDED.window_start
         OR website_delivery_limits.count < $2 RETURNING count`, [bucket, maximum]);
    if (!result.rowCount) throw new ApiError(429, "rate-limited");
  }

  async accept(event: EnrollmentEvent, admins: string[], visitorAllowed = true): Promise<boolean> {
    const payload = JSON.stringify(event);
    return this.transaction(async client => {
      const inserted = await client.query(`INSERT INTO website_delivery_events(id, payload)
        VALUES ($1, $2::jsonb) ON CONFLICT (id) DO NOTHING RETURNING id`, [event.eventId, payload]);
      if (!inserted.rowCount) {
        const existing = await client.query("SELECT payload = $2::jsonb AS same FROM website_delivery_events WHERE id = $1", [event.eventId, payload]);
        if (!existing.rows[0]?.same) throw new ApiError(409, "event-conflict");
        return false;
      }
      for (const destination of destinations(event, admins)) {
        const cancelled = !visitorAllowed && destination.roles.includes("visitor");
        const staff = cancelled && destination.roles.includes("admin");
        const parts = staff ? destinations(event, [destination.chatId], false).find(d => d.chatId === destination.chatId)!.parts : destination.parts;
        await client.query(`INSERT INTO website_deliveries(id,event_id,destination,roles,parts,visitor_cancelled,state,error_code)
          VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)`, [randomUUID(), event.eventId, destination.chatId, destination.roles,
          JSON.stringify(parts), cancelled || null, cancelled && !staff ? "failed" : "pending",
          cancelled && !staff ? "consent-revoked" : null]);
      }
      return true;
    });
  }

  async status(id: string) {
    const result = await this.pool.query(`SELECT id,destination,roles,state,attempts,part_attempts,next_at,lease_until,error_code,parts,visitor_cancelled
      FROM website_deliveries WHERE event_id=$1 ORDER BY destination`, [id]);
    if (!result.rowCount) throw new ApiError(404, "job-not-found");
    return {
      version: 2, jobId: id, state: aggregate(result.rows.flatMap(row => row.visitor_cancelled ? (row.roles.includes("admin") ? [row.state as string, "cancelled"] : ["cancelled"]) : [row.state as string])),
      deliveries: result.rows.map(row => ({
        deliveryId: row.id as string, destination: row.destination as string, roles: row.roles as string[],
        state: row.visitor_cancelled && row.roles.length === 1 ? "cancelled" : row.state as string, attempts: row.attempts as number, partAttempts: row.part_attempts as number,
        nextAttemptAt: ["sent", "failed"].includes(row.state) ? null : row.lease_until ?? row.next_at,
        visitorOutcome: row.roles.includes("visitor") ? (row.visitor_cancelled ? "cancelled" : row.state) : null,
        error: row.error_code as string | null,
        messageIds: (row.parts as MessagePart[]).flatMap(part => part.messageId === undefined ? [] : [part.messageId]),
      })),
    };
  }

  async claim(id: string): Promise<Claim | null> {
    return this.transaction(async client => {
      const clock = await client.query("SELECT id FROM website_delivery_clock WHERE next_send_at <= now() FOR UPDATE SKIP LOCKED");
      if (!clock.rowCount) return null;
      const result = await client.query(`SELECT id FROM website_deliveries
        WHERE event_id=$1 AND state NOT IN ('sent','failed') AND next_at<=now()
        AND (lease_until IS NULL OR lease_until<=now())
        ORDER BY next_at,id LIMIT 1 FOR UPDATE SKIP LOCKED`, [id]);
      if (!result.rowCount) return null;
      const claimed = await client.query<Claim>(`UPDATE website_deliveries SET
        claim_token=$2, lease_until=now()+interval '60 seconds', state='processing',
        attempts=attempts+1, part_attempts=part_attempts+1
        WHERE id=$1 RETURNING *`, [result.rows[0].id, randomUUID()]);
      // Conservative bot-wide pacing also bounds bursts across concurrent jobs.
      await client.query("UPDATE website_delivery_clock SET next_send_at=now()+interval '1 second'");
      const payload = await client.query("SELECT payload FROM website_delivery_events WHERE id=$1", [id]);
      return { ...claimed.rows[0], payload: payload.rows[0].payload as EnrollmentEvent };
    });
  }

  async cancelVisitor(claim: Claim): Promise<Claim | null> {
    const staff = claim.roles.includes("admin");
    const parts = claim.parts.slice(0, claim.next_part);
    if (staff) {
      const replacement = destinations(claim.payload, [claim.destination], false).find(d => d.chatId === claim.destination)!.parts;
      parts.push(...replacement);
    }
    const result = await this.pool.query<Claim>(`UPDATE website_deliveries SET
      visitor_cancelled=true,parts=$3::jsonb,state=$4,error_code=$5,
      claim_token=CASE WHEN $6 THEN $7::uuid ELSE NULL END,
      lease_until=CASE WHEN $6 THEN lease_until ELSE NULL END,
      part_attempts=CASE WHEN $6 THEN 1 ELSE part_attempts END
      WHERE id=$1 AND claim_token=$2 AND visitor_cancelled IS NOT TRUE RETURNING *`,
    [claim.id, claim.claim_token, JSON.stringify(parts), staff ? "processing" : "failed", staff ? null : "consent-revoked", staff, randomUUID()]);
    return staff && result.rowCount ? { ...result.rows[0], payload: claim.payload } : null;
  }

  async finish(claim: Claim, outcome: Outcome): Promise<boolean> {
    return this.transaction(async client => {
      const parts = claim.parts.map(part => ({ ...part }));
      let state: string, nextPart = claim.next_part, retry = 0, error: string | null = null;
      let partAttempts = claim.part_attempts;
      if ("messageId" in outcome) {
        parts[nextPart].messageId = outcome.messageId;
        nextPart++;
        state = nextPart === parts.length ? "sent" : "retrying";
        partAttempts = 0;
        retry = 1;
      } else {
        error = outcome.error;
        state = outcome.retrySeconds !== undefined && claim.part_attempts < 8 ? "retrying" : "failed";
        retry = outcome.retrySeconds ?? 0;
      }
      const result = await client.query(`UPDATE website_deliveries SET
        parts=$3::jsonb,next_part=$4,part_attempts=$5,state=$6,error_code=$7,
        next_at=now()+make_interval(secs => $8),claim_token=NULL,lease_until=NULL
        WHERE id=$1 AND claim_token=$2 RETURNING id`,
      [claim.id, claim.claim_token, JSON.stringify(parts), nextPart, partAttempts, state, error, retry]);
      if (result.rowCount && "cooldownSeconds" in outcome && outcome.cooldownSeconds !== undefined) {
        await client.query(`UPDATE website_delivery_clock SET next_send_at=
          greatest(next_send_at,now()+make_interval(secs => $1))`, [outcome.cooldownSeconds]);
      }
      return !!result.rowCount;
    });
  }

  async pending(id: string): Promise<{ pending: boolean; retryAfterSeconds: number }> {
    const result = await this.pool.query(`SELECT count(*)::integer AS count,
      ceil(extract(epoch FROM min(greatest(d.next_at,coalesce(d.lease_until,d.next_at),c.next_send_at))-now())) AS delay
      FROM website_deliveries d CROSS JOIN website_delivery_clock c
      WHERE event_id=$1 AND state NOT IN ('sent','failed')`, [id]);
    return { pending: result.rows[0].count > 0, retryAfterSeconds: Math.max(1, Math.min(43200, Number(result.rows[0].delay) || 1)) };
  }

  async recoveryPage(after: string | null): Promise<string[]> {
    const result = await this.pool.query(`SELECT DISTINCT event_id FROM website_deliveries
      WHERE state NOT IN ('sent','failed') AND next_at<=now()
      AND (lease_until IS NULL OR lease_until<=now()) AND ($1::uuid IS NULL OR event_id>$1::uuid)
      ORDER BY event_id LIMIT 100`, [after]);
    return result.rows.map(row => row.event_id as string);
  }
}
