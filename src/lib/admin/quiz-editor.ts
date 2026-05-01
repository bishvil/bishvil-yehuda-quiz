/**
 * Editable view of a quiz + its questions for the admin UI. Keeps the
 * shape of `AdminQuestionListItem` but allows local-only ids before a
 * save round-trip seeds the row's UUID.
 */
import type { GameMode, QuestionType } from "@/src/lib/constants";
import type { QuestionOption } from "@/src/lib/supabase/database.types";

export const SCAFFOLDED_OPTIONS: QuestionOption[] = [
  { id: "a", text: "תשובה א" },
  { id: "b", text: "תשובה ב" },
  { id: "c", text: "תשובה ג" },
  { id: "d", text: "תשובה ד" },
];

export const TRUE_FALSE_OPTIONS: QuestionOption[] = [
  { id: "yes", text: "נכון" },
  { id: "no", text: "לא נכון" },
];

export type EditableQuestionMap =
  | { image_url: string; target: { x: number; y: number }; geo?: never }
  | {
      image_url?: never;
      target?: never;
      geo: {
        target: { lat: number; lng: number };
        center?: { lat: number; lng: number };
        zoom?: number;
        toleranceKm: number;
        styleHint?: "maptiler-streets" | "israel-hiking" | "osm-liberty";
      };
    };

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
  map: EditableQuestionMap | null;
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

/**
 * Shape of the auto-save PUT body for `/api/admin/quizzes/[id]`.
 * Mirrors `AdminQuizUpdateRequest` in `src/lib/admin/api-client.ts` but is
 * declared locally so this module stays pure (no Next.js / fetch imports)
 * and the unit tests can exercise it without polyfilling globals.
 */
export interface QuizSavePayload {
  brandId: string;
  title: string;
  defaultGameMode: GameMode;
  customLogo: string | null;
  customLogoLabel: string | null;
  joinFields: string[];
}

/**
 * Wave-2 review M3 — normalize a question to the next type, stripping
 * any field that does not belong to that type so the auto-save never
 * persists stale `map`, `tolerance`, `imageUrl`, or `correctIds` rows
 * that contradict the chosen `type`. Returns the same instance when
 * `nextType === question.type` so React identity stays stable.
 *
 * Rules (matched to the question schema in ADR-0004 §"Required Table:
 * questions" and the `supportsOptions` predicate in QuestionEditor):
 *
 * | nextType   | options                | correctIds                          | map           | tolerance | imageUrl    |
 * | ---------- | ---------------------- | ----------------------------------- | ------------- | --------- | ----------- |
 * | single     | scaffold if absent     | first id only                       | null          | null      | null        |
 * | multi      | scaffold if absent     | carry over                          | null          | null      | null        |
 * | image      | scaffold if absent     | carry over                          | null          | null      | carry over  |
 * | truefalse  | replace with [yes,no]  | filter to {yes,no}; default ["yes"] | null          | null      | null        |
 * | map        | null                   | []                                  | default if -  | carry     | null        |
 *
 * Image questions keep `options` + `correctIds` because the renderer
 * (`QuestionEditor.supportsOptions`) treats `image` as a choice question
 * with an illustration above the options.
 */
export function normalizeQuestionForType(
  question: EditableQuestion,
  nextType: QuestionType,
): EditableQuestion {
  if (nextType === question.type) return question;

  const carryOptions =
    question.options && question.options.length > 0
      ? question.options
      : SCAFFOLDED_OPTIONS.map((option) => ({ ...option }));

  switch (nextType) {
    case "single": {
      const correctIds = (question.correctIds ?? []).slice(0, 1);
      return {
        ...question,
        type: nextType,
        options: carryOptions,
        correctIds,
        map: null,
        tolerance: null,
        imageUrl: null,
      };
    }
    case "multi":
      return {
        ...question,
        type: nextType,
        options: carryOptions,
        correctIds: question.correctIds ?? [],
        map: null,
        tolerance: null,
        imageUrl: null,
      };
    case "image":
      return {
        ...question,
        type: nextType,
        options: carryOptions,
        correctIds: question.correctIds ?? [],
        map: null,
        tolerance: null,
        // imageUrl carries over verbatim (may already be null)
      };
    case "truefalse": {
      const allowed = new Set(TRUE_FALSE_OPTIONS.map((o) => o.id));
      const filtered = (question.correctIds ?? []).filter((id) => allowed.has(id));
      const correctIds = filtered.length > 0 ? filtered : ["yes"];
      return {
        ...question,
        type: nextType,
        options: TRUE_FALSE_OPTIONS.map((option) => ({ ...option })),
        correctIds,
        map: null,
        tolerance: null,
        imageUrl: null,
      };
    }
    case "map":
      return {
        ...question,
        type: nextType,
        options: null,
        correctIds: [],
        map: {
          geo: {
            target: { lat: 31.5, lng: 34.9 },
            toleranceKm: 5,
          },
        },
        tolerance: null,
        imageUrl: null,
      };
    default: {
      // Exhaustiveness check — unreachable for the current QUESTION_TYPES.
      const _exhaustive: never = nextType;
      return _exhaustive;
    }
  }
}

/**
 * Build the auto-save payload for a quiz edit. Wave-2 review M1 — the
 * previous closure (a) dropped `brandId` entirely so brand changes never
 * persisted, and (b) only sent `customLogo` / `customLogoLabel` when
 * truthy, so unchecking the toggle or clearing the label updated local
 * state but never cleared the database value. We always send `brandId`
 * and forward explicit `null` for the nullable logo fields so the PUT
 * route writes the cleared value (the route already maps
 * `parsed.data.customLogo !== undefined` → `update.custom_logo`).
 */
export function buildQuizSavePayload(quiz: EditableQuiz): QuizSavePayload {
  return {
    brandId: quiz.brandId,
    title: quiz.title,
    defaultGameMode: quiz.defaultGameMode,
    customLogo: quiz.customLogo,
    customLogoLabel: quiz.customLogoLabel,
    joinFields: quiz.joinFields,
  };
}
