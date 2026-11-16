import type { ConsentGrant } from "../pairing/consent";

export const TEMPLATE_VERSION = "enrollment-v1";
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const CHAT_ID = /^-?[1-9][0-9]{0,15}$/;

export class ApiError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

export interface EnrollmentEvent {
  consent?: ConsentGrant;
  eventId: string;
  enrollmentReference: string;
  submittedAt: string;
  telegramUserId: string;
  templateVersion: typeof TEMPLATE_VERSION;
  submission: { name: string; contact: string; lessonName: string; comment: string };
}

export function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some(key => !keys.includes(key))) throw new ApiError(400, "invalid-request");
  return value as Record<string, unknown>;
}

function string(value: unknown, max: number, optional = false): string {
  if (typeof value !== "string" || value.length > max || (!optional && !value.trim()) ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new ApiError(400, "invalid-request");
  // Do not silently rewrite accepted submission details.
  return value;
}

export function jobId(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new ApiError(400, "invalid-job-id");
  return value.toLowerCase();
}

export function validateEvent(value: unknown): EnrollmentEvent {
  const body = object(value, ["eventId", "enrollmentReference", "submittedAt", "telegramUserId", "templateVersion", "submission", "consent"]);
  const submission = object(body.submission, ["name", "contact", "lessonName", "comment"]);
  const submittedAt = string(body.submittedAt, 32);
  const recipient = string(body.telegramUserId, 16);
  if (!/^[1-9][0-9]{0,15}$/.test(recipient) || body.templateVersion !== TEMPLATE_VERSION ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(submittedAt) ||
      !Number.isFinite(Date.parse(submittedAt)) || new Date(submittedAt).toISOString() !== submittedAt) {
    throw new ApiError(400, "invalid-request");
  }
  return {
    ...(body.consent === undefined ? {} : { consent: validateGrant(body.consent, recipient) }),
    eventId: jobId(body.eventId), enrollmentReference: string(body.enrollmentReference, 128),
    submittedAt, telegramUserId: recipient, templateVersion: TEMPLATE_VERSION,
    submission: { name: string(submission.name, 200), contact: string(submission.contact, 254),
      lessonName: string(submission.lessonName, 500), comment: string(submission.comment === undefined ? "" : submission.comment, 500, true) },
  };
}

export function validateGrant(value: unknown, userId?: string): ConsentGrant {
  const grant = object(value, ["id", "userId", "generation"]);
  if (typeof grant.userId !== "string" || !/^[1-9][0-9]{0,15}$/.test(grant.userId) ||
      userId !== undefined && grant.userId !== userId || typeof grant.generation !== "string" ||
      !/^(0|[1-9][0-9]{0,18})$/.test(grant.generation) || BigInt(grant.generation) > 9223372036854775807n)
    throw new ApiError(400, "invalid-request");
  return { id: jobId(grant.id), userId: grant.userId, generation: grant.generation };
}

export interface MessagePart { text: string; messageId?: number }
export interface Destination { chatId: string; roles: string[]; parts: MessagePart[] }

// Telegram text is plain text; no HTML/Markdown parsing is requested.
export function messageParts(text: string): MessagePart[] {
  const parts: MessagePart[] = [];
  let part = "";
  for (const point of text) {
    if (part.length + point.length > 4000) { parts.push({ text: part }); part = ""; }
    part += point;
  }
  if (part) parts.push({ text: part });
  return parts;
}

export function destinations(event: EnrollmentEvent, adminIds: string[], visitorAllowed = true): Destination[] {
  const { name, contact, lessonName, comment } = event.submission;
  const details = `Имя: ${name}\nКонтакт: ${contact}\nЗанятие / курс: ${lessonName}${comment ? `\nКомментарий: ${comment}` : ""}`;
  return [...new Set([event.telegramUserId, ...adminIds])].map(chatId => {
    const visitor = chatId === event.telegramUserId;
    const admin = adminIds.includes(chatId);
    const heading = visitor && visitorAllowed ? "Спасибо! Ваша заявка получена." : "Новая заявка с сайта DreamMusicNovi.";
    const staff = admin ? `\nНомер заявки: ${event.enrollmentReference}\nВремя подачи (UTC): ${event.submittedAt}` : "";
    return { chatId, roles: [...(visitor ? ["visitor"] : []), ...(admin ? ["admin"] : [])],
      parts: messageParts(`${heading}\n\n${details}${staff}`) };
  });
}

export function aggregate(states: string[]): string {
  if (states.every(state => state === "cancelled")) return "cancelled";
  if (states.every(state => state === "sent")) return "sent";
  if (states.every(state => state === "sent" || state === "cancelled")) return "partial-cancellation";
  if (states.every(state => state === "failed")) return "failed";
  if (states.every(state => state === "sent" || state === "failed" || state === "cancelled")) return "partial-failure";
  return states.every(state => state === "pending") ? "accepted" : "processing";
}
