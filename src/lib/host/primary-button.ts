import type {
  QuestionStatusEnum,
  SessionStatusEnum,
} from "@/src/lib/supabase/database.types";

export type HostPrimaryAction =
  | "start_session"
  | "start_question"
  | "begin_answering"
  | "reveal"
  | "advance"
  | "ended";

export interface HostPrimaryButtonState {
  action: HostPrimaryAction;
  label: string;
  disabled: boolean;
  hint: string | null;
}

export interface HostPrimaryDecisionInput {
  sessionStatus: SessionStatusEnum;
  questionStatus: QuestionStatusEnum | null;
  deadlinePassed: boolean;
  timeLimitEnabled?: boolean;
  hasNextQuestion: boolean;
  isLastQuestion: boolean;
}

export function decideHostPrimaryButton(
  input: HostPrimaryDecisionInput,
): HostPrimaryButtonState {
  const {
    sessionStatus,
    questionStatus,
    deadlinePassed,
    timeLimitEnabled = true,
    hasNextQuestion,
    isLastQuestion,
  } = input;

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
      label: "התחל חידון ←",
      disabled: true,
      hint: "יש לפרסם או לתזמן את החידון לפני ההפעלה.",
    };
  }

  if (sessionStatus === "scheduled") {
    return {
      action: "start_session",
      label: "התחל חידון ←",
      disabled: !hasNextQuestion,
      hint: hasNextQuestion ? null : "לא הוגדרו שאלות לחידון.",
    };
  }

  if (questionStatus === null) {
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

  if (questionStatus === "presenting") {
    return {
      action: "begin_answering",
      label: "התחלת מענה ←",
      disabled: sessionStatus === "paused",
      hint:
        sessionStatus === "paused"
          ? "החידון מושהה — חזרו אליו לפני התחלת המענה."
          : null,
    };
  }

  if (questionStatus === "revealed") {
    if (sessionStatus === "paused") {
      return {
        action: "advance",
        label:
          !hasNextQuestion || isLastQuestion ? "סיום החידון ←" : "לתחנה הבאה ←",
        disabled: true,
        hint: "החידון מושהה — חזרו אליו לפני מעבר תחנה.",
      };
    }

    return {
      action: "advance",
      label:
        !hasNextQuestion || isLastQuestion ? "סיום החידון ←" : "לתחנה הבאה ←",
      disabled: false,
      hint: null,
    };
  }

  const manualClose = questionStatus === "answering" && !timeLimitEnabled;
  const canReveal =
    questionStatus === "locked" || deadlinePassed || manualClose;

  return {
    action: "reveal",
    label: manualClose ? "סיום המענה וחשיפת התשובה ←" : "חשיפת התשובה ←",
    disabled: !canReveal || sessionStatus === "paused",
    hint:
      sessionStatus === "paused"
        ? "החידון מושהה — חזרו אליו לפני חשיפת התשובה."
        : canReveal
          ? "החשיפה תציג את התשובה הנכונה לכל המשתתפים."
          : "ניתן לחשוף לאחר תום הזמן או לאחר שכל המשתתפים יענו.",
  };
}
