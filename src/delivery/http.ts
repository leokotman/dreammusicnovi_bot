import { createHash, timingSafeEqual } from "crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ApiError, jobId, object, validateEvent, validateGrant } from "./contract";
import { DeliveryService } from "./service";
import { DeliveryConfig } from "./config";

export type Operation = "accept" | "status" | "process" | "recover" | "consent-check" | "consent-activate";
export function authenticated(header: unknown, secrets: string[]): boolean {
  if (typeof header !== "string" || header.length > 512) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  const received = digest(header);
  let valid = false;
  for (const secret of secrets) valid = timingSafeEqual(received, digest(`Bearer ${secret}`)) || valid;
  return valid;
}

function body(req: VercelRequest): unknown {
  if (!req.headers["content-type"]?.startsWith("application/json")) throw new ApiError(415, "json-required");
  let encoded: string;
  try { encoded = typeof req.body === "string" ? req.body : JSON.stringify(req.body); }
  catch { throw new ApiError(400, "invalid-request"); }
  if (!encoded) throw new ApiError(400, "invalid-request");
  if (Buffer.byteLength(encoded) > 16384) throw new ApiError(413, "request-too-large");
  try { return JSON.parse(encoded) as unknown; } catch { throw new ApiError(400, "invalid-json"); }
}

export function createHandler(operation: Operation, config: () => DeliveryConfig, service: (config: DeliveryConfig) => DeliveryService) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const method = operation === "status" ? "GET" : "POST";
      if (req.method !== method) { res.setHeader("Allow", method); throw new ApiError(405, "method-not-allowed"); }
      const settings = config();
      const execution = operation === "process" || operation === "recover";
      if (!authenticated(req.headers.authorization, execution ? settings.executionSecrets : settings.apiSecrets)) throw new ApiError(401, "unauthorized");
      const active = service(settings);
      await active.store.limit(operation, operation === "accept" ? 120 : 300);
      if (operation === "status") return res.status(200).json(await active.store.status(jobId(req.query.jobId)));
      const value = body(req);
      if (operation === "accept") {
        const accepted = await active.accept(validateEvent(value));
        return res.status(accepted.created ? 202 : 200).json(accepted.result);
      }
      if (operation === "consent-activate") {
        const grant = validateGrant(object(value, ["consent"]).consent);
        await active.consent.activate(grant);
        return res.status(200).json({ version: 1, active: true });
      }
      if (operation === "consent-check") {
        const input = object(value, ["userId", "consent"]);
        if (typeof input.userId !== "string" || !/^[1-9][0-9]{0,15}$/.test(input.userId)) throw new ApiError(400, "invalid-request");
        const grant = input.consent === undefined ? undefined : validateGrant(input.consent, input.userId);
        return res.status(200).json({ version: 1, allowed: await active.consent.allows(input.userId, grant) });
      }
      if (operation === "process") return res.status(200).json(await active.process(jobId(object(value, ["jobId"]).jobId)));
      const cursor = object(value, ["after"]).after;
      return res.status(200).json(await active.recover(cursor === null || cursor === undefined ? null : jobId(cursor)));
    } catch (error) {
      const known = error instanceof ApiError;
      const status = known ? error.status : 503;
      if (status === 429) res.setHeader("Retry-After", "60");
      // Never return database/network exception strings or request content.
      return res.status(status).json({ error: known ? error.code : "delivery-unavailable" });
    }
  };
}
