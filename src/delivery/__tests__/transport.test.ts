import { publish, send } from "../transport";
import { config, event } from "./fixtures";

describe("delivery transports", () => {
  const fetchMock = jest.fn();
  const original = global.fetch;
  beforeEach(() => { global.fetch = fetchMock; fetchMock.mockReset(); });
  afterAll(() => { global.fetch = original; });
  const response = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });
  it("publishes only an opaque reference and bounded delay", async () => {
    fetchMock.mockResolvedValue(response(202, {}));
    await publish(config, event.eventId);
    expect(fetchMock.mock.calls[0][0]).toBe(config.publisherUrl);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ version: 1, jobId: event.eventId, delaySeconds: 0 });
    fetchMock.mockResolvedValue(response(503, {}));
    await expect(publish(config, event.eventId, 60)).rejects.toThrow("queue-unavailable");
  });
  it("sends literal text without parse_mode and disables previews", async () => {
    fetchMock.mockResolvedValue(response(200, { ok: true, result: { message_id: 123 } }));
    expect(await send(config, "111", "<b>literal</b>", 1)).toEqual({ messageId: 123 });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ chat_id: "111", text: "<b>literal</b>", link_preview_options: { is_disabled: true } });
  });
  it.each([400, 401, 403, 404])("stops permanent Telegram %i", async status => {
    fetchMock.mockResolvedValue(response(status, { error_code: status, description: "private data" }));
    expect(await send(config, "111", "text", 1)).toEqual({ error: `telegram-${status}` });
  });
  it.each([undefined, -1, 0, "secret", 120])("honors rate-limit instructions safely: %s", async seconds => {
    fetchMock.mockResolvedValue(response(429, { parameters: { retry_after: seconds } }));
    expect(await send(config, "111", "text", 1)).toEqual({ error: "telegram-rate-limited", retrySeconds: seconds === 120 ? 120 : 60, cooldownSeconds: seconds === 120 ? 120 : 60 });
  });
  it("retries malformed, transient and network errors without leaking details", async () => {
    fetchMock.mockResolvedValue(response(502, {}));
    expect(await send(config, "111", "text", 1)).toMatchObject({ error: "telegram-unavailable", retrySeconds: expect.any(Number) });
    fetchMock.mockRejectedValue(new Error(`secret ${config.botToken}`));
    expect(await send(config, "111", "text", 8)).toMatchObject({ error: "telegram-network", retrySeconds: expect.any(Number) });
    fetchMock.mockResolvedValue(response(200, { ok: true, result: { message_id: "bad" } }));
    expect(await send(config, "111", "text", 1)).toMatchObject({ error: "telegram-unavailable" });
  });
});
