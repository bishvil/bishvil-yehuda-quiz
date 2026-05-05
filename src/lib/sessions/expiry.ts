import {
  questionCacheTag,
  questionCountsCacheTag,
  safeRevalidateTag,
} from "@/src/lib/cache/tags";
import type { ServiceSupabase } from "@/src/lib/sessions/lookup";
import type {
  AsyncQuestionStatusEnum,
  Database,
  QuestionStatusEnum,
} from "@/src/lib/supabase/database.types";

type SyncStateRow =
  Database["public"]["Tables"]["question_session_state"]["Row"];
type AsyncProgressRow =
  Database["public"]["Tables"]["participant_question_progress"]["Row"];

/**
 * ADR-0005 §3.2 lazy expiry. Self-heals an `answering` row whose deadline
 * has passed: in sync mode the row goes to `locked`; if the session has
 * `auto_reveal = true` (async sessions) it goes straight to `revealed`.
 *
 * The function is idempotent — calling it on an already-locked row is a no-op.
 */
export async function lazyExpireSyncQuestionState(
  client: ServiceSupabase,
  sessionId: string,
  questionId: string,
  options: { autoReveal: boolean; nowMillis?: number } = { autoReveal: false },
): Promise<{ row: SyncStateRow | null; changed: boolean }> {
  const { data, error } = await client
    .from("question_session_state")
    .select("*")
    .eq("session_id", sessionId)
    .eq("question_id", questionId)
    .maybeSingle();

  if (error || !data) {
    return { row: data ?? null, changed: false };
  }

  const now = options.nowMillis ?? Date.now();
  const deadlineMs = data.deadline_at ? Date.parse(data.deadline_at) : null;
  const expired = data.status === "answering" && deadlineMs !== null && now > deadlineMs;

  if (!expired) {
    return { row: data, changed: false };
  }

  const targetStatus: QuestionStatusEnum = options.autoReveal ? "revealed" : "locked";
  const update: Database["public"]["Tables"]["question_session_state"]["Update"] = {
    status: targetStatus,
  };
  if (options.autoReveal) {
    update.revealed_at = new Date(now).toISOString();
  }

  const { data: updated, error: updateError } = await client
    .from("question_session_state")
    .update(update)
    .eq("session_id", sessionId)
    .eq("question_id", questionId)
    .eq("status", "answering")
    .select("*")
    .maybeSingle();

  if (updateError || !updated) {
    return { row: data, changed: false };
  }

  safeRevalidateTag(questionCacheTag(sessionId, questionId));
  if (options.autoReveal) {
    safeRevalidateTag(questionCountsCacheTag(sessionId, questionId));
  }

  return { row: updated, changed: true };
}

/**
 * Async-mode counterpart. Auto-reveal is implicit in async per ADR-0007 §2.4
 * regardless of the session flag — `auto_reveal=true` is set on async sessions
 * by admin/session creation, but participants reach the lock-then-reveal step
 * either way once their personal deadline passes.
 */
export async function lazyExpireAsyncProgress(
  client: ServiceSupabase,
  sessionId: string,
  participantId: string,
  questionId: string,
  options: { nowMillis?: number } = {},
): Promise<{ row: AsyncProgressRow | null; changed: boolean }> {
  const { data, error } = await client
    .from("participant_question_progress")
    .select("*")
    .eq("session_id", sessionId)
    .eq("participant_id", participantId)
    .eq("question_id", questionId)
    .maybeSingle();

  if (error || !data) {
    return { row: data ?? null, changed: false };
  }

  const now = options.nowMillis ?? Date.now();
  const deadlineMs = Date.parse(data.deadline_at);
  const expired = data.status === "answering" && now > deadlineMs;

  if (!expired) {
    return { row: data, changed: false };
  }

  const targetStatus: AsyncQuestionStatusEnum = "revealed";
  const update: Database["public"]["Tables"]["participant_question_progress"]["Update"] =
    {
      status: targetStatus,
      revealed_at: new Date(now).toISOString(),
    };

  const { data: updated, error: updateError } = await client
    .from("participant_question_progress")
    .update(update)
    .eq("session_id", sessionId)
    .eq("participant_id", participantId)
    .eq("question_id", questionId)
    .eq("status", "answering")
    .select("*")
    .maybeSingle();

  if (updateError || !updated) {
    return { row: data, changed: false };
  }

  safeRevalidateTag(questionCacheTag(sessionId, questionId));

  return { row: updated, changed: true };
}
