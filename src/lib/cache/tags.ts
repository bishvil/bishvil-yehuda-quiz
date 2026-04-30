import { revalidateTag } from "next/cache";

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

/**
 * Wrap revalidateTag so a missing Next static-generation store (which
 * happens in vitest and other non-Next runtimes) doesn't crash callers.
 * In production this delegates straight through.
 */
export function safeRevalidateTag(tag: string): void {
  try {
    revalidateTag(tag, "default");
  } catch {
    // No active Next request store — tag invalidation has no audience yet.
  }
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
