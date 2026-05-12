import { type NextRequest } from "next/server";

import { privateNoStoreJson } from "@/src/lib/http/responses";
import { requireRole } from "@/src/lib/auth/server-auth";
import { computeMediaPaddedDeadline } from "@/src/lib/sessions/deadline";
import { findPublicSessionByPin } from "@/src/lib/sessions/lookup";
import {
  lazyExpireAsyncProgress,
  lazyExpireSyncQuestionState,
} from "@/src/lib/sessions/expiry";
import {
  buildParticipantAnswerPayload,
  buildParticipantQuestionPayload,
  extractMapGeoTarget,
  type ParticipantStateResponse,
} from "@/src/lib/sessions/participant-payload";
import { writeLog } from "@/src/lib/logging";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/server";

interface ParticipantStateRouteContext {
  params: Promise<{ pin: string }>;
}

interface ParticipantStateErrorBody {
  error:
    | "SESSION_NOT_FOUND"
    | "PARTICIPANT_NOT_FOUND"
    | "TOKEN_SESSION_MISMATCH";
  message: string;
}

type ParticipantStateResponseBody =
  | ParticipantStateResponse
  | ParticipantStateErrorBody;

export async function GET(
  _request: NextRequest,
  context: ParticipantStateRouteContext,
) {
  const { pin } = await context.params;
  const auth = await requireRole("participant");

  if (!auth.ok) {
    return auth.response;
  }

  const serviceSupabase = await createServiceRoleSupabaseClient();
  // Include 'ended' so finished participants can still fetch their final
  // state (status, score, reveal) and the /play screen can transition to
  // /result via the existing session.status === "ended" effect [QA-18].
  // Auth still binds the cookie to a specific session_id below.
  const { data: session } = await findPublicSessionByPin(serviceSupabase, pin);

  if (!session) {
    return privateNoStoreJson<ParticipantStateResponseBody>(
      { error: "SESSION_NOT_FOUND", message: "Session not found." },
      { status: 404 },
    );
  }

  if (auth.claims.sessionId !== session.id) {
    return privateNoStoreJson<ParticipantStateResponseBody>(
      {
        error: "TOKEN_SESSION_MISMATCH",
        message: "This token is scoped to a different session.",
      },
      { status: 403 },
    );
  }

  const userId = auth.claims.userId;
  const sessionId = session.id;
  const quizId = session.quiz_id;
  const syncCurrentQuestionId =
    session.game_mode === "sync" ? session.current_question_id : null;

  // Wave A: every lookup that depends only on already-known IDs (sessionId,
  // quizId, userId) runs in parallel. score uses userId directly (it equals
  // participant.id by ADR-0007). currentQuestion only fetched in sync mode.
  const [
    { data: participant, error: participantError },
    { data: quiz },
    { count: totalQuestions },
    { data: scoreRow },
    currentQuestionResult,
  ] = await Promise.all([
    serviceSupabase
      .from("session_participants")
      .select("id, session_id, streak, status")
      .eq("session_id", sessionId)
      .eq("id", userId)
      .maybeSingle(),
    serviceSupabase
      .from("quizzes")
      .select("title, brand_id, custom_logo")
      .eq("id", quizId)
      .maybeSingle(),
    serviceSupabase
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("quiz_id", quizId),
    serviceSupabase
      .from("participant_scores")
      .select("total_score")
      .eq("session_id", sessionId)
      .eq("participant_id", userId)
      .maybeSingle(),
    syncCurrentQuestionId
      ? serviceSupabase
          .from("questions")
          .select(
            "id, ordinal, type, prompt, options, map, image_url, image_alt, image_width, image_height, video_url, video_embed_url, video_provider, video_mime_type, video_duration_seconds, video_poster_url, video_width, video_height, media_lead_seconds, time_seconds, points, correct_ids, explanation",
          )
          .eq("id", syncCurrentQuestionId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (participantError || !participant) {
    return privateNoStoreJson<ParticipantStateResponseBody>(
      { error: "PARTICIPANT_NOT_FOUND", message: "Participant row missing." },
      { status: 404 },
    );
  }

  const sessionPayload: ParticipantStateResponse["session"] = {
    status: session.status,
    gameMode: session.game_mode,
    quizTitle: quiz?.title ?? "",
    brandId: quiz?.brand_id ?? "",
    customLogo: quiz?.custom_logo ?? null,
  };

  const myScore = scoreRow?.total_score ?? 0;

  // Sync mode: shared current_question_id; question state is per-session.
  if (session.game_mode === "sync") {
    if (!syncCurrentQuestionId) {
      return privateNoStoreJson<ParticipantStateResponseBody>(
        {
          session: sessionPayload,
          question: null,
          myAnswer: null,
          myScore,
          reveal: null,
        },
        { status: 200 },
      );
    }

    const currentQuestion = currentQuestionResult.data;

    if (!currentQuestion) {
      writeLog({
        level: "warn",
        message: "Sync session pointed at missing question",
        context: { sessionId, currentQuestionId: syncCurrentQuestionId },
      });
      return privateNoStoreJson<ParticipantStateResponseBody>(
        {
          session: sessionPayload,
          question: null,
          myAnswer: null,
          myScore,
          reveal: null,
        },
        { status: 200 },
      );
    }

    // Wave B: lazy expiry (read-mostly; writes only when deadline crossed)
    // and existingAnswer have no data dependency on each other.
    const [{ row: questionState }, { data: existingAnswer }] =
      await Promise.all([
        lazyExpireSyncQuestionState(
          serviceSupabase,
          sessionId,
          currentQuestion.id,
          { autoReveal: session.auto_reveal },
        ),
        serviceSupabase
          .from("answers")
          .select("*")
          .eq("session_id", sessionId)
          .eq("question_id", currentQuestion.id)
          .eq("participant_id", userId)
          .maybeSingle(),
      ]);

    const status = questionState?.status ?? "idle";
    const isRevealed = status === "revealed";

    const questionPayload = buildParticipantQuestionPayload({
      ordinal: currentQuestion.ordinal,
      totalQuestions: totalQuestions ?? 0,
      question: currentQuestion,
      status,
      startedAt: questionState?.started_at ?? null,
      deadlineAt: questionState?.deadline_at ?? null,
      serverNow: new Date(),
    });

    if (!questionPayload) {
      writeLog({
        level: "error",
        message: "Stored question JSON failed participant serialization",
        context: { sessionId, questionId: currentQuestion.id },
      });
      return privateNoStoreJson<ParticipantStateResponseBody>(
        {
          session: sessionPayload,
          question: null,
          myAnswer: null,
          myScore,
          reveal: null,
        },
        { status: 200 },
      );
    }

    const answerPayload = existingAnswer
      ? buildParticipantAnswerPayload(existingAnswer, isRevealed, {
          deadlineAt: questionState?.deadline_at ?? null,
          timeSeconds: currentQuestion.time_seconds,
        })
      : null;

    const reveal = isRevealed
      ? {
          correctIds: currentQuestion.correct_ids,
          explanation: currentQuestion.explanation,
          mapGeoTarget: extractMapGeoTarget(currentQuestion.map),
        }
      : null;

    return privateNoStoreJson<ParticipantStateResponseBody>(
      {
        session: sessionPayload,
        question: questionPayload,
        myAnswer: answerPayload,
        myScore,
        reveal,
      },
      { status: 200 },
    );
  }

  // Async mode: per-participant progress; the participant is on the latest
  // question_index that has a row in participant_question_progress.
  const { data: progressRows } = await serviceSupabase
    .from("participant_question_progress")
    .select("*")
    .eq("session_id", session.id)
    .eq("participant_id", participant.id)
    .order("question_index", { ascending: false })
    .limit(1);

  let currentProgress = progressRows?.[0] ?? null;

  // ADR-0007 §2.3 bootstrap: when a participant fetches state and no
  // progress row exists, the server creates the row for question 1 with
  // started_at = now(), deadline_at = now() + question.time_seconds.
  // Without this, an async participant has no entry point.
  if (!currentProgress) {
    const { data: firstQuestion } = await serviceSupabase
      .from("questions")
      .select("id, ordinal, time_seconds, media_lead_seconds")
      .eq("quiz_id", session.quiz_id)
      .order("ordinal", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!firstQuestion) {
      return privateNoStoreJson<ParticipantStateResponseBody>(
        {
          session: sessionPayload,
          question: null,
          myAnswer: null,
          myScore,
          reveal: null,
        },
        { status: 200 },
      );
    }

    const startedAt = new Date();
    const deadlineAt = computeMediaPaddedDeadline(
      startedAt,
      firstQuestion.time_seconds,
      firstQuestion.media_lead_seconds,
    );

    const { data: created } = await serviceSupabase
      .from("participant_question_progress")
      .insert({
        session_id: session.id,
        participant_id: participant.id,
        question_id: firstQuestion.id,
        question_index: firstQuestion.ordinal,
        status: "answering",
        started_at: startedAt.toISOString(),
        deadline_at: deadlineAt.toISOString(),
      })
      .select("*")
      .maybeSingle();

    currentProgress = created ?? null;

    if (!currentProgress) {
      writeLog({
        level: "warn",
        message: "Async progress bootstrap insert returned no row",
        context: {
          sessionId: session.id,
          participantId: participant.id,
          questionId: firstQuestion.id,
        },
      });
      return privateNoStoreJson<ParticipantStateResponseBody>(
        {
          session: sessionPayload,
          question: null,
          myAnswer: null,
          myScore,
          reveal: null,
        },
        { status: 200 },
      );
    }
  }

  const { row: progress } = await lazyExpireAsyncProgress(
    serviceSupabase,
    session.id,
    participant.id,
    currentProgress.question_id,
  );

  const { data: question } = await serviceSupabase
    .from("questions")
    .select(
      "id, ordinal, type, prompt, options, map, image_url, image_alt, image_width, image_height, video_url, video_embed_url, video_provider, video_mime_type, video_duration_seconds, video_poster_url, video_width, video_height, media_lead_seconds, time_seconds, points, correct_ids, explanation",
    )
    .eq("id", currentProgress.question_id)
    .maybeSingle();

  if (!question) {
    return privateNoStoreJson<ParticipantStateResponseBody>(
      {
        session: sessionPayload,
        question: null,
        myAnswer: null,
        myScore,
        reveal: null,
      },
      { status: 200 },
    );
  }

  const status = progress?.status ?? currentProgress.status;
  const isRevealed = status === "revealed";

  const questionPayload = buildParticipantQuestionPayload({
    ordinal: question.ordinal,
    totalQuestions: totalQuestions ?? 0,
    question,
    status,
    startedAt: progress?.started_at ?? currentProgress.started_at,
    deadlineAt: progress?.deadline_at ?? currentProgress.deadline_at,
    serverNow: new Date(),
  });

  if (!questionPayload) {
    writeLog({
      level: "error",
      message: "Stored question JSON failed participant serialization",
      context: { sessionId: session.id, questionId: question.id },
    });
    return privateNoStoreJson<ParticipantStateResponseBody>(
      {
        session: sessionPayload,
        question: null,
        myAnswer: null,
        myScore,
        reveal: null,
      },
      { status: 200 },
    );
  }

  const { data: existingAnswer } = await serviceSupabase
    .from("answers")
    .select("*")
    .eq("session_id", session.id)
    .eq("question_id", question.id)
    .eq("participant_id", participant.id)
    .maybeSingle();

  const answerPayload = existingAnswer
    ? buildParticipantAnswerPayload(existingAnswer, isRevealed, {
        deadlineAt: progress?.deadline_at ?? currentProgress.deadline_at,
        timeSeconds: question.time_seconds,
      })
    : null;

  const reveal = isRevealed
    ? {
        correctIds: question.correct_ids,
        explanation: question.explanation,
        mapGeoTarget: extractMapGeoTarget(question.map),
      }
    : null;

  return privateNoStoreJson<ParticipantStateResponseBody>(
    {
      session: sessionPayload,
      question: questionPayload,
      myAnswer: answerPayload,
      myScore,
      reveal,
    },
    { status: 200 },
  );
}
