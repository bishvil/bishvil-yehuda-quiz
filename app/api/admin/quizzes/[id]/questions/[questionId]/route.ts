import { type NextRequest } from "next/server";

import { ADMIN_QUESTION_SCORES_LOCKED_MESSAGE } from "@/src/lib/admin/lifecycle-copy";
import { requireRole } from "@/src/lib/auth/server-auth";
import { adminQuestionUpdateSchema } from "@/src/lib/admin/validation";
import { resolveVideoEmbedFields } from "@/src/lib/admin/video-embed";
import { privateNoStoreJson } from "@/src/lib/http/responses";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/server";
import type { Database, Json } from "@/src/lib/supabase/database.types";

interface AdminQuestionItemRouteContext {
  params: Promise<{ id: string; questionId: string }>;
}

interface AdminQuestionDetailBody {
  question: {
    id: string;
    ordinal: number;
    type: Database["public"]["Tables"]["questions"]["Row"]["type"];
    prompt: string;
    options: Json | null;
    correctIds: string[] | null;
    map: Json | null;
    imageUrl: string | null;
    imageAlt: string | null;
    imageWidth: number | null;
    imageHeight: number | null;
    imagePath: string | null;
    explanation: string | null;
    timeSeconds: number;
    points: number;
    videoUrl: string | null;
    videoPath: string | null;
    videoEmbedUrl: string | null;
    videoProvider: string | null;
    videoMimeType: string | null;
    videoDurationSeconds: number | null;
    videoPosterUrl: string | null;
    videoPosterPath: string | null;
    videoWidth: number | null;
    videoHeight: number | null;
    mediaLeadSeconds: number;
  };
  /**
   * When the admin uses ?force=1 to mutate a score-affecting field on a
   * quiz that already has submissions, the API surfaces the affected
   * session IDs so the editor UI can prompt for follow-up rescores.
   * Empty array when no rescore is required.
   */
  requiresRescore?: string[];
}

interface AdminQuestionDeleteBody {
  status: "deleted";
}

interface AdminQuestionErrorBody {
  error: "INVALID_REQUEST" | "QUESTION_NOT_FOUND" | "WRITE_FAILED";
  message: string;
}

interface AdminQuestionScoresLockedBody {
  error: "SCORES_LOCKED";
  message: string;
  /** Sessions that already have at least one answer for this quiz. */
  affectedSessionIds: string[];
}

/**
 * Fields that affect ADR-0006 scoring. Mutating any of these once an
 * answer row exists makes the stored answer.score and
 * participant_scores.total_score stale — admin must rescore (POST
 * /api/admin/sessions/[id]/rescore) after a forced edit.
 */
type ScoreAffectingField = "points" | "timeSeconds" | "correctIds" | "map";

/**
 * Compares parsed update values against the existing question row and
 * returns the subset of score-affecting fields whose value would change.
 * Equality is intentionally loose: arrays and JSON objects are compared
 * via JSON.stringify so the auto-save loop's no-op patches do not trip
 * the guard.
 */
function detectScoreAffectingChanges(
  parsed: {
    points?: number;
    timeSeconds?: number;
    correctIds?: string[] | null;
    map?: unknown;
  },
  existing: Database["public"]["Tables"]["questions"]["Row"],
): ScoreAffectingField[] {
  const changes: ScoreAffectingField[] = [];
  if (parsed.points !== undefined && parsed.points !== existing.points) {
    changes.push("points");
  }
  if (
    parsed.timeSeconds !== undefined &&
    parsed.timeSeconds !== existing.time_seconds
  ) {
    changes.push("timeSeconds");
  }
  if (
    parsed.correctIds !== undefined &&
    JSON.stringify(parsed.correctIds ?? null) !==
      JSON.stringify(existing.correct_ids ?? null)
  ) {
    changes.push("correctIds");
  }
  if (
    parsed.map !== undefined &&
    JSON.stringify(parsed.map ?? null) !== JSON.stringify(existing.map ?? null)
  ) {
    changes.push("map");
  }
  return changes;
}

function toDetail(
  row: Database["public"]["Tables"]["questions"]["Row"],
): AdminQuestionDetailBody["question"] {
  return {
    id: row.id,
    ordinal: row.ordinal,
    type: row.type,
    prompt: row.prompt,
    options: row.options,
    correctIds: row.correct_ids,
    map: row.map,
    imageUrl: row.image_url,
    imageAlt: row.image_alt,
    imageWidth: row.image_width,
    imageHeight: row.image_height,
    imagePath: row.image_path,
    explanation: row.explanation,
    timeSeconds: row.time_seconds,
    points: row.points,
    videoUrl: row.video_url ?? null,
    videoPath: row.video_path ?? null,
    videoEmbedUrl: row.video_embed_url ?? null,
    videoProvider: row.video_provider ?? null,
    videoMimeType: row.video_mime_type ?? null,
    videoDurationSeconds: row.video_duration_seconds ?? null,
    videoPosterUrl: row.video_poster_url ?? null,
    videoPosterPath: null, // video_poster_path column not in DB schema
    videoWidth: row.video_width ?? null,
    videoHeight: row.video_height ?? null,
    mediaLeadSeconds: row.media_lead_seconds ?? 0,
  };
}

export async function PUT(
  request: NextRequest,
  context: AdminQuestionItemRouteContext,
) {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  const { id: quizId, questionId } = await context.params;
  const parsed = adminQuestionUpdateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return privateNoStoreJson<AdminQuestionErrorBody>(
      { error: "INVALID_REQUEST", message: "Question body invalid." },
      { status: 400 },
    );
  }

  // For PATCH semantics: only run the embed validator when the field is
  // actually being mutated. `undefined` ⇒ leave the column alone.
  let normalizedEmbedUrl: string | undefined | null = parsed.data.videoEmbedUrl;
  let resolvedVideoProvider: "self" | "youtube" | "vimeo" | undefined | null =
    parsed.data.videoProvider;
  if (
    parsed.data.videoEmbedUrl !== undefined ||
    parsed.data.videoUrl !== undefined
  ) {
    const videoFields = resolveVideoEmbedFields(parsed.data);
    if (!videoFields.ok) {
      return privateNoStoreJson<AdminQuestionErrorBody>(
        {
          error: "INVALID_REQUEST",
          message:
            videoFields.reason === "BOTH_URLS"
              ? "לא ניתן לספק גם כתובת וידאו וגם כתובת הטמעה באותה שאלה."
              : "כתובת ההטמעה אינה חוקית.",
        },
        { status: 400 },
      );
    }
    if (parsed.data.videoEmbedUrl !== undefined) {
      normalizedEmbedUrl = videoFields.embedUrl;
      resolvedVideoProvider = videoFields.provider;
    }
  }

  const serviceSupabase = await createServiceRoleSupabaseClient();

  // Score-edit guard (ADR-0006) runs only when the patch mentions a
  // score-affecting key. Autosave PUTs that only touch prompt / options /
  // ordinal stay on the single-statement fast path.
  const mentionsScoreField =
    parsed.data.points !== undefined ||
    parsed.data.timeSeconds !== undefined ||
    parsed.data.correctIds !== undefined ||
    parsed.data.map !== undefined;

  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  let affectedSessionIds: string[] = [];
  let scoreChanges: ScoreAffectingField[] = [];

  if (mentionsScoreField) {
    const { data: existingRow, error: existingError } = await serviceSupabase
      .from("questions")
      .select("*")
      .eq("id", questionId)
      .eq("quiz_id", quizId)
      .maybeSingle();

    if (existingError) {
      return privateNoStoreJson<AdminQuestionErrorBody>(
        { error: "WRITE_FAILED", message: "Update failed." },
        { status: 500 },
      );
    }

    if (!existingRow) {
      return privateNoStoreJson<AdminQuestionErrorBody>(
        { error: "QUESTION_NOT_FOUND", message: "Question not found." },
        { status: 404 },
      );
    }

    scoreChanges = detectScoreAffectingChanges(parsed.data, existingRow);

    if (scoreChanges.length > 0) {
      const { data: affectedRows, error: affectedError } = await serviceSupabase
        .from("answers")
        .select("session_id, sessions!inner(quiz_id)")
        .eq("sessions.quiz_id", quizId);

      if (affectedError) {
        return privateNoStoreJson<AdminQuestionErrorBody>(
          { error: "WRITE_FAILED", message: "Update failed." },
          { status: 500 },
        );
      }

      affectedSessionIds = Array.from(
        new Set((affectedRows ?? []).map((row) => row.session_id as string)),
      );

      if (affectedSessionIds.length > 0 && !force) {
        return privateNoStoreJson<AdminQuestionScoresLockedBody>(
          {
            error: "SCORES_LOCKED",
            message: ADMIN_QUESTION_SCORES_LOCKED_MESSAGE,
            affectedSessionIds,
          },
          { status: 409 },
        );
      }
    }
  }

  const update: Database["public"]["Tables"]["questions"]["Update"] = {};
  if (parsed.data.ordinal !== undefined) update.ordinal = parsed.data.ordinal;
  if (parsed.data.type !== undefined) update.type = parsed.data.type;
  if (parsed.data.prompt !== undefined) update.prompt = parsed.data.prompt;
  if (parsed.data.options !== undefined) {
    update.options = parsed.data.options as Json | null;
  }
  if (parsed.data.correctIds !== undefined) {
    update.correct_ids = parsed.data.correctIds;
  }
  if (parsed.data.map !== undefined) update.map = parsed.data.map as Json | null;
  if (parsed.data.imageUrl !== undefined) update.image_url = parsed.data.imageUrl;
  if (parsed.data.imageAlt !== undefined) update.image_alt = parsed.data.imageAlt;
  if (parsed.data.imageWidth !== undefined) {
    update.image_width = parsed.data.imageWidth;
  }
  if (parsed.data.imageHeight !== undefined) {
    update.image_height = parsed.data.imageHeight;
  }
  if (parsed.data.imagePath !== undefined) {
    update.image_path = parsed.data.imagePath;
  }
  if (parsed.data.explanation !== undefined) {
    update.explanation = parsed.data.explanation;
  }
  if (parsed.data.timeSeconds !== undefined) {
    update.time_seconds = parsed.data.timeSeconds;
  }
  if (parsed.data.points !== undefined) update.points = parsed.data.points;
  if (parsed.data.videoUrl !== undefined) update.video_url = parsed.data.videoUrl;
  if (parsed.data.videoPath !== undefined) update.video_path = parsed.data.videoPath;
  if (normalizedEmbedUrl !== undefined) update.video_embed_url = normalizedEmbedUrl;
  if (resolvedVideoProvider !== undefined) update.video_provider = resolvedVideoProvider;
  if (parsed.data.videoMimeType !== undefined) {
    update.video_mime_type = parsed.data.videoMimeType;
  }
  if (parsed.data.videoDurationSeconds !== undefined) {
    update.video_duration_seconds = parsed.data.videoDurationSeconds;
  }
  if (parsed.data.videoPosterUrl !== undefined) {
    update.video_poster_url = parsed.data.videoPosterUrl;
  }
  if (parsed.data.videoWidth !== undefined) update.video_width = parsed.data.videoWidth;
  if (parsed.data.videoHeight !== undefined) update.video_height = parsed.data.videoHeight;
  if (parsed.data.mediaLeadSeconds !== undefined) {
    update.media_lead_seconds = parsed.data.mediaLeadSeconds;
  }

  const { data, error } = await serviceSupabase
    .from("questions")
    .update(update)
    .eq("id", questionId)
    .eq("quiz_id", quizId)
    .select("*")
    .maybeSingle();

  if (error) {
    return privateNoStoreJson<AdminQuestionErrorBody>(
      { error: "WRITE_FAILED", message: "Update failed." },
      { status: 500 },
    );
  }

  if (!data) {
    return privateNoStoreJson<AdminQuestionErrorBody>(
      { error: "QUESTION_NOT_FOUND", message: "Question not found." },
      { status: 404 },
    );
  }

  return privateNoStoreJson<AdminQuestionDetailBody>({
    question: toDetail(data),
    ...(scoreChanges.length > 0 && affectedSessionIds.length > 0
      ? { requiresRescore: affectedSessionIds }
      : {}),
  });
}

export async function DELETE(
  _request: NextRequest,
  context: AdminQuestionItemRouteContext,
) {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  const { id: quizId, questionId } = await context.params;
  const serviceSupabase = await createServiceRoleSupabaseClient();
  const { data, error } = await serviceSupabase
    .from("questions")
    .delete()
    .eq("id", questionId)
    .eq("quiz_id", quizId)
    .select("id")
    .maybeSingle();

  if (error) {
    return privateNoStoreJson<AdminQuestionErrorBody>(
      { error: "WRITE_FAILED", message: "Delete failed." },
      { status: 500 },
    );
  }

  if (!data) {
    return privateNoStoreJson<AdminQuestionErrorBody>(
      { error: "QUESTION_NOT_FOUND", message: "Question not found." },
      { status: 404 },
    );
  }

  return privateNoStoreJson<AdminQuestionDeleteBody>({ status: "deleted" });
}
