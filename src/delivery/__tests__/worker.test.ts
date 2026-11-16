import { webcrypto } from "crypto";
import worker, { WorkerEnv, QueueMessage } from "../worker";
import { event } from "./fixtures";

describe("Cloudflare delivery consumer", () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  const send = jest.fn();
  const env: WorkerEnv = { DELIVERY_QUEUE: { send }, DELIVERY_ENABLED: "true", PUBLISH_SECRET: "p".repeat(32),
    EXECUTION_SECRET: "e".repeat(32), BOT_BASE_URL: "https://bot.example.test" };
  beforeAll(() => { if (!global.crypto) Object.defineProperty(global, "crypto", { value: webcrypto, configurable: true }); });
  beforeEach(() => { global.fetch = fetchMock; jest.resetAllMocks(); send.mockResolvedValue(undefined); });
  afterAll(() => { global.fetch = originalFetch; });
  const message = (body: unknown): QueueMessage => ({ body, ack: jest.fn(), retry: jest.fn() });
  function request(value: unknown = { version: 1, jobId: event.eventId }, headers: Record<string, string> = {}) {
    return new Request("https://worker.example.test/publish", { method: "POST", headers: { authorization: `Bearer ${env.PUBLISH_SECRET}`, ...headers }, body: JSON.stringify(value) });
  }
  it("authenticates and publishes opaque references only", async () => {
    expect((await worker.fetch(request(), env)).status).toBe(202);
    expect(send).toHaveBeenCalledWith({ version: 1, jobId: event.eventId }, { delaySeconds: 0 });
    expect((await worker.fetch(request({ version: 1, jobId: event.eventId, delaySeconds: 120 }), env)).status).toBe(202);
    expect(send).toHaveBeenLastCalledWith({ version: 1, jobId: event.eventId }, { delaySeconds: 120 });
  });
  it("rejects unauthorized, disabled, wrong-method and oversized publication", async () => {
    expect((await worker.fetch(request({}, { authorization: "wrong" }), env)).status).toBe(401);
    expect((await worker.fetch(new Request("https://worker.example.test/publish", { method: "POST" }), env)).status).toBe(401);
    expect((await worker.fetch(request(), { ...env, DELIVERY_ENABLED: "false" })).status).toBe(503);
    expect((await worker.fetch(new Request("https://worker.example.test/"), env)).status).toBe(405);
    expect((await worker.fetch(request({ text: "x".repeat(1025) }), env)).status).toBe(413);
    expect(send).not.toHaveBeenCalled();
  });
  it("rejects malformed or nonopaque tasks without publication", async () => {
    for (const value of [null, [], {}, { version: 2, jobId: event.eventId }, { version: 1, jobId: "bad" },
      { version: 1, jobId: event.eventId, name: "private" }, { version: 1, jobId: event.eventId, delaySeconds: -1 },
      { version: 1, jobId: event.eventId, delaySeconds: 43201 }, { version: 1, recoverAfter: null }]) {
      expect((await worker.fetch(request(value), env)).status).toBeGreaterThanOrEqual(400);
    }
    expect(send).not.toHaveBeenCalled();
  });
  it("does not acknowledge unfinished work until its delayed task is accepted", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ pending: true, retryAfterSeconds: 120 }) });
    const msg = message({ version: 1, jobId: event.eventId });
    await worker.queue({ messages: [msg] }, env);
    expect(send).toHaveBeenCalledWith(msg.body, { delaySeconds: 120 });
    expect(msg.ack).toHaveBeenCalledTimes(1); expect(msg.retry).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][0]).toBe(`${env.BOT_BASE_URL}/api/website/enrollment-confirmations/process`);
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe(`Bearer ${env.EXECUTION_SECRET}`);
    send.mockRejectedValue(new Error("queue down"));
    const failed = message(msg.body); await worker.queue({ messages: [failed] }, env);
    expect(failed.ack).not.toHaveBeenCalled(); expect(failed.retry).toHaveBeenCalledWith({ delaySeconds: 60 });
  });
  it("acknowledges terminal work and retries infrastructure/protocol failures", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ pending: false }) });
    const done = message({ version: 1, jobId: event.eventId }); await worker.queue({ messages: [done] }, env);
    expect(done.ack).toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
    for (const response of [{ ok: false }, { ok: true, json: async () => ({ pending: "unknown" }) }]) {
      fetchMock.mockResolvedValue(response);
      const failed = message(done.body); await worker.queue({ messages: [failed] }, env);
      expect(failed.retry).toHaveBeenCalled(); expect(failed.ack).not.toHaveBeenCalled();
    }
    for (const body of [null, [], { version: 1, recoverAfter: "invalid" }]) {
      const invalid = message(body); await worker.queue({ messages: [invalid] }, env);
      expect(invalid.retry).toHaveBeenCalled();
    }
  });
  it("processes and recovers with the redirect modes supported by Cloudflare", async () => {
    for (const body of [{ version: 1, jobId: event.eventId }, { version: 1, recoverAfter: null }]) {
      fetchMock.mockImplementation(async (_url: string, options: RequestInit) => {
        if (options.redirect !== "follow" && options.redirect !== "manual") throw new TypeError("Invalid redirect value");
        return Response.json("jobId" in body ? { pending: false } : { nextCursor: null });
      });
      const msg = message(body);
      await worker.queue({ messages: [msg] }, env);
      expect(msg.ack).toHaveBeenCalledTimes(1);
      expect(msg.retry).not.toHaveBeenCalled();
      expect(fetchMock.mock.calls.at(-1)[1].redirect).toBe("manual");
    }
  });
  it("retries redirect responses without acknowledging or forwarding the request", async () => {
    for (const status of [301, 302, 303, 307, 308]) {
      fetchMock.mockReset();
      fetchMock.mockResolvedValue(new Response(null, { status, headers: { Location: "https://other.example.test" } }));
      const msg = message({ version: 1, jobId: event.eventId });
      await worker.queue({ messages: [msg] }, env);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][1].redirect).toBe("manual");
      expect(msg.ack).not.toHaveBeenCalled();
      expect(msg.retry).toHaveBeenCalledWith({ delaySeconds: 60 });
    }
  });
  it("runs paginated daily recovery without dropping continuation", async () => {
    await worker.scheduled({}, env);
    expect(send).toHaveBeenCalledWith({ version: 1, recoverAfter: null });
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ nextCursor: event.eventId }) });
    const first = message({ version: 1, recoverAfter: null }); await worker.queue({ messages: [first] }, env);
    expect(send).toHaveBeenCalledWith({ version: 1, recoverAfter: event.eventId });
    expect(first.ack).toHaveBeenCalled();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ nextCursor: null }) });
    const last = message({ version: 1, recoverAfter: event.eventId }); await worker.queue({ messages: [last] }, env);
    expect(last.ack).toHaveBeenCalled();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ nextCursor: "invalid" }) });
    const invalid = message(first.body); await worker.queue({ messages: [invalid] }, env);
    expect(invalid.retry).toHaveBeenCalled(); expect(invalid.ack).not.toHaveBeenCalled();
  });
  it("fails closed when secrets or endpoint isolation is incomplete", async () => {
    for (const changes of [{ EXECUTION_SECRET: "short" }, { PUBLISH_SECRET: undefined }, { EXECUTION_SECRET: undefined },
      { EXECUTION_SECRET: env.PUBLISH_SECRET }, { BOT_BASE_URL: "http://bot.example.test" }]) {
      await expect(worker.scheduled({}, { ...env, ...changes } as WorkerEnv)).rejects.toThrow("worker-disabled");
    }
    send.mockRejectedValue(new Error("queue down"));
    expect((await worker.fetch(request(), env)).status).toBe(503);
  });
});
