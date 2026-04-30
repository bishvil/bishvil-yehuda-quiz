import type {
  QuestionStatusEnum,
  SessionStatusEnum,
} from "@/src/lib/supabase/database.types";

/**
 * Session-level allowed transitions per ADR-0004 §1. Encoded as a constant
 * lookup so handlers and tests share a single source of truth.
 */
const SESSION_TRANSITIONS: Record<SessionStatusEnum, SessionStatusEnum[]> = {
  draft: ["scheduled"],
  scheduled: ["live", "draft", "ended"],
  live: ["paused", "ended"],
  paused: ["live", "ended"],
  ended: [],
};

export function canTransitionSession(
  from: SessionStatusEnum,
  to: SessionStatusEnum,
): boolean {
  if (from === to) {
    return true;
  }
  return SESSION_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Question state machine per ADR-0005 §1. `presenting` is optional and the
 * host may skip directly from `idle` to `answering`.
 */
const QUESTION_TRANSITIONS: Record<QuestionStatusEnum, QuestionStatusEnum[]> = {
  idle: ["presenting", "answering"],
  presenting: ["answering"],
  answering: ["locked"],
  locked: ["revealed"],
  revealed: [],
};

export function canTransitionQuestion(
  from: QuestionStatusEnum,
  to: QuestionStatusEnum,
): boolean {
  if (from === to) {
    return true;
  }
  return QUESTION_TRANSITIONS[from]?.includes(to) ?? false;
}
