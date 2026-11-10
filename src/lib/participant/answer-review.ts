import {
  parseStoredQuestionMap,
  parseStoredQuestionOptions,
} from "@/src/lib/schemas/question-content";
import { readQuestionSettings } from "@/src/lib/schemas/question-settings";
import type { Database } from "@/src/lib/supabase/database.types";

type Question = Pick<
  Database["public"]["Tables"]["questions"]["Row"],
  | "id"
  | "ordinal"
  | "type"
  | "prompt"
  | "options"
  | "correct_ids"
  | "map"
  | "settings"
  | "points"
  | "explanation"
>;
type Answer = Pick<
  Database["public"]["Tables"]["answers"]["Row"],
  | "question_id"
  | "selected_ids"
  | "text_answer"
  | "is_correct"
  | "score"
  | "correctness_ratio"
  | "distance_km"
>;
export interface PersonalAnswerReview {
  questionId: string;
  index: number;
  prompt: string;
  outcome: "correct" | "partial" | "incorrect" | "missed" | "information";
  submittedAnswer: string | null;
  correctAnswer: string | null;
  score: number | null;
  maxScore: number | null;
  explanation: string | null;
  mapTargetUrl: string | null;
  distanceKm: number | null;
}

/** Explicit allow-list: unopened/unrevealed questions never enter the review DTO. */
export function buildPersonalAnswerReview(
  questions: Question[],
  answers: Answer[],
  progress: Array<{
    question_id: string;
    status: string;
    started_at: string | null;
  }>,
): PersonalAnswerReview[] {
  const progressByQuestion = new Map(
    progress.map((row) => [row.question_id, row]),
  );
  const answersByQuestion = new Map(
    answers.map((row) => [row.question_id, row]),
  );
  return questions.flatMap((question) => {
    const state = progressByQuestion.get(question.id);
    const revealed = state?.status === "revealed";
    const information = question.type === "content";
    if (!revealed && !(information && state?.started_at)) return [];
    const answer = answersByQuestion.get(question.id);
    const parsedOptions = parseStoredQuestionOptions(question.options);
    const options = parsedOptions.success ? (parsedOptions.data ?? []) : [];
    const optionText = (ids: string[] | null | undefined) =>
      (ids ?? [])
        .map((id) => options.find((option) => option.id === id)?.text)
        .filter(Boolean)
        .join(" · ") || null;
    const parsedMap = parseStoredQuestionMap(question.map);
    const target = parsedMap.success ? parsedMap.data?.geo.target : null;
    const distance =
      answer?.distance_km != null ? Number(answer.distance_km) : null;
    const ratio =
      answer?.correctness_ratio != null ? Number(answer.correctness_ratio) : 0;
    return [
      {
        questionId: question.id,
        index: question.ordinal,
        prompt: question.prompt,
        outcome: information
          ? "information"
          : !answer
            ? "missed"
            : answer.is_correct
              ? "correct"
              : ratio > 0 && ratio < 1
                ? "partial"
                : "incorrect",
        submittedAnswer: information
          ? null
          : (answer?.text_answer ??
            optionText(answer?.selected_ids) ??
            (answer && question.type === "map" ? "סימון במפה" : null)),
        correctAnswer: information
          ? null
          : question.type === "open"
            ? (readQuestionSettings(question.settings).acceptedAnswers?.find(
                (value) => value.trim(),
              ) ?? null)
            : optionText(question.correct_ids),
        score: information ? null : (answer?.score ?? 0),
        maxScore: information ? null : question.points,
        explanation: revealed ? question.explanation : null,
        mapTargetUrl:
          !information && question.type === "map" && target
            ? `https://www.google.com/maps/search/?api=1&query=${target.lat},${target.lng}`
            : null,
        distanceKm:
          distance != null && Number.isFinite(distance) ? distance : null,
      } satisfies PersonalAnswerReview,
    ];
  });
}
