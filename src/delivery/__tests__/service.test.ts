import { DeliveryService } from "../service";
import { DeliveryStore } from "../store";
import { publish, send } from "../transport";
import { config, event } from "./fixtures";
jest.mock("../transport", () => ({ publish: jest.fn(), send: jest.fn() }));
const publishMock = publish as jest.Mock;
const sendMock = send as jest.Mock;

describe("delivery orchestration", () => {
  const store = { accept: jest.fn(), status: jest.fn(), pending: jest.fn(), claim: jest.fn(), finish: jest.fn(), recoveryPage: jest.fn() };
  const service = new DeliveryService(store as unknown as DeliveryStore, config);
  beforeEach(() => {
    jest.resetAllMocks();
    store.accept.mockResolvedValue(true);
    store.status.mockResolvedValue({ state: "accepted" });
    store.pending.mockResolvedValue({ pending: true, retryAfterSeconds: 1 });
    store.claim.mockResolvedValue(null);
    store.finish.mockResolvedValue(true);
    publishMock.mockResolvedValue(undefined);
    sendMock.mockResolvedValue({ messageId: 123 });
  });
  it("retains durable acceptance across queue outages and can republish a duplicate", async () => {
    publishMock.mockRejectedValue(new Error("offline"));
    expect(await service.accept(event)).toEqual({ created: true, result: { jobId: event.eventId, state: "accepted" } });
    expect(store.accept).toHaveBeenCalledWith(event, config.adminIds);
    store.accept.mockResolvedValue(false);
    expect((await service.accept(event)).created).toBe(false);
    expect(publishMock).toHaveBeenCalledTimes(2);
  });
  it("does not publish unsaved or completed events", async () => {
    store.accept.mockRejectedValue(new Error("db down"));
    await expect(service.accept(event)).rejects.toThrow("db down");
    expect(publishMock).not.toHaveBeenCalled();
    store.accept.mockResolvedValue(false); store.pending.mockResolvedValue({ pending: false, retryAfterSeconds: 1 });
    await service.accept(event);
    expect(publishMock).not.toHaveBeenCalled();
  });
  it("sends the claimed part only and persists the result", async () => {
    const claim = { destination: "111", parts: [{ text: "recorded", messageId: 100 }, { text: "next" }], next_part: 1, part_attempts: 1 };
    store.claim.mockResolvedValue(claim);
    await service.process(event.eventId);
    expect(sendMock).toHaveBeenCalledWith(config, "111", "next", 1);
    expect(store.finish).toHaveBeenCalledWith(claim, { messageId: 123 });
  });
  it("does not send without a claim or after crash-recovery exhaustion", async () => {
    await service.process(event.eventId); expect(sendMock).not.toHaveBeenCalled();
    store.claim.mockResolvedValue({ part_attempts: 9 });
    await service.process(event.eventId);
    expect(sendMock).not.toHaveBeenCalled();
    expect(store.finish).toHaveBeenCalledWith({ part_attempts: 9 }, { error: "attempts-exhausted" });
  });
  it("paginates recovery and propagates publication failure for a safe retry", async () => {
    const ids = Array.from({ length: 100 }, (_, index) => String(index));
    store.recoveryPage.mockResolvedValue(ids);
    expect(await service.recover(null)).toEqual({ nextCursor: "99" });
    expect(publishMock).toHaveBeenCalledTimes(100);
    store.recoveryPage.mockResolvedValue([]);
    expect(await service.recover("99")).toEqual({ nextCursor: null });
    store.recoveryPage.mockResolvedValue([event.eventId]); publishMock.mockRejectedValue(new Error("offline"));
    await expect(service.recover(null)).rejects.toThrow("offline");
  });
});
