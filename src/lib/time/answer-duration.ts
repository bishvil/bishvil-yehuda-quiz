interface AnswerDurationInput {
  submittedAt: string | null;
  deadlineAt: string | null;
  timeSeconds: number | null;
}

export function computeAnswerSeconds({
  submittedAt,
  deadlineAt,
  timeSeconds,
}: AnswerDurationInput): number | null {
  if (!submittedAt || !deadlineAt || timeSeconds == null || timeSeconds <= 0) {
    return null;
  }

  const submittedMs = Date.parse(submittedAt);
  const deadlineMs = Date.parse(deadlineAt);

  if (!Number.isFinite(submittedMs) || !Number.isFinite(deadlineMs)) {
    return null;
  }

  const configuredSeconds = Math.max(1, timeSeconds);
  const remainingSeconds = Math.min(
    configuredSeconds,
    Math.max(0, (deadlineMs - submittedMs) / 1000),
  );
  const elapsedSeconds = Math.max(0, configuredSeconds - remainingSeconds);

  return Math.min(configuredSeconds, Math.ceil(elapsedSeconds));
}

export function formatAnswerSeconds(
  seconds: number | null | undefined,
): string | null {
  if (seconds == null) return null;
  if (seconds <= 0) return "פחות משנייה";
  if (seconds === 1) return "שנייה אחת";
  return `${seconds.toLocaleString("he-IL")} שניות`;
}
