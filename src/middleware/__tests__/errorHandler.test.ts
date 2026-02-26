import { isMessageNotModified, withErrorHandling } from "../errorHandler";
import type { Context } from "telegraf";

describe("isMessageNotModified", () => {
  it("returns true when response.description contains message", () => {
    expect(
      isMessageNotModified({
        response: {
          description: "Bad Request: message is not modified: specified new message content",
        },
      })
    ).toBe(true);
  });

  it("returns true when description at top level contains message", () => {
    expect(
      isMessageNotModified({
        description: "message is not modified",
      })
    ).toBe(true);
  });

  it("returns false for undefined", () => {
    expect(isMessageNotModified(undefined)).toBe(false);
  });

  it("returns false for non-object", () => {
    expect(isMessageNotModified("error")).toBe(false);
  });

  it("returns false for different error", () => {
    expect(
      isMessageNotModified({ response: { description: "Unauthorized" } })
    ).toBe(false);
  });
});

describe("withErrorHandling", () => {
  it("calls handler and does not reply on success", async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    const ctx = {
      replyWithHTML: jest.fn().mockResolvedValue(undefined),
    } as unknown as Context;
    await withErrorHandling(ctx, handler);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(ctx.replyWithHTML).not.toHaveBeenCalled();
  });

  it("replies with fallback on generic error", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const ctx = {
      replyWithHTML: jest.fn().mockResolvedValue(undefined),
    } as unknown as Context;
    await withErrorHandling(ctx, async () => {
      throw new Error("fail");
    });
    expect(ctx.replyWithHTML).toHaveBeenCalledWith(
      expect.stringContaining("Произошла ошибка")
    );
    consoleSpy.mockRestore();
  });

  it("does not reply on message is not modified error", async () => {
    const ctx = {
      replyWithHTML: jest.fn().mockResolvedValue(undefined),
    } as unknown as Context;
    await withErrorHandling(ctx, async () => {
      throw Object.assign(new Error(), {
        response: { description: "message is not modified: specified new message" },
      });
    });
    expect(ctx.replyWithHTML).not.toHaveBeenCalled();
  });
});
