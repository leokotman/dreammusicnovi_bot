/**
 * In-memory user state for "ask your question" and admin edit flows.
 * Optional TTL to avoid unbounded growth (e.g. 10 min).
 */

const TTL_MS = 10 * 60 * 1000; // 10 minutes

export type PendingState =
  | { type: "awaiting_question" }
  | { type: "awaiting_edit_lesson"; key: string }
  | { type: "awaiting_edit_lesson_label"; key: string }
  | { type: "awaiting_edit_faq"; key: string }
  | { type: "awaiting_edit_faq_label"; key: string }
  | { type: "awaiting_edit_main_section_label"; key: string }
  | { type: "awaiting_add_admin" }
  | { type: "awaiting_new_lesson_label" }
  | { type: "awaiting_new_lesson_content"; label: string }
  | { type: "awaiting_new_faq_label" }
  | { type: "awaiting_new_faq_content"; label: string }
  | { type: "awaiting_new_main_section_label" }
  | { type: "awaiting_new_main_section_content"; label: string }
  | { type: "awaiting_new_main_section_choice"; label: string }
  | { type: "awaiting_new_main_section_sub_label"; sectionKey: string }
  | { type: "awaiting_new_main_section_sub_content"; sectionKey: string; itemLabel: string }
  | { type: "awaiting_new_main_section_sub_more"; sectionKey: string };

const store = new Map<number, { state: PendingState; at: number }>();

function prune(userId: number): void {
  const entry = store.get(userId);
  if (entry && Date.now() - entry.at > TTL_MS) store.delete(userId);
}

export function setState(userId: number, state: PendingState): void {
  store.set(userId, { state, at: Date.now() });
}

export function getState(userId: number): PendingState | null {
  prune(userId);
  return store.get(userId)?.state ?? null;
}

export function clearState(userId: number): void {
  store.delete(userId);
}
