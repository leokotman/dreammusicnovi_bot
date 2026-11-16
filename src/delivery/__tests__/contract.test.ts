import { aggregate, destinations, jobId, messageParts, validateEvent } from "../contract";
import { readConfig } from "../config";
import { configEnv, event } from "./fixtures";

describe("event validation", () => {
  it("canonicalizes only the UUID and missing optional comment", () => {
    expect(validateEvent({ ...event, eventId: event.eventId.toUpperCase() })).toEqual(event);
    const { comment, ...submission } = event.submission;
    expect(validateEvent({ ...event, submission }).submission.comment).toBe("");
    expect(jobId(event.eventId)).toBe(event.eventId);
  });
  it.each([
    null, [], "text", { ...event, extra: "unknown" }, { ...event, eventId: "invalid" },
    { ...event, telegramUserId: 123 }, { ...event, telegramUserId: "-123" },
    { ...event, templateVersion: "future" }, { ...event, submittedAt: "2026-02-30T14:00:00.000Z" },
    { ...event, submittedAt: "bad" }, { ...event, submittedAt: "2026-11-08" },
    { ...event, enrollmentReference: " " }, { ...event, submission: null },
    { ...event, submission: { ...event.submission, other: "bad" } },
    { ...event, submission: { ...event.submission, comment: "x".repeat(501) } },
    { ...event, submission: { ...event.submission, comment: null } },
    { ...event, submission: { ...event.submission, name: "unsafe\u0000" } },
  ])("rejects malformed input %#", value => { expect(() => validateEvent(value)).toThrow(); });
  it("preserves decimal IDs beyond the safe integer range", () => {
    expect(validateEvent({ ...event, telegramUserId: "9007199254740993" }).telegramUserId).toBe("9007199254740993");
  });
});

describe("templates and aggregation", () => {
  it("deduplicates staff and combines roles if a visitor is staff", () => {
    const result = destinations(event, [event.telegramUserId, "222", "222"]);
    expect(result).toHaveLength(2);
    expect(result[0].roles).toEqual(["visitor", "admin"]);
    expect(result[0].parts[0].text).toContain(event.enrollmentReference);
    expect(result[0].parts[0].text).toContain(event.submittedAt);
    expect(result[0].parts[0].text).toContain(event.submission.name);
    expect(result[1].roles).toEqual(["admin"]);
    expect(result[1].parts[0].text).toContain(event.submission.comment);
  });
  it("omits empty comments and staff metadata for an ordinary visitor", () => {
    const [visitor, admin] = destinations({ ...event, submission: { ...event.submission, comment: "" } }, ["222"]);
    expect(visitor.parts[0].text).not.toContain("Комментарий:");
    expect(visitor.parts[0].text).not.toContain(event.submittedAt);
    expect(admin.parts[0].text).toContain(event.submittedAt);
  });
  it("splits without losing text or breaking emoji", () => {
    const text = "a".repeat(3999) + "🎵".repeat(3000);
    const parts = messageParts(text);
    expect(parts.map(part => part.text).join("")).toBe(text);
    expect(parts.every(part => part.text.length <= 4000 && !/[\uD800-\uDBFF]$/.test(part.text))).toBe(true);
    expect(messageParts("")).toEqual([]);
  });
  it.each([
    [["pending", "pending"], "accepted"], [["sent", "sent"], "sent"],
    [["failed", "failed"], "failed"], [["sent", "failed"], "partial-failure"],
    [["sent", "retrying"], "processing"], [["failed", "pending"], "processing"],
  ])("aggregates %j", (states, result) => expect(aggregate(states)).toBe(result));
});

describe("fail-closed configuration", () => {
  it("validates settings and deduplicates destinations", () => {
    const result = readConfig(configEnv());
    expect(result.adminIds).toEqual(["111", "222"]);
    expect(result.apiSecrets).toHaveLength(1);
    const env = configEnv();
    env.WEBSITE_DELIVERY_API_SECRET_PREVIOUS = "o".repeat(32);
    env.WEBSITE_DELIVERY_EXECUTION_SECRET_PREVIOUS = "q".repeat(32);
    expect(readConfig(env).apiSecrets).toHaveLength(2);
    expect(readConfig(env).executionSecrets).toHaveLength(2);
  });
  it.each([
    ["WEBSITE_DELIVERY_ENABLED", undefined], ["BOT_TOKEN", undefined], ["WEBSITE_DELIVERY_API_SECRET", "short"],
    ["WEBSITE_DELIVERY_BOT_ID", "8759057565"], ["WEBSITE_NOTIFICATION_CHAT_IDS", "@username"],
    ["BOT_DELIVERY_DATABASE_URL", "https://invalid"], ["BOT_DELIVERY_DATABASE_URL", "postgresql://["],
    ["DELIVERY_QUEUE_PUBLISH_URL", "https://["], ["DELIVERY_QUEUE_PUBLISH_URL", "http://test"],
    ["WEBSITE_DELIVERY_EXECUTION_SECRET", "a".repeat(32)], ["DELIVERY_QUEUE_PUBLISH_SECRET", "a".repeat(32)],
    ["DELIVERY_QUEUE_PUBLISH_SECRET", "e".repeat(32)],
  ])("rejects invalid %s", (key, value) => { expect(() => readConfig({ ...configEnv(), [key as string]: value })).toThrow(); });
});


describe("consent grant contract", () => {
  const { validateGrant } = require("../contract") as typeof import("../contract");
  const grant = { id: "e858af47-9168-420d-9323-bd48763c5af8", userId: "123456789", generation: "0" };
  it("preserves explicit grants and normalizes their IDs", () => {
    expect(validateGrant({ ...grant, id: grant.id.toUpperCase() })).toEqual(grant);
    expect(validateEvent({ ...event, consent: grant }).consent).toEqual(grant);
    expect(validateGrant({ ...grant, generation: "9223372036854775807" })).toMatchObject({ generation: "9223372036854775807" });
  });
  it.each([null, {}, { ...grant, extra: true }, { ...grant, userId: 123 }, { ...grant, userId: "0" },
    { ...grant, generation: 0 }, { ...grant, generation: "01" }, { ...grant, generation: "-1" },
    { ...grant, generation: "9223372036854775808" }, { ...grant, id: "invalid" }])("rejects malformed grants %#", value => {
    expect(() => validateGrant(value)).toThrow();
  });
  it("rejects enrollment recipient/grant mismatches", () => {
    expect(() => validateEvent({ ...event, consent: { ...grant, userId: "111" } })).toThrow();
  });
  it("distinguishes cancellation from transport failure", () => {
    expect(aggregate(["cancelled"])).toBe("cancelled");
    expect(aggregate(["sent", "cancelled"])).toBe("partial-cancellation");
    expect(aggregate(["failed", "cancelled"])).toBe("partial-failure");
    expect(aggregate(["cancelled", "retrying"])).toBe("processing");
  });
});
