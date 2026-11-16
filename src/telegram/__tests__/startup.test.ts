const launch = jest.fn(), stop = jest.fn(), commands = jest.fn();
const bot = { telegram: { marker: "synthetic" }, stop };
jest.mock("../../bot", () => ({ createBot: jest.fn(() => bot) }));
jest.mock("../polling", () => ({ launchPolling: launch }));
jest.mock("../../botCommands", () => ({ updateBotCommands: commands }));
jest.mock("../../config/admins", () => ({ getAdminIds: () => ["123"] }));

const originalExitCode = process.exitCode;
afterEach(() => { jest.restoreAllMocks(); process.exitCode = originalExitCode; });
beforeEach(() => { jest.clearAllMocks(); });

it("routes startup through the guard, updates commands and retains shutdown handlers", async () => {
  launch.mockResolvedValue(undefined);
  commands.mockResolvedValue(undefined);
  const once = jest.spyOn(process, "once").mockReturnValue(process);
  const log = jest.spyOn(console, "log").mockImplementation(() => {});
  await jest.isolateModulesAsync(async () => { await import("../../index"); });
  await Promise.resolve();
  expect(launch).toHaveBeenCalledWith(bot);
  expect(commands).toHaveBeenCalledWith(bot.telegram, ["123"]);
  expect(log).toHaveBeenCalledWith("DreamMusic bot is running (long polling).");
  for (const signal of ["SIGINT", "SIGTERM"]) {
    const callback = once.mock.calls.find(call => call[0] === signal)![1];
    callback();
    expect(stop).toHaveBeenCalledWith(signal);
  }
});
it("fails startup with a redacted error and nonzero exit status", async () => {
  launch.mockRejectedValue(new Error("private-webhook-url"));
  jest.spyOn(process, "once").mockReturnValue(process);
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  await jest.isolateModulesAsync(async () => { await import("../../index"); });
  await Promise.resolve();
  expect(commands).not.toHaveBeenCalled();
  expect(log).toHaveBeenCalledWith("telegram-polling-start-failed");
  expect(JSON.stringify(log.mock.calls)).not.toContain("private-webhook-url");
  expect(process.exitCode).toBe(1);
});
