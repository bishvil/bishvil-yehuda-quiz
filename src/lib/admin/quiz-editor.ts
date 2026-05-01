/**
 * Editable view of a quiz + its questions for the admin UI. Keeps the
 * shape of `AdminQuestionListItem` but allows local-only ids before a
 * save round-trip seeds the row's UUID.
 */
import type { GameMode, QuestionType } from "@/src/lib/constants";
import type {
  QuestionMap,
  QuestionOption,
} from "@/src/lib/supabase/database.types";

export const SCAFFOLDED_OPTIONS: QuestionOption[] = [
  { id: "a", text: "תשובה א" },
  { id: "b", text: "תשובה ב" },
  { id: "c", text: "תשובה ג" },
  { id: "d", text: "תשובה ד" },
];

export interface EditableQuestion {
  /** Server-issued UUID (null until first save). */
  id: string | null;
  /** Stable client-side id used for keys + add/delete bookkeeping. */
  clientId: string;
  ordinal: number;
  type: QuestionType;
  prompt: string;
  options: QuestionOption[] | null;
  correctIds: string[] | null;
  map: QuestionMap | null;
  imageUrl: string | null;
  explanation: string | null;
  timeSeconds: number;
  points: number;
  /** Stored as a string in the DB (numeric column); we keep it as a string here. */
  tolerance: string | null;
}

export interface EditableQuiz {
  id: string;
  title: string;
  brandId: string;
  defaultGameMode: GameMode;
  customLogo: string | null;
  customLogoLabel: string | null;
  joinFields: string[];
  archivedAt: string | null;
}

let CLIENT_ID_COUNTER = 0;

export function nextClientId(): string {
  CLIENT_ID_COUNTER += 1;
  return `c-${Date.now().toString(36)}-${CLIENT_ID_COUNTER}`;
}

/**
 * Create a blank, sensible default question. The admin spec calls out
 * `single` as the default. Time + points come from the constants module.
 */
export function makeBlankQuestion(ordinal: number): EditableQuestion {
  return {
    id: null,
    clientId: nextClientId(),
    ordinal,
    type: "single",
    prompt: "שאלה חדשה",
    options: SCAFFOLDED_OPTIONS.map((option) => ({ ...option })),
    correctIds: ["a"],
    map: null,
    imageUrl: null,
    explanation: null,
    timeSeconds: 25,
    points: 1500,
    tolerance: null,
  };
}

export interface ValidationFinding {
  questionClientId: string;
  field: "prompt" | "options" | "correct" | "map" | "image";
  message: string;
}

/**
 * Lightweight validator — surfaces issues that would fail the server's
 * zod schema before the user even tries to launch a session.
 */
export function validateQuestions(
  questions: EditableQuestion[],
): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  for (const q of questions) {
    if (!q.prompt.trim()) {
      findings.push({
        questionClientId: q.clientId,
        field: "prompt",
        message: "השאלה ריקה",
      });
    }
    if (
      q.type === "single" ||
      q.type === "multi" ||
      q.type === "image" ||
      q.type === "truefalse"
    ) {
      if (!q.options || q.options.length < 2) {
        findings.push({
          questionClientId: q.clientId,
          field: "options",
          message: "צריך לפחות שתי תשובות",
        });
      }
      if (!q.correctIds || q.correctIds.length === 0) {
        findings.push({
          questionClientId: q.clientId,
          field: "correct",
          message: "סמן לפחות תשובה נכונה אחת",
        });
      }
      if (q.type === "single" && (q.correctIds?.length ?? 0) > 1) {
        findings.push({
          questionClientId: q.clientId,
          field: "correct",
          message: "שאלת רב־ברירה תומכת בתשובה נכונה אחת בלבד",
        });
      }
    }
    if (q.type === "image" && !q.imageUrl) {
      findings.push({
        questionClientId: q.clientId,
        field: "image",
        message: "חסרה כתובת תמונה",
      });
    }
    if (q.type === "map" && (!q.map || !q.map.image_url)) {
      findings.push({
        questionClientId: q.clientId,
        field: "map",
        message: "חסרה מפה",
      });
    }
  }
  return findings;
}

export const QUIZ_TITLE_MAX = 80;

export function isQuizTitleValid(title: string): boolean {
  const trimmed = title.trim();
  return trimmed.length > 0 && trimmed.length <= QUIZ_TITLE_MAX;
}
