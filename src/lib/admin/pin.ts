import { randomInt } from "node:crypto";

const PIN_MIN = 100_000;
const PIN_MAX = 1_000_000;

/**
 * 6-digit numeric PIN per ADR-0004 §"PIN Format". Uses node:crypto for a
 * CSPRNG draw — the active-PIN namespace is small enough that Math.random
 * is guessable.
 */
export function generateRandomPin(): string {
  return String(randomInt(PIN_MIN, PIN_MAX)).padStart(6, "0");
}
