import type { Telegram, Telegraf } from "telegraf";
import { configureWebhook, setupAuthorized, webhookAuthorization } from "../webhook";
import { launchPolling } from "../polling";

const secret = "a".repeat(32);
describe("webhook authentication", () => {
  it("accepts only an exact configured header", () => {
    expect(webhookAuthorization(secret, secret)).toBe(200);
    expect(setupAuthorized(secret, secret)).toBe(true);
    expect(setupAuthorized(secret, "wrong")).toBe(false);
  });
  it.each([undefined, null, "", "short", " ".repeat(32), "a".repeat(257), [secret]])("fails closed for invalid secret %#", value => {
    expect(webhookAuthorization(value, secret)).toBe(503);
  });
  it.each([undefined, null, "", "a".repeat(33), "b".repeat(32), [secret], `${secret},${secret}`, "é".repeat(32)])("rejects missing, ambiguous or forged headers %#", value => {
    expect(webhookAuthorization(secret, value)).toBe(403);
  });
});

describe("explicit webhook configuration", () => {
  const getWebhookInfo = jest.fn(), setWebhook = jest.fn();
  const telegram = { getWebhookInfo, setWebhook } as unknown as Telegram;
  beforeEach(() => { jest.clearAllMocks(); setWebhook.mockResolvedValue(true); });
  it("preserves the existing URL, pending updates, subscriptions and concurrency", async () => {
    getWebhookInfo.mockResolvedValue({ url: "https://bot.example.test/api/webhook", max_connections: 15,
      allowed_updates: ["message", "callback_query", "chat_member", "my_chat_member"] });
    await configureWebhook(telegram, secret, "https://wrong.example.test/api/webhook");
    expect(setWebhook).toHaveBeenCalledWith("https://bot.example.test/api/webhook", {
      secret_token: secret, drop_pending_updates: false, max_connections: 15,
      allowed_updates: ["message", "callback_query", "chat_member", "my_chat_member"],
    });
  });
  it("adds block updates without removing restricted subscriptions", async () => {
    getWebhookInfo.mockResolvedValue({ url: "https://bot.example.test/api/webhook", allowed_updates: ["message", "message_reaction"] });
    await configureWebhook(telegram, secret, undefined);
    expect(setWebhook.mock.calls[0][1].allowed_updates).toEqual(["message", "message_reaction", "my_chat_member"]);
  });
  it.each([undefined, []])("preserves Telegram's default subscription %#", async allowed_updates => {
    getWebhookInfo.mockResolvedValue({ url: "", allowed_updates });
    await configureWebhook(telegram, secret, "https://new.example.test/api/webhook");
    expect(setWebhook).toHaveBeenCalledWith("https://new.example.test/api/webhook", {
      secret_token: secret, drop_pending_updates: false,
    });
  });
  it("rejects an unconfigured secret before contacting Telegram", async () => {
    await expect(configureWebhook(telegram, undefined, undefined)).rejects.toThrow("webhook-unconfigured");
    expect(getWebhookInfo).not.toHaveBeenCalled();
  });
  it.each([undefined, "http://test/api/webhook", "https://user:pass@test/api/webhook", "https://test/wrong", "https://test/api/webhook#x", "https://test/api/webhook?x=secret", "invalid"])("rejects unsafe initial URL %#", async url => {
    getWebhookInfo.mockResolvedValue({ url: "" });
    await expect(configureWebhook(telegram, secret, url)).rejects.toThrow();
    expect(setWebhook).not.toHaveBeenCalled();
  });
  it("does not replace an existing incompatible URL", async () => {
    getWebhookInfo.mockResolvedValue({ url: "https://test/different" });
    await expect(configureWebhook(telegram, secret, "https://test/api/webhook")).rejects.toThrow();
    expect(setWebhook).not.toHaveBeenCalled();
  });
  it("propagates Telegram failure without silently changing mode", async () => {
    getWebhookInfo.mockRejectedValue(new Error("unavailable"));
    await expect(configureWebhook(telegram, secret, undefined)).rejects.toThrow("unavailable");
    expect(setWebhook).not.toHaveBeenCalled();
  });
});

describe("polling mode guard", () => {
  it("refuses to delete an active webhook", async () => {
    const bot = { telegram: { getWebhookInfo: jest.fn().mockResolvedValue({ url: "https://test/api/webhook" }) }, launch: jest.fn() };
    await expect(launchPolling(bot as unknown as Telegraf)).rejects.toThrow("active-webhook-polling-refused");
    expect(bot.launch).not.toHaveBeenCalled();
  });
  it("starts polling only after proving the webhook is absent", async () => {
    const bot = { telegram: { getWebhookInfo: jest.fn().mockResolvedValue({ url: "" }) }, launch: jest.fn().mockResolvedValue(undefined) };
    await launchPolling(bot as unknown as Telegraf);
    expect(bot.launch).toHaveBeenCalledWith();
  });
  it("does not start polling when the inspection fails", async () => {
    const bot = { telegram: { getWebhookInfo: jest.fn().mockRejectedValue(new Error("unavailable")) }, launch: jest.fn() };
    await expect(launchPolling(bot as unknown as Telegraf)).rejects.toThrow();
    expect(bot.launch).not.toHaveBeenCalled();
  });
});
