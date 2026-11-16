import { Pool } from "pg";
import { createHash, randomUUID } from "crypto";
import { readFileSync } from "fs";
import path from "path";
import { ConsentStore } from "../consent";

// Explicit opt-in, isolated schema, synthetic identities; never read runtime dotenv.
const scratchUrl = process.env.DELIVERY_TEST_DATABASE_URL;
const integration = scratchUrl ? describe : describe.skip;
integration("durable pairing consent (PostgreSQL)", () => {
  let pool: Pool, store: ConsentStore;
  let schema: string;
  const user = "12345678";
  const hash = () => createHash("sha256").update(randomUUID()).digest("hex");
  const expiry = () => new Date(Date.now() + 590000);
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
    const grant = await store.candidate(user, attempt, expiry());
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
    expect(await store.candidate(user, attempt, expiry())).toEqual(grant);
  });
  it("preserves the original expiry and first identity under concurrent Starts", async () => {
    const attempt = hash();
    const results = await Promise.allSettled([
      store.candidate(user, attempt, expiry()), store.candidate("87654321", attempt, expiry()),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toMatchObject([{ reason: { status: 409 } }]);
    const winner = results.find(r => r.status === "fulfilled")!;
    if (winner.status !== "fulfilled") throw new Error("missing winner");
    const before = (await pool.query("SELECT expires_at FROM website_consent_grants")).rows;
    const retries = await Promise.all(Array.from({ length: 8 }, () => store.candidate(winner.value.userId, attempt, expiry())));
    expect(retries.every(g => g.id === winner.value.id)).toBe(true);
    expect((await pool.query("SELECT expires_at FROM website_consent_grants")).rows).toEqual(before);
  });
  it("enforces five distinct attempts in a sliding ten-minute window under concurrency", async () => {
    const results = await Promise.allSettled(Array.from({ length: 9 }, () => store.candidate(user, hash(), expiry())));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(5);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(4);
    const first = results.find(r => r.status === "fulfilled")!;
    if (first.status !== "fulfilled") throw new Error("missing grant");
    const attempt = (await pool.query("SELECT attempt_hash FROM website_consent_grants WHERE id=$1", [first.value.id])).rows[0].attempt_hash;
    await expect(store.candidate(user, attempt, expiry())).resolves.toEqual(first.value);
    await pool.query("UPDATE website_consent_grants SET created_at=now()-interval '11 minutes'");
    await expect(store.candidate(user, hash(), expiry())).resolves.toMatchObject({ generation: "0" });
  });
  it("rejects expired/overlong candidates and expired activation without creating consent", async () => {
    for (const date of [new Date(Date.now() - 1000), new Date(Date.now() + 660000)]) {
      await expect(store.candidate(user, hash(), date)).rejects.toMatchObject({ status: 410 });
    }
    expect((await pool.query("SELECT * FROM website_consent_grants")).rowCount).toBe(0);
    const attempt = hash();
    const grant = await store.candidate(user, attempt, expiry());
    await pool.query(`UPDATE website_consent_grants SET created_at=now()-interval '20 minutes',expires_at=now()-interval '1 minute'`);
    await expect(store.candidate(user, attempt, expiry())).rejects.toMatchObject({ status: 410 });
    await expect(store.activate(grant)).rejects.toMatchObject({ status: 409 });
    await expect(store.activate({ ...grant, id: randomUUID() })).rejects.toMatchObject({ status: 409 });
    expect(await store.allows(user, grant)).toBe(false);
  });
  it("revokes pending/active/legacy grants permanently without affecting another account", async () => {
    const attempt = hash();
    const pending = await store.candidate(user, attempt, expiry());
    const active = await store.candidate(user, hash(), expiry());
    const other = await store.candidate("87654321", hash(), expiry());
    await store.activate(active); await store.activate(other);
    expect(await store.revoke(user, 100)).toBe(true);
    expect(await store.allows(user)).toBe(false);
    expect(await store.allows(user, active)).toBe(false);
    expect(await store.allows("87654321", other)).toBe(true);
    await expect(store.activate(pending)).rejects.toMatchObject({ status: 409 });
    await expect(store.candidate(user, attempt, expiry())).rejects.toMatchObject({ status: 409 });
    const fresh = await store.candidate(user, hash(), expiry());
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
    const grant = await store.candidate(user, hash(), expiry());
    await Promise.allSettled([store.activate(grant), store.revoke(user, 1)]);
    expect(await store.allows(user, grant)).toBe(false);
    const attempt = hash();
    const [candidate] = await Promise.all([store.candidate(user, attempt, expiry()), store.revoke(user, 2)]);
    if (candidate.generation === "1") {
      await expect(store.activate(candidate)).rejects.toMatchObject({ status: 409 });
    } else {
      expect(candidate.generation).toBe("2");
      await store.activate(candidate);
      expect(await store.allows(user, candidate)).toBe(true);
    }
    expect(await store.allows(user)).toBe(false);
  });
  it("deduplicates concurrent revocation and persists tombstones across store restarts", async () => {
    expect((await Promise.all(Array.from({ length: 8 }, () => store.revoke(user, 10)))).filter(Boolean)).toHaveLength(1);
    const restarted = new ConsentStore(pool);
    expect(await restarted.allows(user)).toBe(false);
    expect(await restarted.revoke(user, 10)).toBe(false);
    const fresh = await restarted.candidate(user, hash(), expiry());
    expect(fresh.generation).toBe("1");
    await restarted.activate(fresh);
    expect(await store.allows(user, fresh)).toBe(true);
  });
  it("rolls back failed writes and releases connections", async () => {
    await expect(store.candidate(user, "invalid hash", expiry())).rejects.toThrow();
    expect((await pool.query("SELECT * FROM website_consent_users")).rowCount).toBe(0);
    await expect(store.revoke(user, -1)).rejects.toThrow();
    expect((await pool.query("SELECT * FROM website_consent_users")).rowCount).toBe(0);
    expect(await store.allows(user)).toBe(true);
  });
});
