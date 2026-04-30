import { type NextRequest } from "next/server";

import { requireRole } from "@/src/lib/auth/server-auth";
import { submitAnswerRequestSchema } from "@/src/lib/auth/validation";
import { questionCacheTag, safeRevalidateTag } from "@/src/lib/cache/tags";
import { noStoreJson } from "@/src/lib/http/responses";
import { findActiveSessionByPin } from "@/src/lib/sessions/lookup";
import { writeLog } from "@/src/lib/logging";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/server";
import type { Database } from "@/src/lib/supabase/database.types";

interface AnswerRouteContext {
  params: Promise<{ pin: string }>;
}

interface AnswerSubmittedBody {
  status: "submitted" | "already_submitted";
  submittedAt: string;
  isCorrect?: boolean;
  score?: number;
  timeBonus?: number;
  correctIds?: string[] | null;
  explanation?: string | null;
}

interface AnswerErrorBody {
  error:
    | "INVALID_REQUEST"
    | "SESSION_NOT_FOUND"
    | "SESSION_ENDED"
    | "SESSION_EXPIRED"
    | "TOKEN_SESSION_MISMATCH"
    | "QUESTION_NOT_FOUND"
    | "QUESTION_NOT_ACTIVE"
    | "LATE_SUBMISSION"
    | "PARTICIPANT_NOT_FOUND"
    | "ANSWER_WRITE_FAILED";
  message: string;
  deadlineAt?: string;
  submittedAt?: string;
}

type AnswerResponseBody = AnswerSubmittedBody | AnswerErrorBody;
type SubmitAnswerRow =
  Database["public"]["Functions"]["submit_answer"]["Returns"][number];
type SubmitAnswerSuccessStatus = "submitted" | "already_submitted";
type CompleteSubmitAnswerRow = SubmitAnswerRow & {
  submitted_at: string;
  is_correct: boolean;
  score: number;
  time_bonus: number;
};

export async function POST(
  request: NextRequest,
  context: AnswerRouteContext,
) {
  const { pin } = await context.params;
  const auth = await requireRole("participant");

  if (!auth.ok) {
    return auth.response;
  }

  const parsed = submitAnswerRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return noStoreJson<AnswerResponseBody>(
      {
        error: "INVALID_REQUEST",
        message: "Submit body must include questionId plus selectedIds or pin.",
      },
      { status: 400 },
    );
  }
  const submission = parsed.data;

  const serviceSupabase = await createServiceRoleSupabaseClient();
  const { data: session } = await findActiveSessionByPin(serviceSupabase, pin);

  if (!session) {
    return noStoreJson<AnswerResponseBody>(
      { error: "SESSION_NOT_FOUND", message: "Session not joinable for this PIN." },
      { status: 404 },
    );
  }

  if (auth.claims.sessionId !== session.id) {
    return noStoreJson<AnswerResponseBody>(
      {
        error: "TOKEN_SESSION_MISMATCH",
        message: "This token is scoped to a different session.",
      },
      { status: 403 },
    );
  }

  if (session.ended_at) {
    const endedAt = Date.parse(session.ended_at);
    if (Number.isFinite(endedAt) && Date.now() > endedAt) {
      return noStoreJson<AnswerResponseBody>(
        { error: "SESSION_EXPIRED", message: "This session has ended." },
        { status: 409 },
      );
    }
  }

  if (session.status === "ended") {
    return noStoreJson<AnswerResponseBody>(
      { error: "SESSION_ENDED", message: "Session is ended." },
      { status: 409 },
    );
  }

  const participantId = auth.claims.userId;
  const submittedAtDate = new Date();
  const { data: submitResult, error: submitError } = await serviceSupabase
    .rpc("submit_answer", {
      p_session_id: session.id,
      p_participant_id: participantId,
      p_question_id: submission.questionId,
      p_selected_ids: "selectedIds" in submission ? submission.selectedIds : null,
      p_pin_x: "pin" in submission ? submission.pin.x : null,
      p_pin_y: "pin" in submission ? submission.pin.y : null,
    })
    .maybeSingle();

  if (submitError || !submitResult) {
    writeLog({
      level: "error",
      message: "submit_answer RPC failed",
      context: {
        sessionId: session.id,
        questionId: submission.questionId,
        participantId,
        error: submitError?.message ?? "unknown",
      },
    });

    return noStoreJson<AnswerResponseBody>(
      { error: "ANSWER_WRITE_FAILED", message: "Could not record answer." },
      { status: 500 },
    );
  }

  if (
    submitResult.result_status === "submitted" ||
    submitResult.result_status === "already_submitted"
  ) {
    if (!isCompleteSubmitAnswerResult(submitResult)) {
      writeLog({
        level: "error",
        message: "submit_answer RPC returned incomplete success payload",
        context: {
          sessionId: session.id,
          questionId: submission.questionId,
          participantId,
          resultStatus: submitResult.result_status,
        },
      });

      return noStoreJson<AnswerResponseBody>(
        { error: "ANSWER_WRITE_FAILED", message: "Could not record answer." },
        { status: 500 },
      );
    }

    safeRevalidateTag(questionCacheTag(session.id, submission.questionId));

    return buildSubmittedResponse(
      submitResult,
      submitResult.result_status,
      session.game_mode === "async" || submitResult.question_status === "revealed",
    );
  }

  if (submitResult.result_status === "participant_not_found") {
    return noStoreJson<AnswerResponseBody>(
      { error: "PARTICIPANT_NOT_FOUND", message: "Participant row missing." },
      { status: 404 },
    );
  }

  if (submitResult.result_status === "question_not_found") {
    return noStoreJson<AnswerResponseBody>(
      { error: "QUESTION_NOT_FOUND", message: "Question not part of this quiz." },
      { status: 404 },
    );
  }

  if (submitResult.result_status === "session_ended") {
    return noStoreJson<AnswerResponseBody>(
      { error: "SESSION_ENDED", message: "Session is ended." },
      { status: 409 },
    );
  }

  if (submitResult.result_status === "session_expired") {
    return noStoreJson<AnswerResponseBody>(
      { error: "SESSION_EXPIRED", message: "This session has ended." },
      { status: 409 },
    );
  }

  return noStoreJson<AnswerResponseBody>(
    {
      error:
        submitResult.result_status === "question_not_active"
          ? "QUESTION_NOT_ACTIVE"
          : "LATE_SUBMISSION",
      message:
        submitResult.result_status === "question_not_active"
          ? "Question has not been activated for this session."
          : "Question deadline has passed.",
      deadlineAt: submitResult.deadline_at ?? undefined,
      submittedAt: submittedAtDate.toISOString(),
    },
    { status: 409 },
  );
}

function isCompleteSubmitAnswerResult(
  result: SubmitAnswerRow,
): result is CompleteSubmitAnswerRow {
  return (
    result.submitted_at !== null &&
    result.is_correct !== null &&
    result.score !== null &&
    result.time_bonus !== null
  );
}

function buildSubmittedResponse(
  answer: CompleteSubmitAnswerRow,
  status: SubmitAnswerSuccessStatus,
  includeReveal: boolean,
) {
  if (includeReveal) {
    return noStoreJson<AnswerResponseBody>(
      {
        status,
        submittedAt: answer.submitted_at,
        isCorrect: answer.is_correct,
        score: answer.score,
        timeBonus: answer.time_bonus,
        correctIds: answer.correct_ids ?? null,
        explanation: answer.explanation ?? null,
      },
      { status: 200 },
    );
  }

  return noStoreJson<AnswerResponseBody>(
    {
      status,
      submittedAt: answer.submitted_at,
    },
    { status: 200 },
  );
}
