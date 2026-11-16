import { DeliveryService } from "../service";
import { DeliveryStore } from "../store";
import { publish, send } from "../transport";
import { config, event } from "./fixtures";
jest.mock("../transport", () => ({ publish: jest.fn(), send: jest.fn() }));
const publishMock = publish as jest.Mock;
const sendMock = send as jest.Mock;

describe("delivery orchestration", () => {
  const store = { accept: jest.fn(), status: jest.fn(), pending: jest.fn(), claim: jest.fn(), finish: jest.fn(), cancelVisitor: jest.fn(), recoveryPage: jest.fn() };
  const consent = { allows: jest.fn(), blockedDelivery: jest.fn() };
  const service = new DeliveryService(store as unknown as DeliveryStore, config, consent as never);
  beforeEach(() => {
    jest.resetAllMocks();
    consent.allows.mockResolvedValue(true);
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
    expect(store.accept).toHaveBeenCalledWith(event, config.adminIds, true);
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
    const claim = { roles: ["admin"], destination: "111", parts: [{ text: "recorded", messageId: 100 }, { text: "next" }], next_part: 1, part_attempts: 1 };
    store.claim.mockResolvedValue(claim);
    await service.process(event.eventId);
    expect(sendMock).toHaveBeenCalledWith(config, "111", "next", 1);
    expect(store.finish).toHaveBeenCalledWith(claim, { messageId: 123 });
  });
  it("does not send without a claim or after crash-recovery exhaustion", async () => {
    await service.process(event.eventId); expect(sendMock).not.toHaveBeenCalled();
    store.claim.mockResolvedValue({ roles: ["admin"], part_attempts: 9 });
    await service.process(event.eventId);
    expect(sendMock).not.toHaveBeenCalled();
    expect(store.finish).toHaveBeenCalledWith({ roles: ["admin"], part_attempts: 9 }, { error: "attempts-exhausted" });
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
  it("checks consent at acceptance and before every visitor part, including legacy jobs", async () => {
    consent.allows.mockResolvedValue(false);
    await service.accept(event);
    expect(store.accept).toHaveBeenCalledWith(event, config.adminIds, false);
    const claim = { roles: ["visitor"], visitor_cancelled: null, payload: event, part_attempts: 1 };
    store.claim.mockResolvedValue(claim);
    store.cancelVisitor.mockResolvedValue(null);
    await service.process(event.eventId);
    expect(consent.allows).toHaveBeenLastCalledWith(event.telegramUserId, undefined);
    expect(store.cancelVisitor).toHaveBeenCalledWith(claim);
    expect(sendMock).not.toHaveBeenCalled();
    expect(store.finish).not.toHaveBeenCalled();
  });
  it("sends staff-only replacement for revoked merged destinations without rechecking visitor consent", async () => {
    const claim = { roles: ["visitor", "admin"], payload: event, part_attempts: 3 };
    const staff = { ...claim, visitor_cancelled: true, destination: event.telegramUserId,
      parts: [{ text: "staff only" }], next_part: 0, part_attempts: 1 };
    store.claim.mockResolvedValue(claim); consent.allows.mockResolvedValue(false);
    store.cancelVisitor.mockResolvedValue(staff);
    await service.process(event.eventId);
    expect(sendMock).toHaveBeenCalledWith(config, event.telegramUserId, "staff only", 1);
    store.claim.mockResolvedValue(staff);
    consent.allows.mockClear();
    await service.process(event.eventId);
    expect(consent.allows).not.toHaveBeenCalled();
  });
  it("fails closed on consent outages and checks modern grant identity", async () => {
    const modern = { ...event, consent: { id: event.eventId, userId: event.telegramUserId, generation: "0" } };
    store.claim.mockResolvedValue({ roles: ["visitor"], payload: modern });
    consent.allows.mockRejectedValue(new Error("unavailable"));
    await expect(service.process(event.eventId)).rejects.toThrow("unavailable");
    await expect(service.accept(modern)).rejects.toThrow("unavailable");
    expect(consent.allows).toHaveBeenCalledWith(event.telegramUserId, modern.consent);
    expect(sendMock).not.toHaveBeenCalled();
    expect(store.accept).not.toHaveBeenCalled();
  });
  it("sends authorized visitor content after checking the exact grant", async () => {
    const claim = { roles: ["visitor"], payload: event, destination: event.telegramUserId,
      parts: [{ text: "visitor" }], next_part: 0, part_attempts: 1 };
    store.claim.mockResolvedValue(claim);
    await service.process(event.eventId);
    expect(sendMock).toHaveBeenCalledWith(config, event.telegramUserId, "visitor", 1);
    expect(store.cancelVisitor).not.toHaveBeenCalled();
  });


  it("revokes definitive blocked visitors and cancels their unsent parts", async () => {
    const modern = { ...event, consent: { id: event.eventId, userId: event.telegramUserId, generation: "0" } };
    const claim = { roles: ["visitor"], payload: modern, destination: event.telegramUserId,
      parts: [{ text: "visitor" }], next_part: 0, part_attempts: 1 };
    store.claim.mockResolvedValue(claim); sendMock.mockResolvedValue({ error: "telegram-403", blocked: true });
    store.cancelVisitor.mockResolvedValue(null);
    await service.process(event.eventId);
    expect(consent.blockedDelivery).toHaveBeenCalledWith(event.telegramUserId, modern.consent);
    expect(store.cancelVisitor).toHaveBeenCalledWith(claim); expect(store.finish).not.toHaveBeenCalled();
    const staff = { ...claim, roles: ["visitor", "admin"], visitor_cancelled: true };
    store.cancelVisitor.mockResolvedValue(staff); await service.process(event.eventId);
    expect(store.finish).toHaveBeenCalledWith(staff, { error: "telegram-403", blocked: true });
    consent.blockedDelivery.mockClear(); store.claim.mockResolvedValue(staff); await service.process(event.eventId);
    store.claim.mockResolvedValue({ ...staff, roles: ["admin"], visitor_cancelled: false }); await service.process(event.eventId);
    expect(consent.blockedDelivery).not.toHaveBeenCalled();
  });
  it("leaves a blocked visitor recoverable if durable revocation fails", async () => {
    store.claim.mockResolvedValue({ roles: ["visitor"], payload: event, destination: event.telegramUserId,
      parts: [{ text: "visitor" }], next_part: 0, part_attempts: 1 });
    sendMock.mockResolvedValue({ error: "telegram-403", blocked: true });
    consent.blockedDelivery.mockRejectedValue(new Error("authority unavailable"));
    await expect(service.process(event.eventId)).rejects.toThrow("authority unavailable");
    expect(store.finish).not.toHaveBeenCalled(); expect(store.cancelVisitor).not.toHaveBeenCalled();
  });
});
