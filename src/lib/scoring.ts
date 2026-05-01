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
 * Map question correctness — Euclidean distance in % units, ADR-0006 §5.
 *
 * Legacy raster path. New questions stored under the additive `map.geo`
 * shape (ADR-0011) use {@link haversineKm} + {@link isMapAnswerCorrectGeo}
 * instead. Kept exported so the existing %-based components and tests
 * continue to compile until the integration tail sunsets the legacy
 * shape (ADR-0011 §6.4 + §11).
 */
export function isMapAnswerCorrect(
  pin: { x: number; y: number },
  target: { x: number; y: number },
  tolerance: number,
): boolean {
  const distance = Math.sqrt(
    Math.pow(pin.x - target.x, 2) + Math.pow(pin.y - target.y, 2),
  );
  return distance <= tolerance;
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
 */
export function isMapAnswerCorrectGeo(
  pin: LatLng,
  target: LatLng,
  toleranceKm: number,
): boolean {
  if (!Number.isFinite(toleranceKm) || toleranceKm <= 0) return false;
  return haversineKm(pin, target) <= toleranceKm;
}
