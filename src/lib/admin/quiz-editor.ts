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

export interface EditableQuestionMap {
  geo: {
    target: { lat: number; lng: number };
    center?: { lat: number; lng: number };
    zoom?: number;
    toleranceKm: number;
    styleHint?: "maptiler-streets" | "israel-hiking" | "osm-liberty";
  };
}

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
  /** Admin-supplied alt text — required for a11y when imageUrl is set. */
  imageAlt: string | null;
  /** Natural width in pixels after any client-side resize (null until uploaded). */
  imageWidth: number | null;
  /** Natural height in pixels after any client-side resize (null until uploaded). */
  imageHeight: number | null;
  /** Supabase storage path for future orphan cleanup — admin-only, never sent to participants. */
  imagePath: string | null;
  explanation: string | null;
  timeSeconds: number;
  points: number;
  // --- Video fields — populated only for type === "video" (mirrors the image
  // type's relationship to imageUrl). normalizeQuestionForType strips them on
  // every transition into a non-video type. ---
  /** Public URL of a self-hosted MP4/WebM clip in the question-videos bucket. */
  videoUrl: string | null;
  /** Supabase Storage object path — admin-only, never sent to participants. */
  videoPath: string | null;
  /** Normalized YouTube/Vimeo embed URL. Mutually exclusive with videoUrl. */
  videoEmbedUrl: string | null;
  /** Provider discriminator: 'self' for self-hosted, 'youtube'|'vimeo' for embeds. */
  videoProvider: "self" | "youtube" | "vimeo" | null;
  /** MIME type captured at upload time (self-hosted only). */
  videoMimeType: string | null;
  /** Duration in seconds (auto-populated for self-hosted, manual for embeds). */
  videoDurationSeconds: number | null;
  /** Optional poster image URL (auto-extracted from self-hosted clip). */
  videoPosterUrl: string | null;
  /** Supabase Storage path of the auto-extracted poster — admin-only. */
  videoPosterPath: string | null;
  /** Natural video width in pixels (self-hosted only). */
  videoWidth: number | null;
  /** Natural video height in pixels (self-hosted only). */
  videoHeight: number | null;
  /**
   * Seconds added to deadline_at at question-start so participants watch the
   * video before the answer timer starts. NOT NULL DEFAULT 0.
   */
  mediaLeadSeconds: number;
}

export interface EditableQuiz {
  id: string;
  title: string;
  brandId: string;
  defaultGameMode: GameMode;
  customLogo: string | null;
  customLogoLabel: string | null;
  customLogoActive: boolean;
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
    imageAlt: null,
    imageWidth: null,
    imageHeight: null,
    imagePath: null,
    explanation: null,
    timeSeconds: 25,
    points: 1500,
    // Video fields — all null/0 by default (video is orthogonal to question type)
    videoUrl: null,
    videoPath: null,
    videoEmbedUrl: null,
    videoProvider: null,
    videoMimeType: null,
    videoDurationSeconds: null,
    videoPosterUrl: null,
    videoPosterPath: null,
    videoWidth: null,
    videoHeight: null,
    mediaLeadSeconds: 0,
  };
}

export interface ValidationFinding {
  questionClientId: string;
  field: "prompt" | "options" | "correct" | "map" | "image" | "video";
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
      q.type === "video" ||
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
    if (q.type === "video" && !q.videoUrl && !q.videoEmbedUrl) {
      findings.push({
        questionClientId: q.clientId,
        field: "video",
        message: "חסר סרטון לשאלה",
      });
    }
    // Soft warning: embed video without a manually-entered duration means the
    // system cannot enforce viewing before showing answers. Self-hosted clips
    // auto-populate mediaLeadSeconds so they don't trigger this.
    if (
      q.type === "video" &&
      q.videoEmbedUrl &&
      !q.videoUrl &&
      q.mediaLeadSeconds === 0
    ) {
      findings.push({
        questionClientId: q.clientId,
        field: "video",
        message:
          "יש להזין את משך הסרטון בשניות כדי שהמערכת תוכל לאכוף את הצפייה לפני הצגת התשובות.",
      });
    }
    if (q.type === "map" && !q.map?.geo) {
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
  customLogoActive: boolean;
  joinFields: string[];
}

/**
 * Normalize a question to the next type, stripping any field that does
 * not belong to that type so the auto-save never persists stale `map`,
 * `imageUrl`, `videoUrl`, or `correctIds` rows that contradict the chosen
 * `type`. Returns the same instance when `nextType === question.type` so
 * React identity stays stable.
 *
 * Rules (mirroring `image` for `video` — both are option-bound visual
 * prompts):
 *
 * | nextType   | options                | correctIds                          | map         | imageUrl    | videoUrl    |
 * | ---------- | ---------------------- | ----------------------------------- | ----------- | ----------- | ----------- |
 * | single     | scaffold if absent     | first id only                       | null        | null        | null        |
 * | multi      | scaffold if absent     | carry over                          | null        | null        | null        |
 * | image      | scaffold if absent     | carry over                          | null        | carry over  | null        |
 * | video      | scaffold if absent     | carry over                          | null        | null        | carry over  |
 * | truefalse  | replace with [yes,no]  | filter to {yes,no}; default ["yes"] | null        | null        | null        |
 * | map        | null                   | []                                  | default geo | null        | null        |
 *
 * Video fields (videoUrl/videoPath/videoEmbedUrl/videoProvider/
 * videoMimeType/videoDurationSeconds/videoPosterUrl/videoPosterPath/
 * videoWidth/videoHeight/mediaLeadSeconds) are stripped on every
 * transition INTO a non-video type and preserved verbatim on a transition
 * INTO `video`.
 */
export const VIDEO_WIPE = {
  videoUrl: null,
  videoPath: null,
  videoEmbedUrl: null,
  videoProvider: null,
  videoMimeType: null,
  videoDurationSeconds: null,
  videoPosterUrl: null,
  videoPosterPath: null,
  videoWidth: null,
  videoHeight: null,
  mediaLeadSeconds: 0,
} as const satisfies Pick<
  EditableQuestion,
  | "videoUrl"
  | "videoPath"
  | "videoEmbedUrl"
  | "videoProvider"
  | "videoMimeType"
  | "videoDurationSeconds"
  | "videoPosterUrl"
  | "videoPosterPath"
  | "videoWidth"
  | "videoHeight"
  | "mediaLeadSeconds"
>;

const IMAGE_WIPE = {
  imageUrl: null,
  imageAlt: null,
  imageWidth: null,
  imageHeight: null,
  imagePath: null,
} as const satisfies Pick<
  EditableQuestion,
  "imageUrl" | "imageAlt" | "imageWidth" | "imageHeight" | "imagePath"
>;

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
        ...IMAGE_WIPE,
        ...VIDEO_WIPE,
      };
    }
    case "multi":
      return {
        ...question,
        type: nextType,
        options: carryOptions,
        correctIds: question.correctIds ?? [],
        map: null,
        ...IMAGE_WIPE,
        ...VIDEO_WIPE,
      };
    case "image":
      return {
        ...question,
        type: nextType,
        options: carryOptions,
        correctIds: question.correctIds ?? [],
        map: null,
        // imageUrl / imageAlt / imageWidth / imageHeight / imagePath carry over verbatim.
        ...VIDEO_WIPE,
      };
    case "video":
      return {
        ...question,
        type: nextType,
        options: carryOptions,
        correctIds: question.correctIds ?? [],
        map: null,
        ...IMAGE_WIPE,
        // videoUrl / videoEmbedUrl / videoProvider / videoMimeType /
        // videoDurationSeconds / videoPosterUrl / videoPosterPath /
        // videoWidth / videoHeight / videoPath / mediaLeadSeconds carry
        // over verbatim. (Mirrors the image case.)
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
        ...IMAGE_WIPE,
        ...VIDEO_WIPE,
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
        ...IMAGE_WIPE,
        ...VIDEO_WIPE,
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
    customLogoActive: quiz.customLogoActive,
    joinFields: quiz.joinFields,
  };
}
