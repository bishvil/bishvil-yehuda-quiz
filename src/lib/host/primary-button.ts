import type {
  QuestionStatusEnum,
  QuestionTypeEnum,
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
  questionType?: QuestionTypeEnum;
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
    questionType,
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
      label: questionType === "content" ? "פתיחת תחנת המידע ←" : "התחלת מענה ←",
      disabled: sessionStatus === "paused",
      hint:
        sessionStatus === "paused"
          ? questionType === "content"
            ? "החידון מושהה — חזרו אליו לפני פתיחת תחנת המידע."
            : "החידון מושהה — חזרו אליו לפני התחלת המענה."
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

  const isContent = questionType === "content";
  const manualClose =
    questionStatus === "answering" && (!timeLimitEnabled || isContent);
  const canReveal =
    questionStatus === "locked" || deadlinePassed || manualClose;

  return {
    action: "reveal",
    label: isContent
      ? "סיום תחנת המידע ←"
      : manualClose
        ? "סיום המענה וחשיפת התשובה ←"
        : "חשיפת התשובה ←",
    disabled: !canReveal || sessionStatus === "paused",
    hint:
      sessionStatus === "paused"
        ? isContent
          ? "החידון מושהה — חזרו אליו לפני סיום התחנה."
          : "החידון מושהה — חזרו אליו לפני חשיפת התשובה."
        : isContent
          ? "תחנת מידע אינה דורשת תשובה. סיימו אותה כשהקבוצה מוכנה להמשיך."
          : canReveal
            ? "החשיפה תציג את התשובה הנכונה לכל המשתתפים."
            : "ניתן לחשוף לאחר תום הזמן או לאחר שכל המשתתפים יענו.",
  };
}
