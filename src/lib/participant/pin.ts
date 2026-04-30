/**
 * Participant PIN validator. The admin generator creates 6-digit numeric
 * PINs (Subtask 3 §pin.ts). Anything else hitting `/[pin]` is a misroute —
 * the page must `notFound()` rather than render the join card.
 */
export const PARTICIPANT_PIN_LENGTH = 6;
const PIN_REGEX = /^\d{6}$/;

export function isValidParticipantPin(value: string): boolean {
  return PIN_REGEX.test(value);
}
