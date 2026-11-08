import { DeliveryConfig } from "./config";
import { EnrollmentEvent } from "./contract";
import { DeliveryStore } from "./store";
import { publish, send } from "./transport";

export class DeliveryService {
  constructor(public store: DeliveryStore, public config: DeliveryConfig) {}

  async accept(event: EnrollmentEvent) {
    const created = await this.store.accept(event, this.config.adminIds);
    const pending = await this.store.pending(event.eventId);
    if (pending.pending) {
      try { await publish(this.config, event.eventId, pending.retryAfterSeconds); }
      catch { /* The committed unfinished delivery rows are the recovery outbox. */ }
    }
    return { created, result: { jobId: event.eventId, state: (await this.store.status(event.eventId)).state } };
  }

  async process(id: string) {
    await this.store.status(id);
    // One message part per invocation bounds network time and shares bot-wide pacing.
    const claim = await this.store.claim(id);
    if (claim) {
      const outcome = claim.part_attempts > 8 ? { error: "attempts-exhausted" } :
        await send(this.config, claim.destination, claim.parts[claim.next_part].text, claim.part_attempts);
      await this.store.finish(claim, outcome);
    }
    return this.store.pending(id);
  }

  async recover(after: string | null) {
    const ids = await this.store.recoveryPage(after);
    // Throw on any publication failure; a retry safely republishes earlier items.
    await Promise.all(ids.map(id => publish(this.config, id)));
    return { nextCursor: ids.length === 100 ? ids[ids.length - 1] : null };
  }
}
