/**
 * Cache tag pattern per ADR-0008 §1.1. The tags themselves only bind
 * meaning when a route uses Next's data cache (`unstable_cache` or the
 * `'use cache'` directive) — until then, `revalidateTag` calls are no-ops.
 * They're called on mutations now so the pattern is in place when the
 * data-cached versions land.
 */
export function questionCacheTag(sessionId: string, questionId: string): string {
  return `question:${sessionId}:${questionId}`;
}

export function sessionCacheTag(sessionId: string): string {
  return `session:${sessionId}`;
}

export function questionCountsCacheTag(
  sessionId: string,
  questionId: string,
): string {
  return `question-counts:${sessionId}:${questionId}`;
}

export function quizInfoCacheTag(pin: string): string {
  return `quiz-info:${pin}`;
}
