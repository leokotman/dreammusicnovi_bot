import type { VercelRequest, VercelResponse } from "@vercel/node";
import handler from "../../../api/webhook";
import { createBot } from "../../bot";
import { ensureSavedContentLoaded } from "../../content/loader";
import { ensureAdminsLoaded } from "../../config/admins";
import { updateBotCommands } from "../../botCommands";

const secret = "a".repeat(32), setupSecret = "s".repeat(32);
const getWebhookInfo = jest.fn(), setWebhook = jest.fn(), handleUpdate = jest.fn();
jest.mock("../../bot", () => ({ createBot: jest.fn(() => ({ telegram: { getWebhookInfo, setWebhook }, handleUpdate })) }));
jest.mock("../../content/loader", () => ({ ensureSavedContentLoaded: jest.fn() }));
jest.mock("../../config/admins", () => ({ ensureAdminsLoaded: jest.fn(), getAdminIds: jest.fn(() => ["123"]) }));
jest.mock("../../config/env", () => ({ env: { TEACHER_USER_ID: "123", DEV_ID: undefined, ADMIN_IDS: ["456"] } }));
jest.mock("../../botCommands", () => ({ updateBotCommands: jest.fn() }));

function response() {
  const res = { setHeader: jest.fn(), status: jest.fn(), send: jest.fn(), end: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
}
function request(overrides: Record<string, unknown> = {}) {
  return { method: "POST", headers: { "x-telegram-bot-api-secret-token": secret }, query: {}, body: { update_id: 123 }, ...overrides } as unknown as VercelRequest;
}
const original = { ...process.env };
beforeEach(() => {
  jest.clearAllMocks();
  process.env.TELEGRAM_WEBHOOK_SECRET = secret;
  process.env.WEBHOOK_SET_SECRET = setupSecret;
  process.env.TELEGRAM_WEBHOOK_URL = "https://bot.example.test/api/webhook";
  getWebhookInfo.mockResolvedValue({ url: "https://bot.example.test/api/webhook" });
  handleUpdate.mockResolvedValue(undefined);
  (ensureSavedContentLoaded as jest.Mock).mockResolvedValue(undefined);
});
afterAll(() => { process.env = original; });

it("rejects forged updates before content, admin or bot work", async () => {
  const res = response();
  await handler(request({ headers: { "x-telegram-bot-api-secret-token": "f".repeat(32) } }), res as unknown as VercelResponse);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
  expect(createBot).not.toHaveBeenCalled();
  expect(ensureSavedContentLoaded).not.toHaveBeenCalled();
  expect(ensureAdminsLoaded).not.toHaveBeenCalled();
  expect(handleUpdate).not.toHaveBeenCalled();
});
it("fails closed when webhook auth is unconfigured", async () => {
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
  const res = response();
  await handler(request(), res as unknown as VercelResponse);
  expect(res.status).toHaveBeenCalledWith(503);
  expect(handleUpdate).not.toHaveBeenCalled();
});
it.each([undefined, null, [], "text", {}, { update_id: -1 }, { update_id: 1.1 }, { update_id: "123" }, { update_id: Number.MAX_SAFE_INTEGER + 1 }])("rejects malformed authenticated updates %#", async body => {
  const res = response();
  await handler(request({ body }), res as unknown as VercelResponse);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(handleUpdate).not.toHaveBeenCalled();
});
it("processes authenticated updates through existing content/admin handling", async () => {
  for (let i = 0; i < 2; i++) {
    const res = response();
    await handler(request(), res as unknown as VercelResponse);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.end).toHaveBeenCalled();
  }
  expect(createBot).toHaveBeenCalledTimes(1);
  expect(handleUpdate).toHaveBeenCalledTimes(2);
  expect(handleUpdate).toHaveBeenCalledWith({ update_id: 123 });
  expect(ensureAdminsLoaded).toHaveBeenCalledWith(["123", "456"]);
});
it("returns retryable failure without logging update bodies or Telegram errors", async () => {
  const spy = jest.spyOn(console, "error").mockImplementation(() => {});
  handleUpdate.mockRejectedValue(new Error("raw-token-and-personal-content"));
  try {
    const res = response();
    await handler(request(), res as unknown as VercelResponse);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(spy).toHaveBeenCalledWith("telegram-webhook-failure");
    expect(JSON.stringify(spy.mock.calls)).not.toContain("raw-token");
  } finally { spy.mockRestore(); }
});
it.each(["PUT", "DELETE", "GET"])("rejects unsupported %s without touching Telegram", async method => {
  const res = response();
  await handler(request({ method }), res as unknown as VercelResponse);
  expect(res.status).toHaveBeenCalledWith(405);
  expect(res.setHeader).toHaveBeenCalledWith("Allow", "POST");
  expect(handleUpdate).not.toHaveBeenCalled();
  expect(getWebhookInfo).not.toHaveBeenCalled();
});
it("rejects ambiguous or wrong setup credentials", async () => {
  for (const set of ["wrong", [setupSecret]]) {
    const res = response();
    await handler(request({ method: "GET", query: { set } }), res as unknown as VercelResponse);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(getWebhookInfo).not.toHaveBeenCalled();
  }
});
it("requires webhook auth configuration before an authorized setup", async () => {
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
  const res = response();
  await handler(request({ method: "GET", query: { set: setupSecret } }), res as unknown as VercelResponse);
  expect(res.status).toHaveBeenCalledWith(503);
  expect(getWebhookInfo).not.toHaveBeenCalled();
});
it("updates the existing webhook explicitly and preserves normal bot commands", async () => {
  const res = response();
  await handler(request({ method: "GET", query: { set: setupSecret }, headers: { host: "attacker.test" } }), res as unknown as VercelResponse);
  expect(setWebhook).toHaveBeenCalledWith("https://bot.example.test/api/webhook", { secret_token: secret, drop_pending_updates: false });
  expect(updateBotCommands).toHaveBeenCalledWith({ getWebhookInfo, setWebhook }, ["123"]);
  expect(res.status).toHaveBeenCalledWith(200);
});
it("redacts setup failures", async () => {
  getWebhookInfo.mockRejectedValue(new Error("private-url-and-token"));
  const res = response();
  await handler(request({ method: "GET", query: { set: setupSecret } }), res as unknown as VercelResponse);
  expect(res.status).toHaveBeenCalledWith(503);
  expect(res.send).toHaveBeenCalledWith("Webhook setup failed");
});
