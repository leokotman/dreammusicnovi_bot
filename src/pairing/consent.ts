import { randomUUID } from "crypto";
import { Pool, PoolClient } from "pg";
import { ATTEMPT_LIFETIME_MS, MAX_CLOCK_SKEW_MS } from "./timing";
import { ApiError } from "../delivery/contract";

export interface ConsentGrant {
  id: string;
  userId: string;
  generation: string;
}
interface GrantRow {
  id: string; user_id: string; generation: string; current_generation: string;
  expires_at: Date; activated_at: Date | null;
}

/** Internal durable authority; callers must authenticate Telegram/service requests first. */
export class ConsentStore {
  constructor(private pool: Pool) {}

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

  private async lockUser(client: PoolClient, userId: string): Promise<string> {
    await client.query(`INSERT INTO website_consent_users(user_id) VALUES ($1)
      ON CONFLICT (user_id) DO NOTHING`, [userId]);
    const result = await client.query(`SELECT generation FROM website_consent_users
      WHERE user_id=$1 FOR UPDATE`, [userId]);
    return result.rows[0].generation as string;
  }

  /** First candidate wins; identical retries neither consume quota nor refresh expiry. */
  async candidate(userId: string, attemptHash: string, expiresAt: Date, createdAt: Date): Promise<ConsentGrant> {
    return this.transaction(async client => {
      // Serialize the same attempt even when two different accounts race for it.
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [attemptHash]);
      const generation = await this.lockUser(client, userId);
      const existing = await client.query<GrantRow>(`SELECT g.*, u.generation AS current_generation
        FROM website_consent_grants g JOIN website_consent_users u ON u.user_id=g.user_id
        WHERE attempt_hash=$1`, [attemptHash]);
      if (existing.rowCount) {
        const grant = existing.rows[0];
        if (grant.user_id !== userId) throw new ApiError(409, "candidate-conflict");
        if (grant.generation !== generation) throw new ApiError(409, "consent-revoked");
        const valid = await client.query("SELECT $1::timestamptz > now() AS valid", [grant.expires_at]);
        if (!valid.rows[0].valid) throw new ApiError(410, "attempt-expired");
        return { id: grant.id, userId, generation };
      }
      // The website supplies the original attempt expiry. Never extend it on retry.
      const valid = await client.query(`SELECT $1::timestamptz > now()
        AND $2::timestamptz <= now()+($4::double precision * interval '1 millisecond')
        AND $1::timestamptz > $2::timestamptz
        AND $1::timestamptz <= $2::timestamptz+($3::double precision * interval '1 millisecond') AS valid`,
      [expiresAt, createdAt, ATTEMPT_LIFETIME_MS, MAX_CLOCK_SKEW_MS]);
      if (!valid.rows[0].valid) throw new ApiError(410, "attempt-expired");
      // Use the earliest possible creation time, accounting for a website clock ahead of this authority.
      // Ambiguous links fail closed; reconnecting requires a new link beyond the uncertainty window.
      const fresh = await client.query(`SELECT 1 FROM website_consent_users
        WHERE user_id=$1 AND (revoked_at IS NULL OR revoked_at < $2::timestamptz-($3::double precision * interval '1 millisecond'))`,
      [userId, createdAt, MAX_CLOCK_SKEW_MS]);
      if (!fresh.rowCount) throw new ApiError(409, "consent-revoked");
      const recent = await client.query(`SELECT count(*)::integer AS count
        FROM website_consent_grants WHERE user_id=$1 AND created_at>now()-interval '10 minutes'`, [userId]);
      if (recent.rows[0].count >= 5) throw new ApiError(429, "pairing-rate-limited");
      const id = randomUUID();
      await client.query(`INSERT INTO website_consent_grants(id,attempt_hash,user_id,generation,expires_at)
        VALUES ($1,$2,$3,$4,$5)`, [id, attemptHash, userId, generation, expiresAt]);
      return { id, userId, generation };
    });
  }

  /** Explicit website verification activates only the exact candidate generation. */
  async activate(grant: ConsentGrant): Promise<void> {
    return this.transaction(async client => {
      const generation = await this.lockUser(client, grant.userId);
      if (generation !== grant.generation) throw new ApiError(409, "consent-revoked");
      const result = await client.query(`UPDATE website_consent_grants
        SET activated_at=coalesce(activated_at,now())
        WHERE id=$1 AND user_id=$2 AND generation=$3 AND expires_at>now() RETURNING id`,
      [grant.id, grant.userId, grant.generation]);
      if (!result.rowCount) throw new ApiError(409, "grant-unavailable");
    });
  }

  /** Must be checked at resolution, acceptance and immediately before visitor sends. */
  async allows(userId: string, grant?: ConsentGrant): Promise<boolean> {
    if (grant) {
      if (grant.userId !== userId) return false;
      const result = await this.pool.query(`SELECT 1 FROM website_consent_grants g
        JOIN website_consent_users u ON u.user_id=g.user_id
        WHERE g.id=$1 AND g.user_id=$2 AND g.generation=$3
        AND u.generation=g.generation AND g.activated_at IS NOT NULL`,
      [grant.id, userId, grant.generation]);
      return !!result.rowCount;
    }
    // Legacy proofs/jobs remain invalid forever after the first account revocation.
    const result = await this.pool.query(`SELECT 1 FROM website_consent_users
      WHERE user_id=$1 AND revoked_at IS NOT NULL`, [userId]);
    return !result.rowCount;
  }

  /** A definitive blocked send fences its original authorization, never a later reconnection. */
  async blockedDelivery(userId: string, grant?: ConsentGrant): Promise<void> {
    return this.transaction(async client => {
      const generation = await this.lockUser(client, userId);
      if (grant) {
        if (grant.userId !== userId || grant.generation !== generation) return;
        const active = await client.query(`SELECT 1 FROM website_consent_grants
          WHERE id=$1 AND user_id=$2 AND generation=$3 AND activated_at IS NOT NULL`,
        [grant.id, userId, generation]);
        if (!active.rowCount) return;
      } else {
        const previous = await client.query("SELECT revoked_at FROM website_consent_users WHERE user_id=$1", [userId]);
        if (previous.rows[0].revoked_at) return;
      }
      await client.query(`UPDATE website_consent_users SET generation=generation+1,revoked_at=now()
        WHERE user_id=$1`, [userId]);
    });
  }

  /** Call only for authenticated private-chat disconnect/block updates, never unblock. */
  async revoke(userId: string, updateId: number): Promise<boolean> {
    return this.transaction(async client => {
      await this.lockUser(client, userId);
      const inserted = await client.query(`INSERT INTO website_consent_revocations(update_id,user_id)
        VALUES ($1,$2) ON CONFLICT (update_id) DO NOTHING RETURNING update_id`, [updateId, userId]);
      if (!inserted.rowCount) return false;
      // Every distinct block/disconnect revokes, including delayed older events.
      // Duplicates cannot fence a later reconnection a second time.
      await client.query(`UPDATE website_consent_users SET generation=generation+1,revoked_at=now()
        WHERE user_id=$1`, [userId]);
      return true;
    });
  }
}
