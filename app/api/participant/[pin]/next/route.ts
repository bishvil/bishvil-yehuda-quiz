import { type NextRequest } from "next/server";

import { requireRole } from "@/src/lib/auth/server-auth";
import { noStoreJson } from "@/src/lib/http/responses";
import { lazyExpireAsyncProgress } from "@/src/lib/sessions/expiry";
import { findActiveSessionByPin } from "@/src/lib/sessions/lookup";
import { writeLog } from "@/src/lib/logging";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/server";

interface AdvanceRouteContext {
  params: Promise<{ pin: string }>;
}

interface AdvanceSuccessBody {
  status: "advanced" | "completed";
  questionId?: string;
  questionIndex?: number;
}

interface AdvanceErrorBody {
  error:
    | "SESSION_NOT_FOUND"
    | "TOKEN_SESSION_MISMATCH"
    | "PARTICIPANT_NOT_FOUND"
    | "NOT_ASYNC_MODE"
    | "CURRENT_NOT_REVEALED"
    | "ADVANCE_FAILED";
  message: string;
}

type AdvanceResponseBody = AdvanceSuccessBody | AdvanceErrorBody;

/**
 * ADR-0007 §2.3 — async advancement.
 * The participant taps "next" after their current question is revealed.
 * The server creates the next `participant_question_progress` row with
 * a fresh server-authored timer. Sync mode advancement is host-driven
 * via `/api/host/[pin]/question/next` — this endpoint refuses sync.
 */
export async function POST(
  _request: NextRequest,
  context: AdvanceRouteContext,
) {
  const { pin } = await context.params;
  const auth = await requireRole("participant");

  if (!auth.ok) {
    return auth.response;
  }

  const serviceSupabase = await createServiceRoleSupabaseClient();
  const { data: session } = await findActiveSessionByPin(serviceSupabase, pin);

  if (!session) {
    return noStoreJson<AdvanceResponseBody>(
      { error: "SESSION_NOT_FOUND", message: "Session not found." },
      { status: 404 },
    );
  }

  if (auth.claims.sessionId !== session.id) {
    return noStoreJson<AdvanceResponseBody>(
      {
        error: "TOKEN_SESSION_MISMATCH",
        message: "This token is scoped to a different session.",
      },
      { status: 403 },
    );
  }

  if (session.game_mode !== "async") {
    return noStoreJson<AdvanceResponseBody>(
      {
        error: "NOT_ASYNC_MODE",
        message: "Sync sessions advance via the host.",
      },
      { status: 409 },
    );
  }

  const participantId = auth.claims.userId;

  const { data: participant } = await serviceSupabase
    .from("session_participants")
    .select("id, session_id, status")
    .eq("session_id", session.id)
    .eq("id", participantId)
    .maybeSingle();

  if (!participant) {
    return noStoreJson<AdvanceResponseBody>(
      { error: "PARTICIPANT_NOT_FOUND", message: "Participant row missing." },
      { status: 404 },
    );
  }

  // Find the participant's current (latest) progress row.
  const { data: latestProgressRows } = await serviceSupabase
    .from("participant_question_progress")
    .select("*")
    .eq("session_id", session.id)
    .eq("participant_id", participantId)
    .order("question_index", { ascending: false })
    .limit(1);

  const latestProgress = latestProgressRows?.[0] ?? null;

  if (!latestProgress) {
    return noStoreJson<AdvanceResponseBody>(
      {
        error: "CURRENT_NOT_REVEALED",
        message: "No current question to advance from.",
      },
      { status: 409 },
    );
  }

  // Lazy-expire so the current row reaches `revealed` if its deadline
  // has passed. Async sessions auto-reveal on lock per ADR-0007 §2.4.
  const { row: refreshedCurrent } = await lazyExpireAsyncProgress(
    serviceSupabase,
    session.id,
    participantId,
    latestProgress.question_id,
  );

  const currentStatus = refreshedCurrent?.status ?? latestProgress.status;
  if (currentStatus !== "revealed") {
    return noStoreJson<AdvanceResponseBody>(
      {
        error: "CURRENT_NOT_REVEALED",
        message: "Current question is not yet revealed.",
      },
      { status: 409 },
    );
  }

  // Find the next question by ordinal.
  const { data: nextQuestion } = await serviceSupabase
    .from("questions")
    .select("id, ordinal, time_seconds")
    .eq("quiz_id", session.quiz_id)
    .gt("ordinal", latestProgress.question_index)
    .order("ordinal", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!nextQuestion) {
    // No more questions — mark participant completed.
    await serviceSupabase
      .from("session_participants")
      .update({ status: "completed" })
      .eq("id", participantId);

    return noStoreJson<AdvanceResponseBody>(
      { status: "completed" },
      { status: 200 },
    );
  }

  // Idempotency: if a progress row for this next question already exists
  // (because the participant tapped "next" twice), return it.
  const { data: existingNext } = await serviceSupabase
    .from("participant_question_progress")
    .select("*")
    .eq("session_id", session.id)
    .eq("participant_id", participantId)
    .eq("question_id", nextQuestion.id)
    .maybeSingle();

  if (existingNext) {
    return noStoreJson<AdvanceResponseBody>(
      {
        status: "advanced",
        questionId: existingNext.question_id,
        questionIndex: existingNext.question_index,
      },
      { status: 200 },
    );
  }

  const startedAt = new Date();
  const deadlineAt = new Date(
    startedAt.getTime() + nextQuestion.time_seconds * 1000,
  );

  const { data: created, error: createError } = await serviceSupabase
    .from("participant_question_progress")
    .insert({
      session_id: session.id,
      participant_id: participantId,
      question_id: nextQuestion.id,
      question_index: nextQuestion.ordinal,
      status: "answering",
      started_at: startedAt.toISOString(),
      deadline_at: deadlineAt.toISOString(),
    })
    .select("*")
    .maybeSingle();

  if (createError || !created) {
    writeLog({
      level: "error",
      message: "Async progress advance insert failed",
      context: {
        sessionId: session.id,
        participantId,
        questionId: nextQuestion.id,
        error: createError?.message ?? "unknown",
      },
    });

    return noStoreJson<AdvanceResponseBody>(
      { error: "ADVANCE_FAILED", message: "Could not advance to the next question." },
      { status: 500 },
    );
  }

  return noStoreJson<AdvanceResponseBody>(
    {
      status: "advanced",
      questionId: created.question_id,
      questionIndex: created.question_index,
    },
    { status: 200 },
  );
}
