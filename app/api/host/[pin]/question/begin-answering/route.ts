import { type NextRequest } from "next/server";
import { z } from "zod";

import {
  questionCacheTag,
  safeRevalidateTag,
  sessionCacheTag,
} from "@/src/lib/cache/tags";
import { privateNoStoreJson } from "@/src/lib/http/responses";
import { writeLog } from "@/src/lib/logging";
import { loadHostContext } from "@/src/lib/sessions/host-context";

interface HostQuestionBeginAnsweringRouteContext {
  params: Promise<{ pin: string }>;
}

interface HostQuestionBeginAnsweringSuccessBody {
  sessionId: string;
  questionId: string;
  questionIndex: number;
  status: "answering";
  startedAt: string;
  deadlineAt: string;
}

interface HostQuestionBeginAnsweringErrorBody {
  error:
    | "INVALID_REQUEST"
    | "QUESTION_NOT_FOUND"
    | "INVALID_TRANSITION"
    | "SESSION_NOT_LIVE"
    | "WRITE_FAILED";
  message: string;
  code?: string;
  currentStatus?: string;
}

type HostQuestionBeginAnsweringResponseBody =
  | HostQuestionBeginAnsweringSuccessBody
  | HostQuestionBeginAnsweringErrorBody;

const requestSchema = z.object({
  questionId: z.string().uuid(),
});

export async function POST(
  request: NextRequest,
  context: HostQuestionBeginAnsweringRouteContext,
) {
  const { pin } = await context.params;
  const ctx = await loadHostContext(pin);
  if (!ctx.ok) return ctx.response;
  const { session, serviceSupabase, canControl } = ctx;

  if (!canControl || session.status !== "live") {
    return privateNoStoreJson<HostQuestionBeginAnsweringResponseBody>(
      { error: "SESSION_NOT_LIVE", message: "Session is not controllable." },
      { status: 409 },
    );
  }

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return privateNoStoreJson<HostQuestionBeginAnsweringResponseBody>(
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
    return privateNoStoreJson<HostQuestionBeginAnsweringResponseBody>(
      { error: "QUESTION_NOT_FOUND", message: "Question not in this quiz." },
      { status: 404 },
    );
  }

  const { data: existingState } = await serviceSupabase
    .from("question_session_state")
    .select("status")
    .eq("session_id", session.id)
    .eq("question_id", question.id)
    .maybeSingle();

  if (!existingState || existingState.status !== "presenting") {
    return privateNoStoreJson<HostQuestionBeginAnsweringResponseBody>(
      {
        error: "INVALID_TRANSITION",
        code: "QUESTION_INVALID_TRANSITION",
        currentStatus: existingState?.status,
        message: `Cannot begin answering from status ${existingState?.status ?? "missing"}.`,
      },
      { status: 409 },
    );
  }

  const startedAt = new Date();
  const deadlineAt = new Date(startedAt.getTime() + question.time_seconds * 1000);
  const startedAtIso = startedAt.toISOString();
  const deadlineAtIso = deadlineAt.toISOString();

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
      message: "Failed to transition video question to answering",
      context: { sessionId: session.id, questionId: question.id },
    });
    return privateNoStoreJson<HostQuestionBeginAnsweringResponseBody>(
      { error: "WRITE_FAILED", message: "Could not begin answering." },
      { status: 500 },
    );
  }

  safeRevalidateTag(questionCacheTag(session.id, question.id));
  safeRevalidateTag(sessionCacheTag(session.id));

  return privateNoStoreJson<HostQuestionBeginAnsweringResponseBody>({
    sessionId: session.id,
    questionId: question.id,
    questionIndex: question.ordinal,
    status: "answering",
    startedAt: startedAtIso,
    deadlineAt: deadlineAtIso,
  });
}

