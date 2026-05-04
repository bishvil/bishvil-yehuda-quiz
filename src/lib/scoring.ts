import {
  SCORING_BASE_FRACTION_DENOMINATOR,
  SCORING_BASE_FRACTION_NUMERATOR,
} from "@/src/lib/constants";

export interface ScoringInput {
  isCorrect: boolean;
  points: number;
  startedAt: Date;
  deadlineAt: Date;
  submittedAt: Date;
  timeSeconds: number;
}

export interface ScoringResult {
  score: number;
  timeBonus: number;
  base: number;
  timeMax: number;
}

/**
 * Server-authoritative scoring per ADR-0006 §5 + Open Q1 (RESOLVED).
 * `base = floor(points * 2/3)`; `time_max = points - base`. The time bonus
 * scales linearly across the question window so that an answer at the start
 * earns the full time pool and an answer at the deadline earns nothing.
 */
export function computeScore(input: ScoringInput): ScoringResult {
  const base = Math.floor(
    (input.points * SCORING_BASE_FRACTION_NUMERATOR) /
      SCORING_BASE_FRACTION_DENOMINATOR,
  );
  const timeMax = input.points - base;

  if (!input.isCorrect) {
    return { score: 0, timeBonus: 0, base, timeMax };
  }

  const remainingMs = Math.max(
    0,
    input.deadlineAt.getTime() - input.submittedAt.getTime(),
  );
  const totalMs = Math.max(1, input.timeSeconds * 1000);
  const timeBonus = Math.floor((timeMax * remainingMs) / totalMs);
  const score = base + timeBonus;

  return { score, timeBonus, base, timeMax };
}

/**
 * Choice questions match the prototype rule: order-insensitive set equality.
 * Multi-select requires the same set, no partial credit (ADR-0006 Open Q3).
 */
export function isChoiceAnswerCorrect(
  selectedIds: string[],
  correctIds: string[],
): boolean {
  if (selectedIds.length !== correctIds.length) {
    return false;
  }

  const correctSet = new Set(correctIds);
  return selectedIds.every((id) => correctSet.has(id));
}

/**
 * Mean Earth radius in km used by the haversine formula. The MapLibre /
 * Mapbox style spec also assumes a spherical earth at 6371 km, so we are
 * dimensionally consistent with the renderer's projection.
 */
export const EARTH_RADIUS_KM = 6371;

/** WGS-84 lat/lng pair, in degrees. */
export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Great-circle distance in kilometres between two WGS-84 points using the
 * haversine formula (ADR-0011 §5).
 *
 * `Math.asin(Math.min(1, Math.sqrt(h)))` clamps the input to the valid
 * domain of `asin` so antipodal points (where floating-point error can
 * push the radicand fractionally above 1) still return ~πR.
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Map question correctness — haversine distance against a km tolerance,
 * ADR-0011 §5. Binary correct/wrong; partial credit is out of scope for
 * v1 per ADR-0011 §4 + ADR-0006 Open Q2.
 *
 * @deprecated Prefer {@link scoreMapAnswerProximity} for new code. This helper
 * is retained for existing callers and legacy tests.
 */
export function isMapAnswerCorrectGeo(
  pin: LatLng,
  target: LatLng,
  toleranceKm: number,
): boolean {
  if (!Number.isFinite(toleranceKm) || toleranceKm <= 0) return false;
  return haversineKm(pin, target) <= toleranceKm;
}

// ============================================================================
// Partial-credit scoring (ADR-0006 Open Q2 + Q3 RESOLVED)
// ============================================================================

export interface TimingInput {
  /** Server timestamp when the question opened for answering. */
  startedAt: Date;
  /** Server-side deadline for the question. */
  deadlineAt: Date;
  /** Server timestamp at the moment of answer submission. */
  submittedAt: Date;
  /** Question window in seconds (used to scale the time pool). */
  timeSeconds: number;
}

export interface PartialScoringResult {
  /** Final score for this answer. */
  score: number;
  /** 0..1 correctness ratio (0 = fully wrong, 1 = fully correct). */
  ratio: number;
  /** Time-bonus component (> 0 only on a correct answer). */
  timeBonus: number;
  /** Base score portion (floor(points * 2/3)). */
  base: number;
  /** Maximum time-bonus pool (points - base). */
  timeMax: number;
}

/**
 * Compute the Jaccard similarity between two sets expressed as string arrays.
 * Jaccard = |A ∩ B| / |A ∪ B|.
 *
 * Deduplication is applied to both arrays so duplicate entries do not inflate
 * the intersection or deflate the union. Returns 0 when both arrays are empty
 * (guard against 0/0 — an empty vs empty answer is treated as no match).
 *
 * **Mirror note:** Postgres equivalent uses
 * `unnest(a) INTERSECT unnest(b)` / `unnest(a) UNION unnest(b)` because the
 * `&` / `|` operators are `intarray`-only and do NOT work on `text[]`.
 */
export function jaccardRatio(selected: string[], correct: string[]): number {
  const setA = new Set(selected);
  const setB = new Set(correct);
  const unionSize = new Set([...setA, ...setB]).size;
  if (unionSize === 0) return 0;
  let intersectSize = 0;
  for (const id of setA) {
    if (setB.has(id)) intersectSize++;
  }
  return intersectSize / unionSize;
}

/**
 * Score a geo-map answer using linear proximity decay (ADR-0006 Open Q2
 * RESOLVED, ADR-0011 Open Q2 RESOLVED).
 *
 * Formula (mirrors PL/pgSQL in `submit_answer` exactly):
 *   ratio = distanceKm < toleranceKm ? (1 - d/tol) : 0
 *   is_correct = ratio > 0            (strict — d=tol earns 0)
 *   score = floor(base * ratio) + (is_correct ? time_bonus : 0)
 *
 * The boundary is strict (`<`) so that a pin placed exactly at the tolerance
 * radius scores 0, consistent with the test expectation "d=tolerance → 0 base
 * + 0 time bonus". This departs from the legacy binary helper
 * {@link isMapAnswerCorrectGeo} which uses an inclusive `<=` boundary.
 */
export function scoreMapAnswerProximity(
  input: { distanceKm: number; toleranceKm: number; points: number } & TimingInput,
): PartialScoringResult {
  const base = Math.floor(
    (input.points * SCORING_BASE_FRACTION_NUMERATOR) /
      SCORING_BASE_FRACTION_DENOMINATOR,
  );
  const timeMax = input.points - base;

  const ratio =
    input.distanceKm < input.toleranceKm
      ? 1 - input.distanceKm / input.toleranceKm
      : 0;

  const isCorrect = ratio > 0;

  const remainingMs = isCorrect
    ? Math.max(0, input.deadlineAt.getTime() - input.submittedAt.getTime())
    : 0;
  const totalMs = Math.max(1, input.timeSeconds * 1000);
  const timeBonus = isCorrect ? Math.floor((timeMax * remainingMs) / totalMs) : 0;
  const score = Math.floor(base * ratio) + timeBonus;

  return { score, ratio, timeBonus, base, timeMax };
}

/**
 * Score a multi-select answer using Jaccard ratio (ADR-0006 Open Q3
 * RESOLVED).
 *
 * Takes a pre-computed `correctnessRatio` (from {@link jaccardRatio} or
 * the server row) so the caller controls the ratio source.
 *
 * Formula (mirrors PL/pgSQL in `submit_answer` exactly):
 *   is_correct = ratio === 1.0         (exact set match only)
 *   score = floor(base * ratio) + (is_correct ? time_bonus : 0)
 *
 * Time bonus is awarded only on a perfect match to discourage random picks.
 */
export function scoreMultiAnswer(
  input: { correctnessRatio: number; points: number } & TimingInput,
): PartialScoringResult {
  const base = Math.floor(
    (input.points * SCORING_BASE_FRACTION_NUMERATOR) /
      SCORING_BASE_FRACTION_DENOMINATOR,
  );
  const timeMax = input.points - base;

  const ratio = Math.max(0, Math.min(1, input.correctnessRatio));
  const isCorrect = ratio === 1;

  const remainingMs = isCorrect
    ? Math.max(0, input.deadlineAt.getTime() - input.submittedAt.getTime())
    : 0;
  const totalMs = Math.max(1, input.timeSeconds * 1000);
  const timeBonus = isCorrect ? Math.floor((timeMax * remainingMs) / totalMs) : 0;
  const score = Math.floor(base * ratio) + timeBonus;

  return { score, ratio, timeBonus, base, timeMax };
}
