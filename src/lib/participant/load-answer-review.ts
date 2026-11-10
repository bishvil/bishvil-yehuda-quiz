import {
  buildPersonalAnswerReview,
  type PersonalAnswerReview,
} from "./answer-review";
import type { Database } from "@/src/lib/supabase/database.types";
import type { ServiceSupabase } from "@/src/lib/sessions/lookup";

type Session = Pick<
  Database["public"]["Tables"]["sessions"]["Row"],
  "id" | "quiz_id" | "game_mode" | "status"
>;
export type PersonalReviewResult =
  | { ok: true; review: PersonalAnswerReview[] }
  | { ok: false; status: 403 | 409 | 500; error: string };
export async function loadPersonalAnswerReview(
  client: ServiceSupabase,
  session: Session,
  participantId: string,
): Promise<PersonalReviewResult> {
  // Scope is checked in the route/page; verify the actual participant row as well.
  const { data: participant, error: participantError } = await client
    .from("session_participants")
    .select("id, status")
    .eq("session_id", session.id)
    .eq("id", participantId)
    .maybeSingle();
  if (participantError)
    return { ok: false, status: 500, error: "REVIEW_READ_FAILED" };
  if (!participant)
    return { ok: false, status: 403, error: "PARTICIPANT_NOT_FOUND" };
  if (participant.status !== "completed" && session.status !== "ended")
    return { ok: false, status: 409, error: "PARTICIPANT_NOT_FINISHED" };
  const [questions, answers, progress] = await Promise.all([
    client
      .from("questions")
      .select(
        "id, ordinal, type, prompt, options, correct_ids, map, settings, points, explanation",
      )
      .eq("quiz_id", session.quiz_id)
      .order("ordinal", { ascending: true }),
    client
      .from("answers")
      .select(
        "question_id, selected_ids, text_answer, is_correct, score, correctness_ratio, distance_km",
      )
      .eq("session_id", session.id)
      .eq("participant_id", participantId),
    session.game_mode === "async"
      ? client
          .from("participant_question_progress")
          .select("question_id, status, started_at")
          .eq("session_id", session.id)
          .eq("participant_id", participantId)
      : client
          .from("question_session_state")
          .select("question_id, status, started_at")
          .eq("session_id", session.id),
  ]);
  if (questions.error || answers.error || progress.error)
    return { ok: false, status: 500, error: "REVIEW_READ_FAILED" };
  return {
    ok: true,
    review: buildPersonalAnswerReview(
      questions.data ?? [],
      answers.data ?? [],
      progress.data ?? [],
    ),
  };
}
