import { checkTextRateLimit } from "../rateLimit";

describe("checkTextRateLimit", () => {
  const userId = 999;

  beforeEach(() => {
    jest.useFakeTimers({ now: 0 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("allows first 5 messages", () => {
    for (let i = 0; i < 5; i++) {
      expect(checkTextRateLimit(userId)).toBe(true);
    }
  });

  it("rejects 6th message within same minute", () => {
    for (let i = 0; i < 5; i++) checkTextRateLimit(userId);
    expect(checkTextRateLimit(userId)).toBe(false);
  });

  it("allows message again after window passes", () => {
    for (let i = 0; i < 5; i++) checkTextRateLimit(userId);
    expect(checkTextRateLimit(userId)).toBe(false);
    jest.advanceTimersByTime(61 * 1000);
    expect(checkTextRateLimit(userId)).toBe(true);
  });

  it("limits are per user", () => {
    for (let i = 0; i < 5; i++) checkTextRateLimit(1);
    expect(checkTextRateLimit(1)).toBe(false);
    expect(checkTextRateLimit(2)).toBe(true);
  });
});
