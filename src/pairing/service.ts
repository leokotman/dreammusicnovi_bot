import { ConsentStore } from "./consent";
import { CandidateClient } from "./client";
import { attemptHash, codeHash, pairingCode, privateIdentity } from "./protocol";

export class PairingService {
  constructor(private consent: ConsentStore, private website: CandidateClient, private botToken: string) {}

  async start(attempt: string, message: unknown): Promise<string> {
    const identity = privateIdentity(message);
    const code = pairingCode(this.botToken, attempt, identity.userId);
    const candidate = { attempt, ...identity, codeHash: codeHash(attempt, code) };
    const { createdAt, expiresAt } = await this.website.reserve(candidate);
    const grant = await this.consent.candidate(identity.userId, attemptHash(attempt), expiresAt, createdAt);
    await this.website.bind(candidate, grant);
    // Fence revocation/expiry during callback latency. A later race still cannot activate a stale grant.
    await this.consent.candidate(identity.userId, attemptHash(attempt), expiresAt, createdAt);
    return code;
  }
}
