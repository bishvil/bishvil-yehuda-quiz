import { describe, expect, it } from "vitest";
import { buildPersonalAnswerReview } from "@/src/lib/participant/answer-review";

type Question = Parameters<typeof buildPersonalAnswerReview>[0][number];
const question = (id: string, overrides: Partial<Question> = {}): Question => ({
  id,
  ordinal: 1,
  type: "open",
  prompt: `Prompt ${id}`,
  options: null,
  correct_ids: [],
  map: null,
  settings: { acceptedAnswers: [`Expected ${id}`] },
  points: 1000,
  explanation: `Explanation ${id}`,
  ...overrides,
});

describe("personal answer review privacy and outcomes", () => {
  it("omits future and unrevealed questions even when they have an answer", () => {
    const review = buildPersonalAnswerReview(
      [question("done"), question("future"), question("answering")],
      [
        {
          question_id: "answering",
          selected_ids: null,
          text_answer: "Mine",
          is_correct: true,
          score: 1000,
          correctness_ratio: "1",
          distance_km: null,
        },
      ],
      [
        { question_id: "done", status: "revealed", started_at: "2026-11-10" },
        {
          question_id: "answering",
          status: "answering",
          started_at: "2026-11-10",
        },
      ],
    );
    expect(review).toHaveLength(1);
    expect(review[0]).toMatchObject({
      questionId: "done",
      outcome: "missed",
      correctAnswer: "Expected done",
      score: 0,
    });
    expect(JSON.stringify(review)).not.toContain("future");
    expect(JSON.stringify(review)).not.toContain("answering");
    expect(JSON.stringify(review)).not.toContain("acceptedAnswers");
  });

  it("distinguishes information from missed questions and preserves the player's own text", () => {
    const review = buildPersonalAnswerReview(
      [question("open"), question("info", { type: "content" })],
      [
        {
          question_id: "open",
          selected_ids: null,
          text_answer: "יְרוּשָׁלַיִם",
          is_correct: true,
          score: 1000,
          correctness_ratio: "1",
          distance_km: null,
        },
      ],
      [
        { question_id: "open", status: "revealed", started_at: "2026-11-10" },
        { question_id: "info", status: "answering", started_at: "2026-11-10" },
      ],
    );
    expect(review[0]).toMatchObject({
      outcome: "correct",
      submittedAnswer: "יְרוּשָׁלַיִם",
      correctAnswer: "Expected open",
    });
    expect(review[1]).toMatchObject({
      outcome: "information",
      correctAnswer: null,
      submittedAnswer: null,
      score: null,
      maxScore: null,
      explanation: null,
    });
  });

  it("uses option labels, partial scores and only revealed map targets", () => {
    const review = buildPersonalAnswerReview(
      [
        question("multi", {
          type: "multi",
          options: [
            { id: "a", text: "Label A" },
            { id: "b", text: "Label B" },
          ],
          correct_ids: ["a", "b"],
        }),
        question("map", {
          type: "map",
          map: { geo: { target: { lat: 31.5, lng: 34.9 }, toleranceKm: 1 } },
        }),
      ],
      [
        {
          question_id: "multi",
          selected_ids: ["a"],
          text_answer: null,
          is_correct: false,
          score: 500,
          correctness_ratio: "0.5",
          distance_km: null,
        },
      ],
      [
        { question_id: "multi", status: "revealed", started_at: null },
        { question_id: "map", status: "revealed", started_at: null },
      ],
    );
    expect(review[0]).toMatchObject({
      outcome: "partial",
      submittedAnswer: "Label A",
      correctAnswer: "Label A · Label B",
      score: 500,
    });
    expect(review[1]?.mapTargetUrl).toContain("31.5,34.9");
  });
});
