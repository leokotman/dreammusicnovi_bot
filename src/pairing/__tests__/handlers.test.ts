import type { Context } from "telegraf";
import { pairingMiddleware, DISCONNECT } from "../handlers";
const attempt = "dmn1_" + Buffer.alloc(32, 1).toString("base64url");
describe("authenticated Telegram pairing middleware", () => {
  const revoke = jest.fn(), start = jest.fn(), next = jest.fn();
  const deps = { enabled: jest.fn(), deliveryEnabled: jest.fn(), botId: () => "999", consent: () => ({ revoke }) as never, pairing: () => ({ start }) as never };
  const handle = pairingMiddleware(deps);
  function ctx(text?: string, overrides: object = {}): Context {
    return { update: { update_id: 100 }, from: { id: 123, is_bot: false, username: "example_user" }, chat: { id: 123, type: "private" },
      botInfo: { username: "example_bot" }, message: text === undefined ? undefined : { text }, reply: jest.fn().mockResolvedValue(undefined),
      answerCbQuery: jest.fn().mockResolvedValue(undefined), ...overrides } as unknown as Context;
  }
  beforeEach(() => { jest.resetAllMocks(); deps.enabled.mockReturnValue(true); deps.deliveryEnabled.mockReturnValue(true); revoke.mockResolvedValue(true); start.mockResolvedValue("123456"); });
  it.each([undefined, "/start", "/start other", "/help", "question", "/start@different_bot " + attempt, "/disconnect@different_bot"])("preserves ordinary bot interaction: %s", async text => {
    await handle(ctx(text), next); expect(next).toHaveBeenCalledTimes(1); expect(start).not.toHaveBeenCalled(); expect(revoke).not.toHaveBeenCalled();
  });
  it("ignores invalid update IDs, nontext messages and unrelated callbacks", async () => {
    for (const update_id of [-1, 1.1, undefined]) await handle(ctx("/disconnect", { update: { update_id } }), next);
    await handle(ctx(undefined, { message: { photo: [] }, update: { update_id: 1, callback_query: { data: "other" } } }), next);
    await handle(ctx(undefined, { update: { update_id: 1, callback_query: { game_short_name: "game" } } }), next);
    expect(revoke).not.toHaveBeenCalled(); expect(next).toHaveBeenCalledTimes(5);
  });
  it("sends code only for recognized fresh pairing and never calls ordinary handlers", async () => {
    const context = ctx("/start@EXAMPLE_BOT " + attempt);
    await handle(context, next);
    expect(start).toHaveBeenCalledWith(attempt, { from: context.from, chat: context.chat });
    expect(context.reply).toHaveBeenCalledWith(expect.stringContaining("123456")); expect(next).not.toHaveBeenCalled(); expect(revoke).not.toHaveBeenCalled();
  });
  it("consumes disabled and malformed pairing without falling into question forwarding", async () => {
    deps.enabled.mockReturnValue(false); const disabled = ctx("/start " + attempt); await handle(disabled, next);
    expect(disabled.reply).toHaveBeenCalledWith(expect.stringContaining("пока недоступно"));
    deps.enabled.mockReturnValue(true); const bad = ctx("/start dmn1_bad"); await handle(bad, next);
    expect(bad.reply).toHaveBeenCalledWith(expect.stringContaining("недействительна"));
    const extra = ctx("/start " + attempt + " extra text"); await handle(extra, next);
    expect(extra.reply).toHaveBeenCalledWith(expect.stringContaining("недействительна"));
    expect(start).not.toHaveBeenCalled(); expect(next).not.toHaveBeenCalled();
  });
  it("redacts pairing errors and explains the missing username fallback", async () => {
    for (const error of [new Error("username-required"), new Error("private secret"), "private secret"]) {
      start.mockRejectedValueOnce(error); const context = ctx("/start " + attempt); await handle(context, next);
      expect(context.reply).toHaveBeenCalledWith(expect.stringContaining(error instanceof Error && error.message === "username-required" ? "Добавьте имя" : "Не удалось"));
      expect(context.reply).not.toHaveBeenCalledWith(expect.stringContaining("private secret"));
    }
  });
  it("explains that an ambiguous post-disconnect link needs waiting and a fresh attempt", async () => {
    start.mockRejectedValue(new Error("consent-revoked"));
    const context = ctx("/start " + attempt);
    await handle(context, next);
    expect(context.reply).toHaveBeenCalledWith(expect.stringContaining("Подождите немного и создайте новую ссылку"));
  });
  it("logs only a fixed failure marker when pairing fails", async () => {
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      start.mockRejectedValue(new Error("private callback URL, token, code and identity"));
      await handle(ctx("/start " + attempt), next);
      expect(log.mock.calls).toEqual([["telegram-pairing-failed"]]);
    } finally { log.mockRestore(); }
  });
  it("revokes command/menu actions using update identity even without a username", async () => {
    const command = ctx("/disconnect", { from: { id: 123, is_bot: false } }); await handle(command, next);
    expect(revoke).toHaveBeenCalledWith("123", 100); expect(command.reply).toHaveBeenCalledWith(expect.stringContaining("Сайт отключён"));
    const callback = ctx(undefined, { update: { update_id: 101, callback_query: { data: DISCONNECT } } }); await handle(callback, next);
    expect(callback.answerCbQuery).toHaveBeenCalledTimes(1); expect(revoke).toHaveBeenLastCalledWith("123", 101);
    expect(next).not.toHaveBeenCalled(); expect(start).not.toHaveBeenCalled();
  });
  it("still revokes when Telegram can no longer acknowledge an old callback query", async () => {
    const context = ctx(undefined, { update: { update_id: 101, callback_query: { data: DISCONNECT } } });
    (context.answerCbQuery as jest.Mock).mockRejectedValue(new Error("query too old with private data"));
    await handle(context, next);
    expect(revoke).toHaveBeenCalledWith("123", 101);
    expect(context.reply).toHaveBeenCalledWith(expect.stringContaining("Сайт отключён"));
  });
  it("does not expose a disabled control or revoke a forged/nonprivate identity", async () => {
    deps.enabled.mockReturnValue(false); await handle(ctx("/disconnect"), next); expect(revoke).not.toHaveBeenCalled();
    deps.enabled.mockReturnValue(true);
    for (const overrides of [{ from: undefined }, { from: { id: 123, is_bot: true } }, { from: { id: -1, is_bot: false } },
      { from: { id: 1.1, is_bot: false } }, { chat: undefined }, { chat: { id: 123, type: "group" } }, { chat: { id: 456, type: "private" } }]) {
      const context = ctx("/disconnect", overrides); await handle(context, next);
      expect(context.reply).toHaveBeenCalledWith(expect.stringContaining("только в личном"));
    }
    expect(revoke).not.toHaveBeenCalled();
  });
  function membership(status = "kicked", overrides: object = {}) {
    return { from: { id: 123, is_bot: false }, chat: { id: 123, type: "private" }, new_chat_member: { status, user: { id: 999, is_bot: true } }, ...overrides };
  }
  it("revokes authenticated private block updates independently of website/candidate availability or the controls switch", async () => {
    deps.enabled.mockReturnValue(false);
    const context = ctx(undefined, { update: { update_id: 100, my_chat_member: membership() } });
    await handle(context, next); expect(revoke).toHaveBeenCalledWith("123", 100); expect(context.reply).not.toHaveBeenCalled(); expect(start).not.toHaveBeenCalled();
    await handle(context, next); expect(revoke).toHaveBeenCalledTimes(2); // Store deduplicates authenticated update IDs.
  });
  it("never restores consent on unblock and ignores unrelated membership identities", async () => {
    for (const event of [membership("member"), membership("left"), membership("kicked", { from: { id: 456, is_bot: false } }),
      membership("kicked", { new_chat_member: { status: "kicked", user: { id: 998, is_bot: true } } }),
      membership("kicked", { new_chat_member: { status: "kicked", user: { id: 999, is_bot: false } } })]) {
      await handle(ctx(undefined, { update: { update_id: 100, my_chat_member: event } }), next);
    }
    deps.deliveryEnabled.mockReturnValue(false);
    await handle(ctx(undefined, { update: { update_id: 100, my_chat_member: membership() } }), next);
    expect(revoke).not.toHaveBeenCalled(); expect(start).not.toHaveBeenCalled();
  });
  it("propagates revocation and reply failures so updates remain retryable, without claiming success", async () => {
    revoke.mockRejectedValue(new Error("db down")); const context = ctx("/disconnect");
    await expect(handle(context, next)).rejects.toThrow("db down"); expect(context.reply).not.toHaveBeenCalled();
    await expect(handle(ctx(undefined, { update: { update_id: 100, my_chat_member: membership() } }), next)).rejects.toThrow("db down");
    const failed = ctx("/start " + attempt); (failed.reply as jest.Mock).mockRejectedValue(new Error("offline"));
    await expect(handle(failed, next)).rejects.toThrow("offline");
  });
});
