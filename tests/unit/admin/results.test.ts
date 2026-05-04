import { describe, expect, it } from "vitest";

import {
  aggregateAccuracy,
  summarizeResponses,
  topScorers,
} from "@/src/lib/admin/results";
import type {
  AdminSessionResultAnswer,
  AdminSessionResultPlayer,
} from "@/src/lib/admin/api-client";

const PLAYER = (
  overrides: Partial<AdminSessionResultPlayer>,
): AdminSessionResultPlayer => ({
  id: "p1",
  firstName: "אורי",
  lastName: "כהן",
  phone: "0500000000",
  unit: null,
  team: null,
  status: "joined",
  totalScore: 0,
  correctCount: 0,
  streak: 0,
  joinedAt: "2026-04-30T20:00:00Z",
  ...overrides,
});

const ANSWER = (
  overrides: Partial<AdminSessionResultAnswer>,
): AdminSessionResultAnswer => ({
  questionId: "q1",
  participantId: "p1",
  submittedAt: "2026-04-30T20:01:00Z",
  selectedIds: ["a"],
  pinLat: null,
  pinLng: null,
  isCorrect: true,
  score: 1500,
  timeBonus: 200,
  ...overrides,
});

describe("aggregateAccuracy", () => {
  it("computes correct/total per question and rounds the percentage", () => {
    const rows = aggregateAccuracy([
      ANSWER({ questionId: "q1", isCorrect: true }),
      ANSWER({ questionId: "q1", isCorrect: false, participantId: "p2" }),
      ANSWER({ questionId: "q2", isCorrect: true }),
    ]);
    const q1 = rows.find((r) => r.questionId === "q1");
    const q2 = rows.find((r) => r.questionId === "q2");
    expect(q1).toMatchObject({ correct: 1, total: 2, accuracyPct: 50 });
    expect(q2).toMatchObject({ correct: 1, total: 1, accuracyPct: 100 });
  });

  it("returns an empty array when there are no answers", () => {
    expect(aggregateAccuracy([])).toEqual([]);
  });
});

describe("topScorers", () => {
  it("sorts by score desc and tiebreaks on correctCount then joinedAt", () => {
    const players = [
      PLAYER({
        id: "p1",
        totalScore: 1500,
        correctCount: 2,
        joinedAt: "2026-01-01",
      }),
      PLAYER({
        id: "p2",
        totalScore: 1500,
        correctCount: 3,
        joinedAt: "2026-01-02",
      }),
      PLAYER({
        id: "p3",
        totalScore: 2000,
        correctCount: 1,
        joinedAt: "2026-01-03",
      }),
    ];
    const top = topScorers(players, 2);
    expect(top.map((p) => p.id)).toEqual(["p3", "p2"]);
  });

  it("respects the limit", () => {
    const players = Array.from({ length: 10 }).map((_, i) =>
      PLAYER({ id: `p${i}`, totalScore: 100 - i }),
    );
    expect(topScorers(players, 3)).toHaveLength(3);
  });
});

describe("summarizeResponses", () => {
  it("counts total players, finished players, and total answers", () => {
    const result = summarizeResponses(
      [PLAYER({ status: "joined" }), PLAYER({ id: "p2", status: "completed" })],
      [ANSWER({}), ANSWER({ questionId: "q2" })],
    );
    expect(result).toEqual({
      totalPlayers: 2,
      finishedPlayers: 1,
      totalAnswers: 2,
    });
  });
});
