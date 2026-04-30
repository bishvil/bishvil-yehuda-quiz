/**
 * Pure aggregation helpers for the admin results view. Splitting these
 * out keeps the page client component tidy and lets us unit-test the
 * accuracy / leaderboard math without rendering React.
 */
import type {
  AdminSessionResultAnswer,
  AdminSessionResultPlayer,
} from "@/src/lib/admin/api-client";

export interface PerQuestionAccuracy {
  questionId: string;
  total: number;
  correct: number;
  accuracyPct: number;
}

export function aggregateAccuracy(
  answers: AdminSessionResultAnswer[],
): PerQuestionAccuracy[] {
  const buckets = new Map<string, { correct: number; total: number }>();
  for (const a of answers) {
    const cur = buckets.get(a.questionId) ?? { correct: 0, total: 0 };
    cur.total += 1;
    if (a.isCorrect) cur.correct += 1;
    buckets.set(a.questionId, cur);
  }
  return Array.from(buckets.entries()).map(([questionId, agg]) => ({
    questionId,
    total: agg.total,
    correct: agg.correct,
    accuracyPct:
      agg.total === 0 ? 0 : Math.round((agg.correct / agg.total) * 100),
  }));
}

export function topScorers(
  players: AdminSessionResultPlayer[],
  limit = 6,
): AdminSessionResultPlayer[] {
  return [...players]
    .sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      // Tiebreak by correct count, then earliest joinedAt.
      if (b.correctCount !== a.correctCount)
        return b.correctCount - a.correctCount;
      return a.joinedAt.localeCompare(b.joinedAt);
    })
    .slice(0, limit);
}

export interface ResponseTotals {
  totalPlayers: number;
  finishedPlayers: number;
  totalAnswers: number;
}

export function summarizeResponses(
  players: AdminSessionResultPlayer[],
  answers: AdminSessionResultAnswer[],
): ResponseTotals {
  return {
    totalPlayers: players.length,
    finishedPlayers: players.filter((p) => p.status === "completed").length,
    totalAnswers: answers.length,
  };
}
