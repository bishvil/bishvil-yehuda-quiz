import { type NextRequest } from "next/server";

import { privateNoStoreJson } from "@/src/lib/http/responses";
import { loadHostContext } from "@/src/lib/sessions/host-context";
import { lazyExpireSyncQuestionState } from "@/src/lib/sessions/expiry";
import { safeRevalidateTag, sessionCacheTag } from "@/src/lib/cache/tags";

interface HostQuestionNextRouteContext {
  params: Promise<{ pin: string }>;
}

interface HostQuestionNextSuccessBody {
  sessionId: string;
  nextQuestionId: string | null;
  nextQuestionIndex: number | null;
  status: "advanced" | "all_revealed";
}

interface HostQuestionNextErrorBody {
  error: "SESSION_NOT_LIVE" | "SESSION_PAUSED" | "QUESTION_NOT_REVEALED" | "WRITE_FAILED";
  message: string;
  code?: string;
  currentStatus?: string;
}

type HostQuestionNextResponseBody =
  | HostQuestionNextSuccessBody
  | HostQuestionNextErrorBody;

/**
 * Advances `session.current_question_id` to the next question by ordinal
 * (ADR-0005 §3.4). Returns `all_revealed` if no more questions exist —
 * the host should then call /end to terminate the session.
 */
export async function POST(
  _request: NextRequest,
  context: HostQuestionNextRouteContext,
) {
  const { pin } = await context.params;
  const ctx = await loadHostContext(pin);
  if (!ctx.ok) return ctx.response;
  const { session, serviceSupabase } = ctx;

  if (session.status === "paused") {
    return privateNoStoreJson<HostQuestionNextResponseBody>(
      {
        error: "SESSION_PAUSED",
        code: "SESSION_INVALID_TRANSITION",
        currentStatus: session.status,
        message: "Resume the session before advancing to the next question.",
      },
      { status: 409 },
    );
  }

  if (session.status !== "live") {
    return privateNoStoreJson<HostQuestionNextResponseBody>(
      {
        error: "SESSION_NOT_LIVE",
        code: "SESSION_INVALID_TRANSITION",
        currentStatus: session.status,
        message: `Session status is ${session.status}.`,
      },
      { status: 409 },
    );
  }

  if (!session.current_question_id) {
    return privateNoStoreJson<HostQuestionNextResponseBody>(
      {
        error: "QUESTION_NOT_REVEALED",
        code: "QUESTION_INVALID_TRANSITION",
        currentStatus: "none",
        message: "No current question is active.",
      },
      { status: 409 },
    );
  }

  const { row: currentState } = await lazyExpireSyncQuestionState(
    serviceSupabase,
    session.id,
    session.current_question_id,
    { autoReveal: session.auto_reveal },
  );

  if (currentState?.status !== "revealed") {
    return privateNoStoreJson<HostQuestionNextResponseBody>(
      {
        error: "QUESTION_NOT_REVEALED",
        code: "QUESTION_INVALID_TRANSITION",
        currentStatus: currentState?.status ?? "missing",
        message: "Current question must be revealed before advancing.",
      },
      { status: 409 },
    );
  }

  const { data: currentQuestion } = await serviceSupabase
    .from("questions")
    .select("ordinal")
    .eq("id", session.current_question_id)
    .maybeSingle();

  const currentOrdinal = currentQuestion?.ordinal ?? 0;

  const { data: nextQuestion } = await serviceSupabase
    .from("questions")
    .select("id, ordinal")
    .eq("quiz_id", session.quiz_id)
    .gt("ordinal", currentOrdinal)
    .order("ordinal", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!nextQuestion) {
    const endedAt = new Date().toISOString();
    const { error } = await serviceSupabase
      .from("sessions")
      .update({
        status: "ended",
        ended_at: endedAt,
        host_last_seen_at: endedAt,
      })
      .eq("id", session.id);

    if (error) {
      return privateNoStoreJson<HostQuestionNextResponseBody>(
        { error: "WRITE_FAILED", message: "Could not end session." },
        { status: 500 },
      );
    }

    safeRevalidateTag(sessionCacheTag(session.id));

    return privateNoStoreJson<HostQuestionNextResponseBody>(
      {
        sessionId: session.id,
        nextQuestionId: null,
        nextQuestionIndex: null,
        status: "all_revealed",
      },
      { status: 200 },
    );
  }

  const { error } = await serviceSupabase
    .from("sessions")
    .update({
      current_question_id: nextQuestion.id,
      host_last_seen_at: new Date().toISOString(),
    })
    .eq("id", session.id);

  if (error) {
    return privateNoStoreJson<HostQuestionNextResponseBody>(
      { error: "WRITE_FAILED", message: "Could not advance question." },
      { status: 500 },
    );
  }

  safeRevalidateTag(sessionCacheTag(session.id));

  return privateNoStoreJson<HostQuestionNextResponseBody>(
    {
      sessionId: session.id,
      nextQuestionId: nextQuestion.id,
      nextQuestionIndex: nextQuestion.ordinal,
      status: "advanced",
    },
    { status: 200 },
  );
}
