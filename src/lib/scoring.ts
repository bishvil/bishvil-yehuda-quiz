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
