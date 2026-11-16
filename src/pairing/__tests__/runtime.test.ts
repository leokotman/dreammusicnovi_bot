import { websitePairing } from "../runtime";
import { configEnv } from "../../delivery/__tests__/fixtures";
import { readConfig } from "../../delivery/config";
import { runtimeService } from "../../delivery/runtime";
import { PairingService } from "../service";
import type { Context } from "telegraf";
jest.mock("../../delivery/runtime", () => ({ runtimeService: jest.fn() }));
jest.mock("../service", () => ({ PairingService: jest.fn() }));
describe("pairing runtime dependencies", () => {
  const before = process.env;
  const revoke = jest.fn().mockResolvedValue(true), start = jest.fn().mockResolvedValue("123456");
  beforeEach(() => {
    process.env = { ...configEnv(), WEBSITE_PAIRING_ENABLED: "true", WEBSITE_PAIRING_CANDIDATE_URL: "https://site.example.test/api/telegram/connection/candidate" };
    (runtimeService as jest.Mock).mockReturnValue({ consent: { revoke } });
    (PairingService as jest.Mock).mockImplementation(() => ({ start }));
  });
  afterAll(() => { process.env = before; });
  it("uses the same configured authority for private block, disconnect and Start", async () => {
    const from = { id: 123, is_bot: false, username: "example_user" }, chat = { id: 123, type: "private" };
    const context = { update: { update_id: 1 }, from, chat, reply: jest.fn() };
    await websitePairing({ ...context, message: { text: "/disconnect" } } as unknown as Context, jest.fn());
    await websitePairing({ ...context, update: { update_id: 2, my_chat_member: { from, chat, new_chat_member: { status: "kicked", user: { id: 9101311802, is_bot: true } } } } } as unknown as Context, jest.fn());
    await websitePairing({ ...context, message: { text: "/start dmn1_" + Buffer.alloc(32, 1).toString("base64url") } } as unknown as Context, jest.fn());
    expect(revoke).toHaveBeenCalledTimes(2); expect(start).toHaveBeenCalledTimes(1);
    expect(runtimeService).toHaveBeenCalledWith(readConfig(process.env));
    expect(PairingService).toHaveBeenCalledWith({ revoke }, expect.any(Object), process.env.BOT_TOKEN);
  });
});
