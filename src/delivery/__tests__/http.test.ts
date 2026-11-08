import type { VercelRequest, VercelResponse } from "@vercel/node";
import { authenticated, createHandler, Operation } from "../http";
import { ApiError } from "../contract";
import { DeliveryService } from "../service";
import { config, event } from "./fixtures";

describe("authenticated website API", () => {
  const active = { store: { limit: jest.fn(), status: jest.fn() }, accept: jest.fn(), process: jest.fn(), recover: jest.fn() };
  const getService = jest.fn(() => active as unknown as DeliveryService);
  let response: { setHeader: jest.Mock; status: jest.Mock; json: jest.Mock };
  beforeEach(() => {
    jest.clearAllMocks();
    active.store.limit.mockResolvedValue(undefined);
    active.store.status.mockResolvedValue({ state: "sent" });
    active.accept.mockResolvedValue({ created: true, result: { jobId: event.eventId, state: "accepted" } });
    active.process.mockResolvedValue({ pending: false, retryAfterSeconds: 1 });
    active.recover.mockResolvedValue({ nextCursor: null });
    response = { setHeader: jest.fn(), status: jest.fn(), json: jest.fn() };
    response.status.mockReturnValue(response);
  });
  async function call(operation: Operation, changes: Record<string, unknown> = {}, settings = () => config) {
    const execution = ["process", "recover"].includes(operation);
    const req = { method: operation === "status" ? "GET" : "POST",
      headers: { authorization: `Bearer ${execution ? config.executionSecrets[0] : config.apiSecrets[0]}`, "content-type": "application/json" },
      query: { jobId: event.eventId }, body: operation === "accept" ? event : { jobId: event.eventId }, ...changes };
    await createHandler(operation, settings, getService)(req as unknown as VercelRequest, response as unknown as VercelResponse);
    return { status: response.status.mock.calls.at(-1)![0], body: response.json.mock.calls.at(-1)![0] };
  }
  it("checks rotated secrets with exact bearer syntax", () => {
    expect(authenticated(`Bearer ${"old"}`, ["new", "old"])).toBe(true);
    expect(authenticated("bearer old", ["old"])).toBe(false);
    expect(authenticated(["Bearer old"], ["old"])).toBe(false);
    expect(authenticated("x".repeat(513), ["old"])).toBe(false);
  });
  it("authenticates before constructing the database service", async () => {
    expect((await call("accept", { headers: {} })).status).toBe(401);
    expect(getService).not.toHaveBeenCalled();
    expect(response.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
  });
  it("rejects website access to execution and unsupported methods", async () => {
    expect((await call("process", { headers: { authorization: `Bearer ${config.apiSecrets[0]}` } })).status).toBe(401);
    jest.clearAllMocks();
    expect((await call("accept", { method: "GET" })).status).toBe(405);
    expect(response.setHeader).toHaveBeenCalledWith("Allow", "POST");
  });
  it("returns stable acceptance, duplicate and status responses", async () => {
    expect((await call("accept")).status).toBe(202);
    expect(active.accept).toHaveBeenCalledWith(event);
    jest.clearAllMocks(); active.accept.mockResolvedValue({ created: false, result: { state: "sent" } });
    expect((await call("accept", { body: JSON.stringify(event) })).status).toBe(200);
    jest.clearAllMocks();
    expect((await call("status")).body).toEqual({ state: "sent" });
  });
  it.each([
    [{ headers: { authorization: `Bearer ${config.apiSecrets[0]}` } }, 415],
    [{ body: "{" }, 400], [{ body: undefined }, 400], [{ body: "x".repeat(16385) }, 413],
    [{ body: { ...event, telegramUserId: 123 } }, 400],
  ])("rejects invalid JSON requests %#", async (changes, expected) => expect((await call("accept", changes)).status).toBe(expected));
  it("handles circular bodies without exposing details", async () => {
    const circular: Record<string, unknown> = {}; circular.self = circular;
    expect((await call("accept", { body: circular })).status).toBe(400);
  });
  it("processes and validates recovery cursors", async () => {
    expect((await call("process")).body.pending).toBe(false);
    jest.clearAllMocks();
    expect((await call("recover", { body: {} })).body).toEqual({ nextCursor: null });
    expect(active.recover).toHaveBeenCalledWith(null);
    jest.clearAllMocks(); await call("recover", { body: { after: event.eventId } });
    expect(active.recover).toHaveBeenCalledWith(event.eventId);
    jest.clearAllMocks(); expect((await call("recover", { body: { after: "bad" } })).status).toBe(400);
  });
  it("redacts infrastructure errors and reports rate limits", async () => {
    active.store.limit.mockRejectedValue(new Error("postgresql://private-credential"));
    expect(await call("accept")).toEqual({ status: 503, body: { error: "delivery-unavailable" } });
    jest.clearAllMocks(); active.store.limit.mockRejectedValue(new ApiError(429, "rate-limited"));
    expect((await call("accept")).status).toBe(429);
    expect(response.setHeader).toHaveBeenCalledWith("Retry-After", "60");
    jest.clearAllMocks();
    expect((await call("accept", {}, () => { throw new ApiError(503, "delivery-disabled"); })).body).toEqual({ error: "delivery-disabled" });
  });
});
