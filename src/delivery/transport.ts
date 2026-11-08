import { DeliveryConfig } from "./config";
import { Outcome } from "./store";

export interface QueueTask { version: 1; jobId: string }

export async function publish(config: DeliveryConfig, jobId: string, delaySeconds = 0): Promise<void> {
  const response = await fetch(config.publisherUrl, {
    method: "POST", headers: { authorization: `Bearer ${config.publisherSecret}`, "content-type": "application/json" },
    body: JSON.stringify({ version: 1, jobId, delaySeconds }), signal: AbortSignal.timeout(5000), redirect: "error",
  });
  if (!response.ok) throw new Error("queue-unavailable");
}

export async function send(config: DeliveryConfig, destination: string, text: string, attempt: number): Promise<Outcome> {
  const retry = () => Math.min(3600, 15 * 2 ** Math.min(attempt - 1, 8) + Math.floor(Math.random() * 10));
  try {
    const response = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: destination, text, link_preview_options: { is_disabled: true } }),
      signal: AbortSignal.timeout(5000), redirect: "error",
    });
    const body = await response.json() as { ok?: boolean; result?: { message_id?: number }; error_code?: number; parameters?: { retry_after?: number } };
    if (response.ok && body.ok === true && Number.isSafeInteger(body.result?.message_id)) return { messageId: body.result!.message_id! };
    const code = body.error_code ?? response.status;
    if (code === 429) {
      const seconds = body.parameters?.retry_after;
      const delay = typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0 ? Math.min(604800, Math.ceil(seconds)) : 60;
      return { error: "telegram-rate-limited", retrySeconds: delay, cooldownSeconds: delay };
    }
    if (code === 400 || code === 403 || code === 401 || code === 404) return { error: `telegram-${code}` };
    return { error: "telegram-unavailable", retrySeconds: retry() };
  } catch {
    // A timeout is ambiguous: Telegram may have accepted the message already.
    return { error: "telegram-network", retrySeconds: retry() };
  }
}
