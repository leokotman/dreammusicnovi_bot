import { ATTEMPT_LIFETIME_MS, MAX_CLOCK_SKEW_MS } from "./timing";
import type { ConsentGrant } from "./consent";

export interface Candidate {
  attempt: string;
  userId: string;
  username: string;
  codeHash: string;
}

function parseTimestamp(value: string): Date {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value)
    throw new Error("invalid-pairing-response");
  return date;
}

/** The website owns expiry and first-identity reservation; the bot owns consent. */
export class CandidateClient {
  constructor(private url: string, private secret: string, private botId: string) {}

  private async request(body: object): Promise<Record<string, unknown>> {
    try {
      const response = await fetch(this.url, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(5000),
        headers: { authorization: `Bearer ${this.secret}`, "content-type": "application/json" },
        body: JSON.stringify({ version: 1, botId: this.botId, ...body }),
      });
      if (!response.ok || !response.body) throw new Error();
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 4096) throw new Error();
          chunks.push(value);
        }
      } finally { await reader.cancel(); }
      const result: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error();
      return result as Record<string, unknown>;
    } catch { throw new Error("pairing-callback-unavailable"); }
  }

  async reserve(candidate: Candidate): Promise<{ createdAt: Date; expiresAt: Date }> {
    const result = await this.request({ phase: "reserve", ...candidate });
    if (Object.keys(result).sort().join() !== "createdAt,expiresAt,version" || result.version !== 1 ||
        typeof result.expiresAt !== "string" || typeof result.createdAt !== "string") throw new Error("invalid-pairing-response");
    const createdAt = parseTimestamp(result.createdAt);
    const expiresAt = parseTimestamp(result.expiresAt);
    const now = Date.now();

    if (createdAt.getTime() > now + MAX_CLOCK_SKEW_MS)
      throw new Error("invalid-pairing-response");

    const lifetime = expiresAt.getTime() - createdAt.getTime();
    if (lifetime <= 0 || lifetime > ATTEMPT_LIFETIME_MS)
      throw new Error("invalid-pairing-response");

    if (expiresAt.getTime() <= now)
      throw new Error("invalid-pairing-response");

    return { createdAt, expiresAt };
  }

  async bind(candidate: Candidate, consent: ConsentGrant): Promise<void> {
    const result = await this.request({ phase: "bind", ...candidate, consent });
    if (Object.keys(result).sort().join() !== "registered,version" || result.version !== 1 || result.registered !== true)
      throw new Error("invalid-pairing-response");
  }
}
