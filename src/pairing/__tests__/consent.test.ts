import { Pool } from "pg";
import { createHash, randomUUID } from "crypto";
import { readFileSync } from "fs";
import path from "path";
import { ConsentStore } from "../consent";
import { PairingService } from "../service";
import { attemptHash, codeHash } from "../protocol";

// Explicit opt-in, isolated schema, synthetic identities; never read runtime dotenv.
const scratchUrl = process.env.DELIVERY_TEST_DATABASE_URL;
const integration = scratchUrl ? describe : describe.skip;
integration("durable pairing consent (PostgreSQL)", () => {
  let pool: Pool, store: ConsentStore;
  let schema: string;
  const user = "12345678";
  const hash = () => createHash("sha256").update(randomUUID()).digest("hex");
  const expiry = () => new Date(Date.now() + 590000);
  const createCandidate = (userId: string, attempt: string, expiresAt: Date, createdAt = new Date(Date.now() + 5)) =>
    store.candidate(userId, attempt, expiresAt, createdAt);
  // Move only the synthetic authority timestamp to represent waiting, without real sleeps.
  async function pastRevocationWindow(userId = user) {
    await pool.query("UPDATE website_consent_users SET revoked_at=clock_timestamp()-interval '31 seconds' WHERE user_id=$1", [userId]);
  }
  beforeAll(async () => {
    const target = new URL(scratchUrl!);
    if (target.hostname !== "127.0.0.1" || !/^\/delivery_scratch_[a-z_]+$/.test(target.pathname) || target.search) {
      throw new Error("Consent tests require an explicit loopback delivery_scratch_* database without overrides");
    }
    schema = `consent_test_${randomUUID().replace(/-/g, "")}`;
    pool = new Pool({ connectionString: scratchUrl, max: 12, options: `-c search_path=${schema}` });
    await pool.query(`CREATE SCHEMA ${schema}`);
    await pool.query(readFileSync(path.resolve(__dirname, "../../../migrations/001_website_delivery.sql"), "utf8"));
    const eventId = randomUUID();
    await pool.query("INSERT INTO website_delivery_events(id,payload) VALUES ($1,$2::jsonb)", [eventId, JSON.stringify({ synthetic: true })]);
    await pool.query(`INSERT INTO website_deliveries(id,event_id,destination,roles,parts)
      VALUES ($1,$2,$3,$4,$5::jsonb)`, [randomUUID(), eventId, user, ["visitor"], JSON.stringify([{ text: "synthetic message" }])]);
    const before = await pool.query("SELECT * FROM website_deliveries");
    await pool.query(readFileSync(path.resolve(__dirname, "../../../migrations/002_website_consent.sql"), "utf8"));
    expect((await pool.query("SELECT * FROM website_deliveries")).rows).toEqual(before.rows);
    expect((await pool.query("SELECT * FROM website_delivery_events")).rows).toMatchObject([{ id: eventId, payload: { synthetic: true } }]);
    store = new ConsentStore(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE website_consent_revocations,website_consent_grants,website_consent_users");
  });
  afterAll(async () => { if (pool) await pool.end(); });

  it("separates candidate from activated consent and permits idempotent activation", async () => {
    const attempt = hash();
    const grant = await createCandidate(user, attempt, expiry());
    expect(grant).toMatchObject({ userId: user, generation: "0" });
    expect(await store.allows(user, grant)).toBe(false);
    expect(await store.allows(user)).toBe(true); // Existing OIDC remains compatible.
    await store.activate(grant);
    const first = await pool.query("SELECT activated_at,expires_at FROM website_consent_grants");
    await store.activate(grant);
    expect((await pool.query("SELECT activated_at,expires_at FROM website_consent_grants")).rows).toEqual(first.rows);
    expect(await store.allows(user, grant)).toBe(true);
    expect(await store.allows("87654321", grant)).toBe(false);
    expect(await store.allows(user, { ...grant, id: randomUUID() })).toBe(false);
    expect(await store.allows(user, { ...grant, generation: "1" })).toBe(false);
    expect(await createCandidate(user, attempt, expiry())).toEqual(grant);
  });
  it("preserves the original expiry and first identity under concurrent Starts", async () => {
    const attempt = hash();
    const results = await Promise.allSettled([
      createCandidate(user, attempt, expiry()), createCandidate("87654321", attempt, expiry()),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toMatchObject([{ reason: { status: 409 } }]);
    const winner = results.find(r => r.status === "fulfilled")!;
    if (winner.status !== "fulfilled") throw new Error("missing winner");
    const before = (await pool.query("SELECT expires_at FROM website_consent_grants")).rows;
    const retries = await Promise.all(Array.from({ length: 8 }, () => createCandidate(winner.value.userId, attempt, expiry())));
    expect(retries.every(g => g.id === winner.value.id)).toBe(true);
    expect((await pool.query("SELECT expires_at FROM website_consent_grants")).rows).toEqual(before);
  });
  it("enforces five distinct attempts in a sliding ten-minute window under concurrency", async () => {
    const results = await Promise.allSettled(Array.from({ length: 9 }, () => createCandidate(user, hash(), expiry())));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(5);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(4);
    const first = results.find(r => r.status === "fulfilled")!;
    if (first.status !== "fulfilled") throw new Error("missing grant");
    const attempt = (await pool.query("SELECT attempt_hash FROM website_consent_grants WHERE id=$1", [first.value.id])).rows[0].attempt_hash;
    await expect(createCandidate(user, attempt, expiry())).resolves.toEqual(first.value);
    await pool.query("UPDATE website_consent_grants SET created_at=now()-interval '11 minutes'");
    await expect(createCandidate(user, hash(), expiry())).resolves.toMatchObject({ generation: "0" });
  });
  it("rejects expired/overlong candidates and expired activation without creating consent", async () => {
    for (const date of [new Date(Date.now() - 1000), new Date(Date.now() + 660000)]) {
      await expect(createCandidate(user, hash(), date)).rejects.toMatchObject({ status: 410 });
    }
    expect((await pool.query("SELECT * FROM website_consent_grants")).rowCount).toBe(0);
    const attempt = hash();
    const grant = await createCandidate(user, attempt, expiry());
    await pool.query(`UPDATE website_consent_grants SET created_at=now()-interval '20 minutes',expires_at=now()-interval '1 minute'`);
    await expect(createCandidate(user, attempt, expiry())).rejects.toMatchObject({ status: 410 });
    await expect(store.activate(grant)).rejects.toMatchObject({ status: 409 });
    await expect(store.activate({ ...grant, id: randomUUID() })).rejects.toMatchObject({ status: 409 });
    expect(await store.allows(user, grant)).toBe(false);
  });
  it("revokes pending/active/legacy grants permanently without affecting another account", async () => {
    const attempt = hash();
    const pending = await createCandidate(user, attempt, expiry());
    const active = await createCandidate(user, hash(), expiry());
    const other = await createCandidate("87654321", hash(), expiry());
    await store.activate(active); await store.activate(other);
    expect(await store.revoke(user, 100)).toBe(true);
    expect(await store.allows(user)).toBe(false);
    expect(await store.allows(user, active)).toBe(false);
    expect(await store.allows("87654321", other)).toBe(true);
    await expect(store.activate(pending)).rejects.toMatchObject({ status: 409 });
    await expect(createCandidate(user, attempt, expiry())).rejects.toMatchObject({ status: 409 });
    await pastRevocationWindow();
    const fresh = await createCandidate(user, hash(), expiry());
    expect(fresh.generation).toBe("1");
    await store.activate(fresh);
    expect(await store.allows(user, fresh)).toBe(true);
    expect(await store.allows(user, active)).toBe(false);
    expect(await store.allows(user)).toBe(false);
    expect(await store.revoke(user, 100)).toBe(false);
    expect(await store.allows(user, fresh)).toBe(true);
    // Delayed, distinct block events fail closed; duplicates do not revoke again.
    expect(await store.revoke(user, 99)).toBe(true);
    expect(await store.allows(user, fresh)).toBe(false);
    expect(await store.revoke(user, 99)).toBe(false);
    expect((await pool.query("SELECT generation FROM website_consent_users WHERE user_id=$1", [user])).rows[0].generation).toBe("2");
  });
  it("serializes revocation with activation and candidate creation", async () => {
    const grant = await createCandidate(user, hash(), expiry());
    await Promise.allSettled([store.activate(grant), store.revoke(user, 1)]);
    expect(await store.allows(user, grant)).toBe(false);
    const attempt = hash();
    const [candidate] = await Promise.allSettled([createCandidate(user, attempt, expiry(), new Date()), store.revoke(user, 2)]);
    if (candidate.status === "fulfilled") {
      expect(candidate.value.generation).toBe("1");
      await expect(store.activate(candidate.value)).rejects.toMatchObject({ status: 409 });
    } else { expect(candidate.reason).toMatchObject({ status: 409 }); }
    expect(await store.allows(user)).toBe(false);
  });
  it("deduplicates concurrent revocation and persists tombstones across store restarts", async () => {
    expect((await Promise.all(Array.from({ length: 8 }, () => store.revoke(user, 10)))).filter(Boolean)).toHaveLength(1);
    const restarted = new ConsentStore(pool);
    expect(await restarted.allows(user)).toBe(false);
    expect(await restarted.revoke(user, 10)).toBe(false);
    await pastRevocationWindow();
    const fresh = await restarted.candidate(user, hash(), expiry(), new Date(Date.now()+5));
    expect(fresh.generation).toBe("1");
    await restarted.activate(fresh);
    expect(await store.allows(user, fresh)).toBe(true);
  });
  it("rolls back failed writes and releases connections", async () => {
    await expect(createCandidate(user, "invalid hash", expiry())).rejects.toThrow();
    expect((await pool.query("SELECT * FROM website_consent_users")).rowCount).toBe(0);
    await expect(store.revoke(user, -1)).rejects.toThrow();
    expect((await pool.query("SELECT * FROM website_consent_users")).rowCount).toBe(0);
    expect(await store.allows(user)).toBe(true);
  });

  it("fences definitive blocked delivery without letting old failures revoke a reconnection", async () => {
    const grant = await createCandidate(user, hash(), expiry());
    await store.blockedDelivery(user, grant); // A pending candidate is not a sending authorization.
    await store.blockedDelivery(user, { ...grant, userId: "87654321" });
    await store.blockedDelivery(user, { ...grant, id: randomUUID() });
    await store.activate(grant);
    await Promise.all(Array.from({ length: 5 }, () => store.blockedDelivery(user, grant)));
    expect(await store.allows(user, grant)).toBe(false);
    await pastRevocationWindow();
    const fresh = await createCandidate(user, hash(), expiry()); expect(fresh.generation).toBe("1");
    await store.activate(fresh);
    await store.blockedDelivery(user, grant); await store.blockedDelivery(user);
    expect(await store.allows(user, fresh)).toBe(true);
    await store.blockedDelivery("87654321");
    expect(await store.allows("87654321")).toBe(false);
    await pastRevocationWindow("87654321");
    const otherFresh = await createCandidate("87654321", hash(), expiry());
    await store.activate(otherFresh); await store.blockedDelivery("87654321");
    expect(await store.allows("87654321", otherFresh)).toBe(true);
  });

  it("rejects previously unopened links issued before account-wide revocation", async () => {
    const createdAt = new Date(Date.now() - 10000);
    await store.revoke(user, 501);
    await expect(createCandidate(user, hash(), new Date(createdAt.getTime()+599000), createdAt)).rejects.toMatchObject({ status: 409 });
    await pastRevocationWindow();
    const fresh = await createCandidate(user, hash(), expiry());
    await store.activate(fresh); expect(await store.allows(user, fresh)).toBe(true);
    for (const created of [new Date(Date.now()+60000), new Date(Date.now()-600000), new Date(Date.now()+595000)]) {
      await expect(createCandidate(user, hash(), expiry(), created)).rejects.toMatchObject({ status: 410 });
    }
  });

  it("rejects an unopened old link when the website clock is twenty seconds ahead", async () => {
    await store.revoke(user, 701);
    const revokedAt = (await pool.query("SELECT revoked_at FROM website_consent_users WHERE user_id=$1", [user])).rows[0].revoked_at as Date;
    // In real time this link predates disconnect by five seconds; the website adds twenty seconds.
    const createdAt = new Date(revokedAt.getTime() - 5000 + 20000);
    const expiresAt = new Date(createdAt.getTime() + 300000);
    await expect(createCandidate(user, hash(), expiresAt, createdAt)).rejects.toMatchObject({ status: 409, code: "consent-revoked" });
    expect((await pool.query("SELECT * FROM website_consent_grants")).rowCount).toBe(0);
    expect(await store.allows(user)).toBe(false);
  });
  it("rejects the entire creation-time uncertainty window, including its boundary", async () => {
    await store.revoke(user, 702);
    const revokedAt = new Date(Date.now() - 60000);
    await pool.query("UPDATE website_consent_users SET revoked_at=$1 WHERE user_id=$2", [revokedAt, user]);
    for (const offset of [0, 15000, 29999, 30000]) {
      const createdAt = new Date(revokedAt.getTime() + offset);
      await expect(createCandidate(user, hash(), new Date(createdAt.getTime()+600000), createdAt)).rejects.toMatchObject({ code: "consent-revoked" });
    }
    const createdAt = new Date(revokedAt.getTime() + 30001);
    const fresh = await createCandidate(user, hash(), new Date(createdAt.getTime()+600000), createdAt);
    await store.activate(fresh); expect(await store.allows(user, fresh)).toBe(true);
  });

  it("accepts a full ten-minute lifetime with a twenty-second positive website clock skew", async () => {
    const createdAt = new Date(Date.now() + 20000), expiresAt = new Date(createdAt.getTime() + 600000);
    const grant = await createCandidate(user, hash(), expiresAt, createdAt);
    await store.activate(grant); expect(await store.allows(user, grant)).toBe(true);
  });

  it("coordinates real consent with callback retries, first-identity isolation and revocation during binding", async () => {
    const attempt = "dmn1_" + Buffer.alloc(32, 5).toString("base64url");
    const createdAt = new Date(Date.now()-1000), expiresAt = new Date(Date.now()+590000);
    const website = { reserve: jest.fn().mockResolvedValue({ createdAt, expiresAt }), bind: jest.fn().mockResolvedValue(undefined) };
    const pairing = new PairingService(store, website as never, "999:synthetic-token");
    const message = { from: { id: Number(user), is_bot: false, username: "example_user" }, chat: { id: Number(user), type: "private" } };
    const code = await pairing.start(attempt, message);
    expect(await pairing.start(attempt, message)).toBe(code);
    const [registered, grant] = website.bind.mock.calls[0];
    expect(registered).toMatchObject({ attempt, codeHash: codeHash(attempt, code) });
    expect(await store.allows(user, grant)).toBe(false);
    const persisted = (await pool.query("SELECT expires_at FROM website_consent_grants WHERE attempt_hash=$1", [attemptHash(attempt)])).rows;
    expect(persisted).toEqual([{ expires_at: expiresAt }]);
    await expect(pairing.start(attempt, { from: { ...message.from, id: 87654321 }, chat: { ...message.chat, id: 87654321 } })).rejects.toMatchObject({ status: 409 });
    website.bind.mockImplementationOnce(async () => { await store.revoke(user, 601); });
    await expect(pairing.start(attempt, message)).rejects.toMatchObject({ status: 409 });
    await expect(store.activate(grant)).rejects.toMatchObject({ status: 409 });
    expect(await store.allows(user)).toBe(false);
  });
});
