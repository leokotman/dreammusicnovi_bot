// This module is deployed independently to Cloudflare; it imports no Node APIs.
export interface WorkerQueue {
  send(body: Task, options?: { delaySeconds: number }): Promise<void>;
}
export interface WorkerEnv {
  DELIVERY_QUEUE: WorkerQueue;
  DELIVERY_ENABLED: string;
  PUBLISH_SECRET: string;
  EXECUTION_SECRET: string;
  BOT_BASE_URL: string;
}
export type Task = { version: 1; jobId: string } | { version: 1; recoverAfter: string | null };
export interface QueueMessage { body: unknown; ack(): void; retry(options: { delaySeconds: number }): void }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function task(body: unknown): Task {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid-task");
  const value = body as Record<string, unknown>;
  const keys = Object.keys(value);
  if (value.version !== 1 || keys.length !== 2) throw new Error("invalid-task");
  if (typeof value.jobId === "string" && uuid.test(value.jobId)) return { version: 1, jobId: value.jobId };
  if ("recoverAfter" in value && (value.recoverAfter === null || typeof value.recoverAfter === "string" && uuid.test(value.recoverAfter))) {
    return { version: 1, recoverAfter: value.recoverAfter as string | null };
  }
  throw new Error("invalid-task");
}

function enabled(env: WorkerEnv): void {
  if (env.DELIVERY_ENABLED !== "true" || env.PUBLISH_SECRET?.length < 32 || env.EXECUTION_SECRET?.length < 32 ||
      !env.PUBLISH_SECRET || !env.EXECUTION_SECRET || env.PUBLISH_SECRET === env.EXECUTION_SECRET ||
      !/^https:\/\/[^/]+$/.test(env.BOT_BASE_URL)) throw new Error("worker-disabled");
}

async function authorized(header: string | null, secret: string): Promise<boolean> {
  if (!header || header.length > 512) return false;
  const bytes = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", bytes.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  const signature = await crypto.subtle.sign("HMAC", key, bytes.encode(`Bearer ${secret}`));
  return crypto.subtle.verify("HMAC", key, signature, bytes.encode(header));
}

async function call(env: WorkerEnv, operation: string, body: unknown) {
  const response = await fetch(`${env.BOT_BASE_URL}/api/website/enrollment-confirmations/${operation}`, {
    method: "POST", headers: { authorization: `Bearer ${env.EXECUTION_SECRET}`, "content-type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(20000), redirect: "error",
  });
  if (!response.ok) throw new Error("processing-unavailable");
  return await response.json() as Record<string, unknown>;
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const reply = (status: number) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });
    try {
      enabled(env);
      if (request.method !== "POST" || new URL(request.url).pathname !== "/publish") return reply(405);
      if (!await authorized(request.headers.get("authorization"), env.PUBLISH_SECRET)) return reply(401);
      // Bound allocation even for chunked bodies without Content-Length.
      const reader = request.body?.getReader();
      if (!reader) return reply(400);
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          length += next.value.byteLength;
          if (length > 1024) { await reader.cancel(); return reply(413); }
          chunks.push(next.value);
        }
      } finally { reader.releaseLock(); }
      const buffer = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
      const value = JSON.parse(new TextDecoder().decode(buffer)) as Record<string, unknown>;
      if (!value || typeof value !== "object" || Array.isArray(value)) return reply(400);
      const { delaySeconds = 0, ...rest } = value;
      const parsed = task(rest);
      if (!("jobId" in parsed) || typeof delaySeconds !== "number" || !Number.isInteger(delaySeconds) || delaySeconds < 0 || delaySeconds > 43200) return reply(400);
      await env.DELIVERY_QUEUE.send(parsed, { delaySeconds });
      return reply(202);
    } catch { return reply(503); }
  },

  async queue(batch: { messages: QueueMessage[] }, env: WorkerEnv): Promise<void> {
    for (const message of batch.messages) {
      try {
        enabled(env);
        const parsed = task(message.body);
        if ("jobId" in parsed) {
          const result = await call(env, "process", { jobId: parsed.jobId });
          if (result.pending === false) message.ack();
          else if (result.pending === true && typeof result.retryAfterSeconds === "number" && Number.isFinite(result.retryAfterSeconds)) {
            // Republish before acknowledgement: unfinished work does not consume
            // the transport failure retry budget during normal delivery waits.
            await env.DELIVERY_QUEUE.send(parsed, { delaySeconds: Math.max(1, Math.min(43200, Math.ceil(result.retryAfterSeconds))) });
            message.ack();
          } else throw new Error("invalid-processing-response");
        } else {
          const result = await call(env, "recover", { after: parsed.recoverAfter });
          if (result.nextCursor !== null) {
            if (typeof result.nextCursor !== "string" || !uuid.test(result.nextCursor)) throw new Error("invalid-recovery-response");
            await env.DELIVERY_QUEUE.send({ version: 1, recoverAfter: result.nextCursor });
          }
          message.ack();
        }
      } catch { message.retry({ delaySeconds: 60 }); }
    }
  },

  async scheduled(_event: unknown, env: WorkerEnv): Promise<void> {
    enabled(env);
    await env.DELIVERY_QUEUE.send({ version: 1, recoverAfter: null });
  },
};
