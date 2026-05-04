/**
 * In-memory token-bucket rate limiter shared across admin upload endpoints.
 *
 * One bucket per (kind, userId) key. Tokens refill at one per
 * RATE_LIMIT_REFILL_INTERVAL_MS up to RATE_LIMIT_CAPACITY.
 */

interface TokenBucket {
  tokens: number;
  updatedAt: number;
}

const RATE_LIMIT_CAPACITY = 10;
const RATE_LIMIT_REFILL_INTERVAL_MS = 10_000;
const rateLimitBuckets = new Map<string, TokenBucket>();

/**
 * Consume one token for the given key.
 * Returns `true` when the request is allowed, `false` when rate-limited.
 */
export function consumeUploadToken(key: string): boolean {
  const now = Date.now();
  const current = rateLimitBuckets.get(key) ?? {
    tokens: RATE_LIMIT_CAPACITY,
    updatedAt: now,
  };
  const refill = Math.floor(
    (now - current.updatedAt) / RATE_LIMIT_REFILL_INTERVAL_MS,
  );
  const tokens = Math.min(RATE_LIMIT_CAPACITY, current.tokens + refill);
  const updatedAt =
    refill > 0
      ? current.updatedAt + refill * RATE_LIMIT_REFILL_INTERVAL_MS
      : now;

  if (tokens <= 0) {
    rateLimitBuckets.set(key, { tokens: 0, updatedAt });
    return false;
  }

  rateLimitBuckets.set(key, { tokens: tokens - 1, updatedAt });
  return true;
}

/** Reset all buckets — for use in tests only. */
export function resetRateLimitsForTests(): void {
  rateLimitBuckets.clear();
}
