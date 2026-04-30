import { type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";

import { requireRole } from "@/src/lib/auth/server-auth";
import { submitAnswerRequestSchema } from "@/src/lib/auth/validation";
import { questionCacheTag } from "@/src/lib/cache/tags";
import { noStoreJson } from "@/src/lib/http/responses";
import {
  computeScore,
  isChoiceAnswerCorrect,
  isMapAnswerCorrect,
} from "@/src/lib/scoring";
import {
  lazyExpireAsyncProgress,
  lazyExpireSyncQuestionState,
} from "@/src/lib/sessions/expiry";
import { findActiveSessionByPin } from "@/src/lib/sessions/lookup";
import { writeLog } from "@/src/lib/logging";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/server";
import type {
  Database,
  QuestionMap,
} from "@/src/lib/supabase/database.types";

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

type AnswerRow = Database["public"]["Tables"]["answers"]["Row"];

const POSTGRES_UNIQUE_VIOLATION_CODE = "23505";

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

  // ADR-0007 §Open Q2 RESOLVED: explicit ended_at deadline check.
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

  const { data: participant } = await serviceSupabase
    .from("session_participants")
    .select("id, session_id, streak, status")
    .eq("session_id", session.id)
    .eq("id", participantId)
    .maybeSingle();

  if (!participant) {
    return noStoreJson<AnswerResponseBody>(
      { error: "PARTICIPANT_NOT_FOUND", message: "Participant row missing." },
      { status: 404 },
    );
  }

  const { data: question } = await serviceSupabase
    .from("questions")
    .select(
      "id, quiz_id, type, correct_ids, map, points, time_seconds, tolerance, explanation",
    )
    .eq("id", submission.questionId)
    .maybeSingle();

  if (!question || question.quiz_id !== session.quiz_id) {
    return noStoreJson<AnswerResponseBody>(
      { error: "QUESTION_NOT_FOUND", message: "Question not part of this quiz." },
      { status: 404 },
    );
  }

  // Lazy-expire question state. In sync mode the row is shared per session.
  // In async mode each participant has their own row.
  const submittedAtDate = new Date();
  let startedAtIso: string | null = null;
  let deadlineAtIso: string | null = null;
  let questionStatus: string | null = null;

  if (session.game_mode === "sync") {
    const { row } = await lazyExpireSyncQuestionState(
      serviceSupabase,
      session.id,
      question.id,
      {
        autoReveal: session.auto_reveal,
        nowMillis: submittedAtDate.getTime(),
      },
    );
    startedAtIso = row?.started_at ?? null;
    deadlineAtIso = row?.deadline_at ?? null;
    questionStatus = row?.status ?? null;
  } else {
    const { row } = await lazyExpireAsyncProgress(
      serviceSupabase,
      session.id,
      participantId,
      question.id,
      { nowMillis: submittedAtDate.getTime() },
    );
    startedAtIso = row?.started_at ?? null;
    deadlineAtIso = row?.deadline_at ?? null;
    questionStatus = row?.status ?? null;
  }

  if (questionStatus !== "answering") {
    // Idempotency: if the participant already has an answer row for this
    // question, return it (ADR-0006 §4) — late or post-reveal duplicate
    // retries should not break the client flow.
    const { data: existing } = await serviceSupabase
      .from("answers")
      .select("*")
      .eq("session_id", session.id)
      .eq("question_id", question.id)
      .eq("participant_id", participantId)
      .maybeSingle();

    if (existing) {
      return buildAlreadySubmittedResponse(
        existing,
        session.game_mode === "async" || questionStatus === "revealed",
        question.correct_ids,
        question.explanation,
      );
    }

    return noStoreJson<AnswerResponseBody>(
      {
        error: questionStatus === null ? "QUESTION_NOT_ACTIVE" : "LATE_SUBMISSION",
        message:
          questionStatus === null
            ? "Question has not been activated for this session."
            : "Question deadline has passed.",
        deadlineAt: deadlineAtIso ?? undefined,
        submittedAt: submittedAtDate.toISOString(),
      },
      { status: 409 },
    );
  }

  if (!startedAtIso || !deadlineAtIso) {
    return noStoreJson<AnswerResponseBody>(
      {
        error: "QUESTION_NOT_ACTIVE",
        message: "Question is missing a server timer.",
      },
      { status: 409 },
    );
  }

  // Check existing answer first to short-circuit a duplicate submit.
  const { data: existingAnswer } = await serviceSupabase
    .from("answers")
    .select("*")
    .eq("session_id", session.id)
    .eq("question_id", question.id)
    .eq("participant_id", participantId)
    .maybeSingle();

  if (existingAnswer) {
    // questionStatus is narrowed to "answering" here; the only reveal
    // condition that applies is async mode (auto-reveal at lock).
    return buildAlreadySubmittedResponse(
      existingAnswer,
      session.game_mode === "async",
      question.correct_ids,
      question.explanation,
    );
  }

  const isCorrect = computeIsCorrect(submission, question);
  const scoring = computeScore({
    isCorrect,
    points: question.points,
    startedAt: new Date(startedAtIso),
    deadlineAt: new Date(deadlineAtIso),
    submittedAt: submittedAtDate,
    timeSeconds: question.time_seconds,
  });

  const answerInsert: Database["public"]["Tables"]["answers"]["Insert"] = {
    session_id: session.id,
    question_id: question.id,
    participant_id: participantId,
    submitted_at: submittedAtDate.toISOString(),
    selected_ids: "selectedIds" in submission ? submission.selectedIds : null,
    pin_x: "pin" in submission ? submission.pin.x.toString() : null,
    pin_y: "pin" in submission ? submission.pin.y.toString() : null,
    is_correct: isCorrect,
    time_bonus: scoring.timeBonus,
    score: scoring.score,
  };

  const { data: insertedAnswer, error: insertError } = await serviceSupabase
    .from("answers")
    .insert(answerInsert)
    .select("*")
    .maybeSingle();

  if (insertError || !insertedAnswer) {
    // Race-condition: another concurrent INSERT won the unique constraint.
    // Re-read for idempotency per ADR-0006 §4.
    if (
      insertError?.code === POSTGRES_UNIQUE_VIOLATION_CODE ||
      insertError?.message?.includes("duplicate key")
    ) {
      const { data: raceWinner } = await serviceSupabase
        .from("answers")
        .select("*")
        .eq("session_id", session.id)
        .eq("question_id", question.id)
        .eq("participant_id", participantId)
        .maybeSingle();

      if (raceWinner) {
        return buildAlreadySubmittedResponse(
          raceWinner,
          session.game_mode === "async",
          question.correct_ids,
          question.explanation,
        );
      }
    }

    writeLog({
      level: "error",
      message: "Answer insert failed",
      context: {
        sessionId: session.id,
        questionId: question.id,
        participantId,
        error: insertError?.message ?? "unknown",
      },
    });

    return noStoreJson<AnswerResponseBody>(
      { error: "ANSWER_WRITE_FAILED", message: "Could not record answer." },
      { status: 500 },
    );
  }

  // Update participant_scores summary and streak. These are best-effort
  // post-write; if they fail, the answer row is canonical and a later cron
  // can reconcile. The streak resets to 0 on a wrong answer per ADR-0006 §5.
  await Promise.all([
    upsertParticipantScores(
      serviceSupabase,
      session.id,
      participantId,
      scoring.score,
      isCorrect,
    ),
    serviceSupabase
      .from("session_participants")
      .update({
        streak: isCorrect ? participant.streak + 1 : 0,
        status: participant.status === "joined" ? "in_progress" : participant.status,
      })
      .eq("id", participantId),
  ]);

  // Async mode auto-reveals on lock; tell the participant the answer right
  // away. Sync mode awaits host reveal — only `submitted` is shared.
  // The tag pattern matches ADR-0008 §1.1; in Next 16 `revalidateTag` takes
  // (tag, profile) — `default` is the standard expire-now profile.
  revalidateTag(questionCacheTag(session.id, question.id), "default");

  if (session.game_mode === "async") {
    return noStoreJson<AnswerResponseBody>(
      {
        status: "submitted",
        submittedAt: insertedAnswer.submitted_at,
        isCorrect: insertedAnswer.is_correct,
        score: insertedAnswer.score,
        timeBonus: insertedAnswer.time_bonus,
        correctIds: question.correct_ids,
        explanation: question.explanation,
      },
      { status: 200 },
    );
  }

  return noStoreJson<AnswerResponseBody>(
    {
      status: "submitted",
      submittedAt: insertedAnswer.submitted_at,
    },
    { status: 200 },
  );
}

function computeIsCorrect(
  submission:
    | { questionId: string; selectedIds: string[] }
    | { questionId: string; pin: { x: number; y: number } },
  question: {
    type: Database["public"]["Tables"]["questions"]["Row"]["type"];
    correct_ids: string[] | null;
    map: Database["public"]["Tables"]["questions"]["Row"]["map"];
  } & {
    tolerance?: string | null;
  },
): boolean {
  if ("selectedIds" in submission) {
    if (!question.correct_ids) return false;
    return isChoiceAnswerCorrect(submission.selectedIds, question.correct_ids);
  }

  if (!question.map) return false;
  const mapPayload = question.map as unknown as QuestionMap;
  const tolerance = question.tolerance ? Number.parseFloat(question.tolerance) : 0;
  return isMapAnswerCorrect(submission.pin, mapPayload.target, tolerance);
}

async function upsertParticipantScores(
  supabase: Awaited<ReturnType<typeof createServiceRoleSupabaseClient>>,
  sessionId: string,
  participantId: string,
  scoreDelta: number,
  isCorrect: boolean,
): Promise<void> {
  const { data: existing } = await supabase
    .from("participant_scores")
    .select("total_score, correct_count")
    .eq("session_id", sessionId)
    .eq("participant_id", participantId)
    .maybeSingle();

  if (!existing) {
    await supabase.from("participant_scores").insert({
      session_id: sessionId,
      participant_id: participantId,
      total_score: scoreDelta,
      correct_count: isCorrect ? 1 : 0,
      last_updated_at: new Date().toISOString(),
    });
    return;
  }

  await supabase
    .from("participant_scores")
    .update({
      total_score: existing.total_score + scoreDelta,
      correct_count: existing.correct_count + (isCorrect ? 1 : 0),
      last_updated_at: new Date().toISOString(),
    })
    .eq("session_id", sessionId)
    .eq("participant_id", participantId);
}

function buildAlreadySubmittedResponse(
  answer: AnswerRow,
  includeReveal: boolean,
  correctIds: string[] | null,
  explanation: string | null,
) {
  if (includeReveal) {
    return noStoreJson<AnswerResponseBody>(
      {
        status: "already_submitted",
        submittedAt: answer.submitted_at,
        isCorrect: answer.is_correct,
        score: answer.score,
        timeBonus: answer.time_bonus,
        correctIds,
        explanation,
      },
      { status: 200 },
    );
  }

  return noStoreJson<AnswerResponseBody>(
    {
      status: "already_submitted",
      submittedAt: answer.submitted_at,
    },
    { status: 200 },
  );
}
