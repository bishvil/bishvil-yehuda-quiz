import { type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";

import { privateNoStoreJson } from "@/src/lib/http/responses";
import { loadHostContext } from "@/src/lib/sessions/host-context";
import { canTransitionQuestion } from "@/src/lib/sessions/state-machine";
import { questionCacheTag, sessionCacheTag } from "@/src/lib/cache/tags";
import { writeLog } from "@/src/lib/logging";

interface HostQuestionStartRouteContext {
  params: Promise<{ pin: string }>;
}

interface HostQuestionStartSuccessBody {
  sessionId: string;
  questionId: string;
  questionIndex: number;
  status: "answering";
  startedAt: string;
  deadlineAt: string;
}

interface HostQuestionStartErrorBody {
  error:
    | "INVALID_REQUEST"
    | "QUESTION_NOT_FOUND"
    | "INVALID_TRANSITION"
    | "SESSION_NOT_LIVE"
    | "WRITE_FAILED";
  message: string;
}

type HostQuestionStartResponseBody =
  | HostQuestionStartSuccessBody
  | HostQuestionStartErrorBody;

const requestSchema = z.object({
  questionId: z.string().uuid(),
});

/**
 * `idle → answering` (sync mode). Sets started_at = now() and
 * deadline_at = now() + question.time_seconds per ADR-0005 §3.1. Refuses if
 * the session is not `live`.
 */
export async function POST(
  request: NextRequest,
  context: HostQuestionStartRouteContext,
) {
  const { pin } = await context.params;
  const ctx = await loadHostContext(pin);
  if (!ctx.ok) return ctx.response;
  const { session, serviceSupabase } = ctx;

  if (session.status !== "live") {
    return privateNoStoreJson<HostQuestionStartResponseBody>(
      {
        error: "SESSION_NOT_LIVE",
        message: `Session status is ${session.status}.`,
      },
      { status: 409 },
    );
  }

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return privateNoStoreJson<HostQuestionStartResponseBody>(
      { error: "INVALID_REQUEST", message: "questionId is required." },
      { status: 400 },
    );
  }

  const { data: question } = await serviceSupabase
    .from("questions")
    .select("id, ordinal, time_seconds, quiz_id")
    .eq("id", parsed.data.questionId)
    .maybeSingle();

  if (!question || question.quiz_id !== session.quiz_id) {
    return privateNoStoreJson<HostQuestionStartResponseBody>(
      { error: "QUESTION_NOT_FOUND", message: "Question not in this quiz." },
      { status: 404 },
    );
  }

  // Read or initialise the per-session question_session_state row.
  const { data: existingState } = await serviceSupabase
    .from("question_session_state")
    .select("*")
    .eq("session_id", session.id)
    .eq("question_id", question.id)
    .maybeSingle();

  if (existingState && !canTransitionQuestion(existingState.status, "answering")) {
    return privateNoStoreJson<HostQuestionStartResponseBody>(
      {
        error: "INVALID_TRANSITION",
        message: `Cannot start question from status ${existingState.status}.`,
      },
      { status: 409 },
    );
  }

  const startedAt = new Date();
  const deadlineAt = new Date(startedAt.getTime() + question.time_seconds * 1000);
  const startedAtIso = startedAt.toISOString();
  const deadlineAtIso = deadlineAt.toISOString();

  if (existingState) {
    const { error: updateError } = await serviceSupabase
      .from("question_session_state")
      .update({
        status: "answering",
        started_at: startedAtIso,
        deadline_at: deadlineAtIso,
        revealed_at: null,
      })
      .eq("session_id", session.id)
      .eq("question_id", question.id);

    if (updateError) {
      writeLog({
        level: "error",
        message: "Failed to update question state to answering",
        context: { sessionId: session.id, questionId: question.id },
      });
      return privateNoStoreJson<HostQuestionStartResponseBody>(
        { error: "WRITE_FAILED", message: "Could not start question." },
        { status: 500 },
      );
    }
  } else {
    const { error: insertError } = await serviceSupabase
      .from("question_session_state")
      .insert({
        session_id: session.id,
        question_id: question.id,
        question_index: question.ordinal,
        status: "answering",
        started_at: startedAtIso,
        deadline_at: deadlineAtIso,
      });

    if (insertError) {
      writeLog({
        level: "error",
        message: "Failed to insert question state row",
        context: { sessionId: session.id, questionId: question.id },
      });
      return privateNoStoreJson<HostQuestionStartResponseBody>(
        { error: "WRITE_FAILED", message: "Could not start question." },
        { status: 500 },
      );
    }
  }

  // Track which question is current at the session level so the participant
  // state route can read session.current_question_id directly.
  await serviceSupabase
    .from("sessions")
    .update({
      current_question_id: question.id,
      host_last_seen_at: startedAtIso,
    })
    .eq("id", session.id);

  revalidateTag(questionCacheTag(session.id, question.id), "default");
  revalidateTag(sessionCacheTag(session.id), "default");

  return privateNoStoreJson<HostQuestionStartResponseBody>(
    {
      sessionId: session.id,
      questionId: question.id,
      questionIndex: question.ordinal,
      status: "answering",
      startedAt: startedAtIso,
      deadlineAt: deadlineAtIso,
    },
    { status: 200 },
  );
}
