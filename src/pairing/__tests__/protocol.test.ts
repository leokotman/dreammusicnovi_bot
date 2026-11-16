import { attemptHash, codeHash, pairingCode, privateIdentity, validAttempt } from "../protocol";
const attempt = `dmn1_${Buffer.alloc(32, 7).toString("base64url")}`;
const botToken = "9101311802:synthetic-test-token";
const identity = { from: { id: 123, is_bot: false, username: "example_user" }, chat: { id: 123, type: "private" } };

describe("pairing protocol", () => {
  it("accepts a canonical 256-bit token within Telegram's limit", () => {
    expect(validAttempt(attempt)).toBe(true);
    expect(attempt.length).toBeLessThanOrEqual(64);
    expect(attemptHash(attempt)).toMatch(/^[a-f0-9]{64}$/);
    expect(attemptHash(attempt)).toBe(attemptHash(attempt));
  });
  it.each([null, 123, "", "dmn1_short", attempt + "x", attempt.replace("dmn1_", "other_"), `dmn1_${"a".repeat(43)}`])("rejects malformed/noncanonical token %#", value => {
    expect(validAttempt(value)).toBe(false);
    expect(() => attemptHash(value as string)).toThrow("invalid-attempt");
  });
  it("derives stable six-digit codes and domain-separated hashes", () => {
    const code = pairingCode(botToken, attempt, "123");
    expect(code).toMatch(/^[0-9]{6}$/);
    expect(pairingCode(botToken, attempt, "123")).toBe(code);
    expect(codeHash(attempt, code)).toMatch(/^[a-f0-9]{64}$/);
    expect(codeHash(attempt, code)).not.toBe(attemptHash(attempt));
    expect(pairingCode(botToken, attempt, "124")).not.toBe(code);
    expect(pairingCode(botToken + "x", attempt, "123")).not.toBe(code);
    expect(pairingCode(botToken, `dmn1_${Buffer.alloc(32, 8).toString("base64url")}`, "123")).not.toBe(code);
    expect(codeHash(attempt, "000001")).not.toBe(codeHash(attempt, "000002"));
  });
  it("keeps leading zeroes", () => {
    const codes = Array.from({ length: 100 }, (_, i) => pairingCode(botToken, attempt, String(i + 1)));
    expect(codes.some(code => code.startsWith("0"))).toBe(true);
    expect(codes.every(code => code.length === 6)).toBe(true);
  });
  it.each([["bad", attempt, "123"], [botToken, "bad", "123"], [botToken, attempt, "-123"], [botToken, attempt, "01"], [botToken, attempt, "90071992547409933"]])("rejects invalid code derivation inputs %#", (token, reference, id) => {
    expect(() => pairingCode(token, reference, id)).toThrow("invalid-pairing-input");
  });
  it.each([["bad", "123456"], [attempt, "12345"], [attempt, "1234567"], [attempt, "abcdef"]])("rejects invalid hash inputs %#", (reference, code) => {
    expect(() => codeHash(reference, code)).toThrow("invalid-pairing-input");
  });
  it("extracts the real private user and preserves case", () => {
    expect(privateIdentity(identity)).toEqual({ userId: "123", username: "example_user" });
    expect(privateIdentity({ from: { id: 4503599627370495, is_bot: false, username: "User_Name" }, chat: { id: 4503599627370495, type: "private" } }))
      .toEqual({ userId: "4503599627370495", username: "User_Name" });
  });
  it.each([null, {}, { from: identity.from }, { chat: identity.chat },
    { ...identity, from: { ...identity.from, is_bot: true } },
    { ...identity, from: { ...identity.from, is_bot: undefined } },
    { ...identity, chat: { id: 123, type: "group" } },
    { ...identity, chat: { id: 124, type: "private" } },
    ...[0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "123"].map(id => ({ from: { ...identity.from, id }, chat: { id, type: "private" } })),
  ])("rejects inconsistent, bot, group or unsafe identity %#", value => {
    expect(() => privateIdentity(value)).toThrow("invalid-private-identity");
  });
  it.each([undefined, "", "tiny", "@username", "bad username", "a".repeat(33)])("rejects absent or invalid username %#", username => {
    expect(() => privateIdentity({ ...identity, from: { ...identity.from, username } })).toThrow("username-required");
  });
});
