import { Pool } from "pg";
import { runtimeService } from "../runtime";
import acceptance from "../../../api/website/enrollment-confirmations";
import status from "../../../api/website/enrollment-confirmations/[jobId]";
import processHandler from "../../../api/website/enrollment-confirmations/process";
import check from "../../../api/website/consent/check";
import activate from "../../../api/website/consent/activate";
import recover from "../../../api/website/enrollment-confirmations/recover";
import { config } from "./fixtures";
import type { VercelRequest, VercelResponse } from "@vercel/node";
jest.mock("pg", () => ({ Pool: jest.fn() }));

describe("delivery runtime and route wiring", () => {
  const pool = { on: jest.fn(), end: jest.fn().mockResolvedValue(undefined), query: jest.fn() };
  beforeAll(() => { (Pool as unknown as jest.Mock).mockImplementation(() => pool); });
  it("reuses the connection pool and closes it on explicit target changes", () => {
    const first = runtimeService(config), second = runtimeService(config);
    expect(first.store).toBe(second.store); expect(Pool).toHaveBeenCalledTimes(1);
    pool.on.mock.calls[0][1](new Error("credential must not be logged"));
    runtimeService({ ...config, databaseUrl: "postgresql://localhost/delivery_scratch_other" });
    expect(pool.end).toHaveBeenCalledTimes(1); expect(Pool).toHaveBeenCalledTimes(2);
  });
  it("keeps the feature off by default on every route and wires allowed methods", async () => {
    const old = process.env.WEBSITE_DELIVERY_ENABLED; delete process.env.WEBSITE_DELIVERY_ENABLED;
    try {
      for (const [handler, method] of [[acceptance, "POST"], [status, "GET"], [processHandler, "POST"], [recover, "POST"], [check, "POST"], [activate, "POST"]] as const) {
        const res = { setHeader: jest.fn(), status: jest.fn(), json: jest.fn() };
        res.status.mockReturnValue(res);
        await handler({ method } as VercelRequest, res as unknown as VercelResponse);
        expect(res.status).toHaveBeenLastCalledWith(503); expect(res.json).toHaveBeenLastCalledWith({ error: "delivery-disabled" });
        await handler({ method: "DELETE" } as VercelRequest, res as unknown as VercelResponse);
        expect(res.setHeader).toHaveBeenCalledWith("Allow", method);
      }
    } finally { if (old === undefined) delete process.env.WEBSITE_DELIVERY_ENABLED; else process.env.WEBSITE_DELIVERY_ENABLED = old; }
  });
});
