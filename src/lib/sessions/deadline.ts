/**
 * ADR-0013: video-bearing questions extend `deadline_at` by
 * `media_lead_seconds` so the answer phase still has its full
 * `time_seconds`. The submit_answer RPC caps remaining-seconds at
 * `time_seconds`, so the gate cannot inflate scores.
 */
export function computeMediaPaddedDeadline(
  startedAt: Date,
  timeSeconds: number,
  mediaLeadSeconds: number | null | undefined,
): Date {
  const totalSeconds = timeSeconds + (mediaLeadSeconds ?? 0);
  return new Date(startedAt.getTime() + totalSeconds * 1000);
}
