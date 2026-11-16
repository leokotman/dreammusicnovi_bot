import { PairingService } from "../service";
import { attemptHash, codeHash, pairingCode } from "../protocol";
const attempt = "dmn1_" + Buffer.alloc(32, 1).toString("base64url");
const token = "999:synthetic-token";
const message = { from: { id: 123, is_bot: false, username: "example_user" }, chat: { id: 123, type: "private" } };
describe("Start orchestration", () => {
  const consent = { candidate: jest.fn() }, website = { reserve: jest.fn(), bind: jest.fn() };
  const service = new PairingService(consent as never, website as never, token);
  const grant = { id: "grant", userId: "123", generation: "0" };
  const createdAt = new Date(), expiry = new Date(Date.now() + 300000);
  beforeEach(() => { jest.resetAllMocks(); consent.candidate.mockResolvedValue(grant); website.reserve.mockResolvedValue({ createdAt, expiresAt: expiry }); website.bind.mockResolvedValue(undefined); });
  it("registers both authorities before releasing a stable code, without activating consent", async () => {
    const code = pairingCode(token, attempt, "123");
    expect(await service.start(attempt, message)).toBe(code);
    const candidate = { attempt, userId: "123", username: "example_user", codeHash: codeHash(attempt, code) };
    expect(website.reserve).toHaveBeenCalledWith(candidate);
    expect(consent.candidate).toHaveBeenCalledWith("123", attemptHash(attempt), expiry, createdAt);
    expect(website.bind).toHaveBeenCalledWith(candidate, grant);
    expect(consent.candidate).toHaveBeenCalledTimes(2);
    expect(await service.start(attempt, message)).toBe(code);
  });
  it("validates authenticated private identity before registering anything", async () => {
    await expect(service.start(attempt, {})).rejects.toThrow("invalid-private-identity");
    await expect(service.start("invalid", message)).rejects.toThrow("invalid-pairing-input");
    expect(website.reserve).not.toHaveBeenCalled();
  });
  it("never returns a code after reserve, grant, bind or final revocation checks fail", async () => {
    website.reserve.mockRejectedValueOnce(new Error("expired"));
    await expect(service.start(attempt, message)).rejects.toThrow("expired"); expect(consent.candidate).not.toHaveBeenCalled();
    consent.candidate.mockRejectedValueOnce(new Error("conflict"));
    await expect(service.start(attempt, message)).rejects.toThrow("conflict"); expect(website.bind).not.toHaveBeenCalled();
    website.bind.mockRejectedValueOnce(new Error("cancelled"));
    await expect(service.start(attempt, message)).rejects.toThrow("cancelled");
    consent.candidate.mockResolvedValueOnce(grant).mockRejectedValueOnce(new Error("revoked"));
    await expect(service.start(attempt, message)).rejects.toThrow("revoked");
  });
});
