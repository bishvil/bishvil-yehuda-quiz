/**
 * Pure state machine for the host dashboard's primary control button.
 *
 * The host UI surfaces a single primary CTA whose label, intent and
 * enabled-ness all depend on (sessionStatus × questionStatus × deadline).
 * Encoding the decision here keeps the React component dumb and lets us
 * unit-test transition logic without rendering anything.
 *
 * Backend constraints (must not be violated by the UI):
 *   - canTransitionQuestion(answering → revealed) === false. Only locked →
 *     revealed is allowed; lazyExpireSyncQuestionState flips answering →
 *     locked when the deadline passes (ADR-0005 §3.2).
 *   - The next route refuses to advance unless the current question is in
 *     `revealed` state.
 *   - The session must be `live` for question start/advance controls.
 *     Paused sessions can only resume/end before moving the question forward.
 */
import type {
  QuestionStatusEnum,
  SessionStatusEnum,
} from "@/src/lib/supabase/database.types";

export type HostPrimaryAction =
  | "start_session"
  | "start_question"
  | "reveal"
  | "advance"
  | "ended";

export interface HostPrimaryButtonState {
  action: HostPrimaryAction;
  /** Hebrew label rendered on the button. */
  label: string;
  disabled: boolean;
  /** When disabled, an optional hint to render under the button. */
  hint: string | null;
}

export interface HostPrimaryDecisionInput {
  sessionStatus: SessionStatusEnum;
  questionStatus: QuestionStatusEnum | null;
  /** True once the live countdown has elapsed (server-time corrected). */
  deadlinePassed: boolean;
  /** Whether a next station is available to advance to. */
  hasNextQuestion: boolean;
  /** Whether this is the final question (changes the advance label). */
  isLastQuestion: boolean;
}

export function decideHostPrimaryButton(
  input: HostPrimaryDecisionInput,
): HostPrimaryButtonState {
  const { sessionStatus, questionStatus, deadlinePassed, hasNextQuestion, isLastQuestion } = input;

  if (sessionStatus === "ended") {
    return {
      action: "ended",
      label: "החידון הסתיים",
      disabled: true,
      hint: null,
    };
  }

  if (sessionStatus === "draft") {
    return {
      action: "start_session",
      label: "הפעלת חידון ←",
      disabled: true,
      hint: "יש לפרסם או לתזמן את החידון לפני ההפעלה.",
    };
  }

  if (sessionStatus === "scheduled") {
    return {
      action: "start_session",
      label: "הפעלת חידון ←",
      disabled: !hasNextQuestion,
      hint: hasNextQuestion ? null : "לא הוגדרו שאלות לחידון.",
    };
  }

  // Session is live or paused from here on.
  if (questionStatus === null) {
    // No active question — host needs to start the next one (or first).
    return {
      action: "start_question",
      label: "התחלת תחנה ←",
      disabled: !hasNextQuestion || sessionStatus === "paused",
      hint: !hasNextQuestion
        ? "לא נותרו תחנות. השלימו את החידון."
        : sessionStatus === "paused"
          ? "החידון מושהה — חזרו אליו כדי להתחיל תחנה חדשה."
          : null,
    };
  }

  if (questionStatus === "revealed") {
    if (!hasNextQuestion) {
      return {
        action: "advance",
        label: "סיום החידון ←",
        disabled: false,
        hint: null,
      };
    }
    return {
      action: "advance",
      label: isLastQuestion ? "סיום החידון ←" : "לתחנה הבאה ←",
      disabled: false,
      hint: null,
    };
  }

  // Question is idle / presenting / answering / locked. Reveal is only
  // valid once the row is in `locked` (deadline passed). We also enable
  // the button optimistically once the deadline has passed but the row
  // hasn't been lazy-expired yet — the /reveal handler runs lazyExpire
  // first, so the click will succeed.
  const canReveal = questionStatus === "locked" || deadlinePassed;

  return {
    action: "reveal",
    label: "חשיפת התשובה ←",
    disabled: !canReveal,
    hint: canReveal
      ? "החשיפה תציג את התשובה הנכונה לכל המשתתפים."
      : "ניתן לחשוף לאחר תום הזמן או לאחר שכל המשתתפים יענו.",
  };
}

/**
 * Bar percentages and fill ratios for the answer-distribution view.
 * Keeps the math out of the React tree and unit-testable.
 */
export interface AnswerBarDatum {
  optionId: string;
  count: number;
  percent: number;
  fillFraction: number;
}

export function computeAnswerBars(args: {
  options: Array<{ id: string }>;
  counts: Record<string, number>;
}): AnswerBarDatum[] {
  const counts = args.options.map((option) => args.counts[option.id] ?? 0);
  const total = counts.reduce((sum, n) => sum + n, 0);
  const max = counts.reduce((m, n) => (n > m ? n : m), 0);

  return args.options.map((option, index) => {
    const c = counts[index] ?? 0;
    const percent = total > 0 ? Math.round((c / total) * 100) : 0;
    const fillFraction = max > 0 ? Math.min(1, c / max) : 0;
    return {
      optionId: option.id,
      count: c,
      percent,
      fillFraction,
    };
  });
}
