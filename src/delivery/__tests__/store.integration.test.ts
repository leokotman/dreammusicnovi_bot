import { Pool } from "pg";
import { readFileSync } from "fs";
import { randomUUID } from "crypto";
import path from "path";
import { ConsentStore } from "../../pairing/consent";
import { DeliveryService } from "../service";
import { send, publish } from "../transport";
import { config } from "./fixtures";
import { DeliveryStore } from "../store";
import { event } from "./fixtures";

jest.mock("../transport", () => ({ send: jest.fn(), publish: jest.fn() }));

// Opt in only with an explicitly created scratch database. No dotenv reads.
const scratchUrl = process.env.DELIVERY_TEST_DATABASE_URL;
const integration = scratchUrl ? describe : describe.skip;
integration("isolated PostgreSQL delivery transactions", () => {
  let pool: Pool, store: DeliveryStore;
  beforeAll(async () => {
    const target = new URL(scratchUrl!);
    if (target.hostname !== "127.0.0.1" || !/^\/delivery_scratch_[a-z_]+$/.test(target.pathname) || target.search) {
      throw new Error("Integration tests require an explicit loopback delivery_scratch_* database without URL overrides");
    }
    const schema = `delivery_test_${randomUUID().replace(/-/g, "")}`;
    pool = new Pool({ connectionString: scratchUrl, max: 8, options: `-c search_path=${schema}` });
    await pool.query(`CREATE SCHEMA ${schema}`);
    await pool.query(readFileSync(path.resolve(__dirname, "../../../migrations/001_website_delivery.sql"), "utf8"));
    await pool.query(readFileSync(path.resolve(__dirname, "../../../migrations/002_website_consent.sql"), "utf8"));
    await pool.query("INSERT INTO website_delivery_events(id,payload) VALUES ($1,$2::jsonb)", [event.eventId, JSON.stringify(event)]);
    await pool.query(`INSERT INTO website_deliveries(id,event_id,destination,roles,parts)
      VALUES ($1,$2,$3,$4,$5::jsonb)`, [randomUUID(), event.eventId, event.telegramUserId, ["visitor"], JSON.stringify([{ text: "existing", messageId: 42 }])]);
    const existing = (await pool.query("SELECT * FROM website_deliveries")).rows;
    await pool.query(readFileSync(path.resolve(__dirname, "../../../migrations/003_website_delivery_consent.sql"), "utf8"));
    expect((await pool.query("SELECT * FROM website_deliveries")).rows).toEqual(existing.map(row => ({ ...row, visitor_cancelled: null })));
    expect((await pool.query("SELECT payload FROM website_delivery_events")).rows).toEqual([{ payload: event }]);
    store = new DeliveryStore(pool);
  });
  beforeEach(async () => {
    jest.clearAllMocks();
    (send as jest.Mock).mockResolvedValue({ messageId: 333 });
    await pool.query("TRUNCATE website_consent_revocations,website_consent_grants,website_consent_users");
    // Only test-owned tables in the unique scratch schema are cleared.
    await pool.query("TRUNCATE website_deliveries,website_delivery_events,website_delivery_limits");
    await pool.query("UPDATE website_delivery_clock SET next_send_at=now()-interval '1 second'");
  });
  afterAll(async () => { if (pool) await pool.end(); });
  async function ready() { await pool.query("UPDATE website_delivery_clock SET next_send_at=now()-interval '1 second'"); }

  it("deduplicates concurrent acceptance and snapshots recipients permanently", async () => {
    const result = await Promise.all([store.accept(event, ["111", "111"]), store.accept(event, ["111", "111"])]);
    expect(result.sort()).toEqual([false, true]);
    await store.accept(event, ["222"]);
    const status = await store.status(event.eventId);
    expect(status.deliveries.map(row => row.destination).sort()).toEqual(["111", event.telegramUserId].sort());
    expect(status.state).toBe("accepted");
    await expect(store.accept({ ...event, telegramUserId: "333" }, ["111"])).rejects.toMatchObject({ status: 409 });
    await expect(store.accept({ ...event, submission: { ...event.submission, name: "changed" } }, ["111"])).rejects.toMatchObject({ status: 409 });
  });
  it("rolls back both the event and earlier recipients when a later insert fails", async () => {
    await expect(store.accept(event, [null as unknown as string])).rejects.toThrow();
    expect((await pool.query("SELECT count(*)::integer AS count FROM website_delivery_events")).rows[0].count).toBe(0);
    expect((await pool.query("SELECT count(*)::integer AS count FROM website_deliveries")).rows[0].count).toBe(0);
    await expect(store.status(event.eventId)).rejects.toMatchObject({ status: 404 });
  });
  it("serializes conflicting concurrent payloads", async () => {
    const results = await Promise.allSettled([
      store.accept(event, ["111"]), store.accept({ ...event, enrollmentReference: "other" }, ["111"]),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
  });
  it("enforces durable rate limits atomically and rolls the window over", async () => {
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => store.limit("accept", 3)));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(3);
    await pool.query("UPDATE website_delivery_limits SET window_start=now()-interval '1 hour'");
    await expect(store.limit("accept", 3)).resolves.toBeUndefined();
  });
  it("claims once under concurrency, reclaims expired leases, and rejects stale completion", async () => {
    await store.accept(event, ["111"]);
    const claims = (await Promise.all([store.claim(event.eventId), store.claim(event.eventId)])).filter(Boolean);
    expect(claims).toHaveLength(1);
    const old = claims[0]!;
    expect((await store.status(event.eventId)).state).toBe("processing");
    expect((await store.pending(event.eventId)).pending).toBe(true);
    await pool.query("UPDATE website_deliveries SET lease_until=now()-interval '1 second',next_at=now()-interval '1 hour' WHERE id=$1", [old.id]);
    await ready();
    const fresh = (await store.claim(event.eventId))!;
    expect(fresh.id).toBe(old.id);
    expect(fresh.claim_token).not.toBe(old.claim_token);
    expect(fresh.part_attempts).toBe(2);
    expect(await store.finish(old, { messageId: 99 })).toBe(false);
    expect(await store.finish(fresh, { messageId: 100 })).toBe(true);
    expect((await store.status(event.eventId)).deliveries.find(row => row.deliveryId === fresh.id)?.messageIds).toEqual([100]);
  });
  it("continues other recipients after permanent failure and completes as partial failure", async () => {
    await store.accept(event, ["111", "222"]);
    const first = (await store.claim(event.eventId))!;
    await store.finish(first, { error: "telegram-403" });
    await ready(); const second = (await store.claim(event.eventId))!;
    await store.finish(second, { messageId: 20 });
    expect((await store.status(event.eventId)).state).toBe("processing");
    await ready(); const third = (await store.claim(event.eventId))!;
    await store.finish(third, { messageId: 30 });
    const status = await store.status(event.eventId);
    expect(status.state).toBe("partial-failure");
    expect(status.deliveries.filter(row => row.state === "sent")).toHaveLength(2);
    expect(status.deliveries.find(row => row.state === "failed")?.error).toBe("telegram-403");
    expect(await store.pending(event.eventId)).toEqual({ pending: false, retryAfterSeconds: 1 });
    await ready(); expect(await store.claim(event.eventId)).toBeNull();
  });
  it("honors rate-limit cooldown across jobs and stops retry exhaustion", async () => {
    await store.accept(event, ["111"]);
    const claim = (await store.claim(event.eventId))!;
    await store.finish(claim, { error: "telegram-rate-limited", retrySeconds: 120, cooldownSeconds: 120 });
    const secondId = randomUUID();
    await store.accept({ ...event, eventId: secondId }, ["111"]);
    expect(await store.claim(secondId)).toBeNull();
    expect((await store.pending(event.eventId)).retryAfterSeconds).toBeGreaterThanOrEqual(119);
    await ready();
    await pool.query("UPDATE website_deliveries SET next_at=now()-interval '1 hour',part_attempts=7 WHERE id=$1", [claim.id]);
    const last = (await store.claim(event.eventId))!;
    expect(last.id).toBe(claim.id);
    await store.finish(last, { error: "telegram-network", retrySeconds: 60 });
    expect((await store.status(event.eventId)).deliveries.find(row => row.deliveryId === claim.id)?.state).toBe("failed");
  });
  it("persists split-part progress and never reclaims already sent parts", async () => {
    await store.accept(event, []);
    await pool.query("UPDATE website_deliveries SET parts=$1::jsonb", [JSON.stringify([{ text: "one" }, { text: "two" }])]);
    const first = (await store.claim(event.eventId))!;
    await store.finish(first, { messageId: 101 });
    await pool.query("UPDATE website_deliveries SET next_at=now()-interval '1 second'");
    await ready();
    const second = (await store.claim(event.eventId))!;
    expect(second.next_part).toBe(1); expect(second.parts[0].messageId).toBe(101);
    expect(second.part_attempts).toBe(1);
    await store.finish(second, { messageId: 102 });
    expect((await store.status(event.eventId)).state).toBe("sent");
    expect((await store.status(event.eventId)).deliveries[0].messageIds).toEqual([101, 102]);
  });
  it("recovers only due unfinished work and supports keyset pagination", async () => {
    await store.accept(event, []);
    const greaterId = "f858af47-9168-420d-9323-bd48763c5af8";
    await store.accept({ ...event, eventId: greaterId }, []);
    expect(await store.recoveryPage(null)).toEqual([event.eventId, greaterId]);
    expect(await store.recoveryPage(event.eventId)).toEqual([greaterId]);
    const claim = (await store.claim(event.eventId))!;
    expect(await store.recoveryPage(null)).toEqual([greaterId]);
    await store.finish(claim, { error: "telegram-network", retrySeconds: 120 });
    expect(await store.recoveryPage(null)).toEqual([greaterId]);
    expect(await store.claim(event.eventId)).toBeNull();
  });
  it("cancels revoked visitor acceptance terminally while retaining staff notifications", async () => {
    const consent = new ConsentStore(pool);
    await consent.revoke(event.telegramUserId, 100);
    const service = new DeliveryService(store, { ...config, adminIds: ["111"] });
    await service.accept(event);
    const visitor = (await store.status(event.eventId)).deliveries.find(d => d.roles.includes("visitor"))!;
    expect(visitor).toMatchObject({ state: "cancelled", visitorOutcome: "cancelled", nextAttemptAt: null });
    await service.process(event.eventId);
    expect(send).toHaveBeenCalledTimes(1);
    expect((send as jest.Mock).mock.calls[0][1]).toBe("111");
    expect((await store.status(event.eventId)).state).toBe("partial-cancellation");
    expect(await store.recoveryPage(null)).toEqual([]);
    expect(await store.pending(event.eventId)).toEqual({ pending: false, retryAfterSeconds: 1 });
    await service.accept(event);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("cancels a split legacy delivery after revocation without reviving it on reconnect", async () => {
    await store.accept(event, []);
    await pool.query("UPDATE website_deliveries SET parts=$1::jsonb", [JSON.stringify([{ text: "one" }, { text: "two" }])]);
    const service = new DeliveryService(store, config), consent = service.consent;
    await service.process(event.eventId);
    await consent.revoke(event.telegramUserId, 1);
    await pool.query("UPDATE website_deliveries SET next_at=now()-interval '1 second'"); await ready();
    await service.process(event.eventId);
    expect(send).toHaveBeenCalledTimes(1);
    expect((await store.status(event.eventId))).toMatchObject({ version: 2, state: "cancelled", deliveries: [{ messageIds: [333] }] });
    const grant = await consent.candidate(event.telegramUserId, "a".repeat(64), new Date(Date.now()+590000));
    await consent.activate(grant);
    await ready(); await service.process(event.eventId);
    expect(send).toHaveBeenCalledTimes(1);
    const modern = { ...event, eventId: randomUUID(), consent: grant };
    await service.accept(modern); await ready(); await service.process(modern.eventId);
    expect(send).toHaveBeenCalledTimes(2);
    await consent.revoke(event.telegramUserId, 2);
    const stale = { ...modern, eventId: randomUUID() };
    await service.accept(stale);
    expect((await store.status(stale.eventId)).deliveries.find(d => d.roles.includes("visitor"))?.state).toBe("cancelled");
  });
  it("replaces only unsent merged visitor content and preserves claim fencing", async () => {
    await store.accept(event, [event.telegramUserId]);
    await pool.query("UPDATE website_deliveries SET parts=$1::jsonb", [JSON.stringify([{ text: "sent", messageId: 100 }, { text: "visitor tail" }])]);
    await pool.query("UPDATE website_deliveries SET next_part=1,part_attempts=5");
    const claim = (await store.claim(event.eventId))!;
    expect(await store.cancelVisitor({ ...claim, claim_token: randomUUID() })).toBeNull();
    const staff = (await store.cancelVisitor(claim))!;
    expect(staff.parts[0]).toEqual({ text: "sent", messageId: 100 });
    expect(staff.parts[1].text).toContain("Новая заявка");
    expect(staff.parts.map(p => p.text).join("")).not.toContain("Спасибо!");
    expect(staff.part_attempts).toBe(1);
    expect(staff.claim_token).not.toBe(claim.claim_token);
    expect(await store.finish(claim, { messageId: 999 })).toBe(false);
    expect(await store.cancelVisitor(staff)).toBeNull();
    await store.finish(staff, { messageId: 101 });
    expect((await store.status(event.eventId)).deliveries[0]).toMatchObject({ state: "sent", visitorOutcome: "cancelled", messageIds: [100,101] });
    expect(await store.claim(event.eventId)).toBeNull();
    expect((await store.status(event.eventId)).state).toBe("partial-cancellation");
  });
  it("uses a staff-only snapshot when merged consent is already revoked at acceptance", async () => {
    await store.accept(event, [event.telegramUserId], false);
    const claim = (await store.claim(event.eventId))!;
    expect(claim.visitor_cancelled).toBe(true);
    expect(claim.parts[0].text).toContain("Новая заявка");
    expect(claim.parts[0].text).not.toContain("Спасибо!");
    await store.finish(claim, { error: "telegram-403" });
    expect((await store.status(event.eventId)).deliveries[0]).toMatchObject({ state: "failed", visitorOutcome: "cancelled" });
  });
  it("observes revocation after claim and leaves unrelated staff work available", async () => {
    await store.accept(event, []);
    const claim = (await store.claim(event.eventId))!;
    const service = new DeliveryService(store, config);
    await service.consent.revoke(event.telegramUserId, 9);
    const original = store.claim.bind(store);
    store.claim = async () => claim;
    try { await service.process(event.eventId); } finally { store.claim = original; }
    expect(send).not.toHaveBeenCalled();
    expect((await store.status(event.eventId)).state).toBe("cancelled");
  });

  it("fences modern queued grants after revocation and keeps cancellation across recovery and reconnect", async () => {
    const service = new DeliveryService(store, { ...config, adminIds: [event.telegramUserId] });
    const grant = await service.consent.candidate(event.telegramUserId, "b".repeat(64), new Date(Date.now()+590000));
    await service.consent.activate(grant);
    const modern = { ...event, consent: grant };
    await service.accept(modern);
    await service.consent.revoke(event.telegramUserId, 10);
    (send as jest.Mock).mockResolvedValueOnce({ error: "temporary", retrySeconds: 1 });
    await service.process(event.eventId);
    expect((send as jest.Mock).mock.calls[0][2]).toContain("Новая заявка");
    expect((await store.status(event.eventId)).deliveries[0]).toMatchObject({ state: "retrying", visitorOutcome: "cancelled" });
    const fresh = await service.consent.candidate(event.telegramUserId, "c".repeat(64), new Date(Date.now()+590000));
    await service.consent.activate(fresh);
    await pool.query("UPDATE website_deliveries SET next_at=now()-interval '1 second'"); await ready();
    expect(await store.recoveryPage(null)).toEqual([event.eventId]);
    await service.accept(modern); // Immutable duplicate must retain its cancelled snapshot.
    const restarted = new DeliveryService(new DeliveryStore(pool), config);
    await restarted.process(event.eventId);
    expect((send as jest.Mock).mock.calls[1][2]).toContain("Новая заявка");
    expect((send as jest.Mock).mock.calls[1][2]).not.toContain("Спасибо!");
    expect((await store.status(event.eventId)).state).toBe("partial-cancellation");
    expect(await store.recoveryPage(null)).toEqual([]);
  });

});
