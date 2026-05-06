import { type NextRequest } from "next/server";

import { assertQuizEditable } from "@/src/lib/admin/quiz-lock";
import { requireRole } from "@/src/lib/auth/server-auth";
import { adminQuestionCreateSchema } from "@/src/lib/admin/validation";
import { resolveVideoEmbedFields } from "@/src/lib/admin/video-embed";
import { privateNoStoreJson } from "@/src/lib/http/responses";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/server";
import type { Database, Json } from "@/src/lib/supabase/database.types";

interface AdminQuestionRouteContext {
  params: Promise<{ id: string }>;
}

interface AdminQuestionListItem {
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
  createdAt: string;
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
}

interface AdminQuestionListBody {
  questions: AdminQuestionListItem[];
}

interface AdminQuestionCreateBody {
  question: AdminQuestionListItem;
}

interface AdminQuestionErrorBody {
  error: "INVALID_REQUEST" | "QUIZ_NOT_FOUND" | "WRITE_FAILED";
  message: string;
}

function toListItem(
  row: Database["public"]["Tables"]["questions"]["Row"],
): AdminQuestionListItem {
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
    createdAt: row.created_at,
    videoUrl: row.video_url ?? null,
    videoPath: row.video_path ?? null,
    videoEmbedUrl: row.video_embed_url ?? null,
    videoProvider: row.video_provider ?? null,
    videoMimeType: row.video_mime_type ?? null,
    videoDurationSeconds: row.video_duration_seconds ?? null,
    videoPosterUrl: row.video_poster_url ?? null,
    videoPosterPath: null, // video_poster_path column not in DB schema — UI-only for session lifetime
    videoWidth: row.video_width ?? null,
    videoHeight: row.video_height ?? null,
    mediaLeadSeconds: row.media_lead_seconds ?? 0,
  };
}

export async function GET(
  _request: NextRequest,
  context: AdminQuestionRouteContext,
) {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  const { id: quizId } = await context.params;
  const serviceSupabase = await createServiceRoleSupabaseClient();
  const { data, error } = await serviceSupabase
    .from("questions")
    .select("*")
    .eq("quiz_id", quizId)
    .order("ordinal", { ascending: true });

  if (error) {
    return privateNoStoreJson<AdminQuestionErrorBody>(
      { error: "WRITE_FAILED", message: "Failed to list questions." },
      { status: 500 },
    );
  }

  return privateNoStoreJson<AdminQuestionListBody>({
    questions: (data ?? []).map(toListItem),
  });
}

export async function POST(
  request: NextRequest,
  context: AdminQuestionRouteContext,
) {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  const { id: quizId } = await context.params;
  const parsed = adminQuestionCreateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return privateNoStoreJson<AdminQuestionErrorBody>(
      { error: "INVALID_REQUEST", message: "Question body invalid." },
      { status: 400 },
    );
  }

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
  const normalizedEmbedUrl = videoFields.embedUrl;
  const resolvedVideoProvider = videoFields.provider;

  const serviceSupabase = await createServiceRoleSupabaseClient();

  // ADR-0013 — adding a question is a content edit; locked once the quiz
  // has any session. assertQuizEditable also returns 404 for missing quiz.
  const lock = await assertQuizEditable(serviceSupabase, quizId);
  if (!lock.ok) return lock.response;

  const insert: Database["public"]["Tables"]["questions"]["Insert"] = {
    quiz_id: quizId,
    ordinal: parsed.data.ordinal,
    type: parsed.data.type,
    prompt: parsed.data.prompt,
    options: (parsed.data.options ?? null) as Json | null,
    correct_ids: parsed.data.correctIds ?? null,
    map: (parsed.data.map ?? null) as Json | null,
    image_url: parsed.data.imageUrl ?? null,
    image_alt: parsed.data.imageAlt ?? null,
    image_width: parsed.data.imageWidth ?? null,
    image_height: parsed.data.imageHeight ?? null,
    image_path: parsed.data.imagePath ?? null,
    explanation: parsed.data.explanation ?? null,
    time_seconds: parsed.data.timeSeconds,
    points: parsed.data.points,
    video_url: parsed.data.videoUrl ?? null,
    video_path: parsed.data.videoPath ?? null,
    video_embed_url: normalizedEmbedUrl,
    video_provider: resolvedVideoProvider,
    video_mime_type: parsed.data.videoMimeType ?? null,
    video_duration_seconds: parsed.data.videoDurationSeconds ?? null,
    video_poster_url: parsed.data.videoPosterUrl ?? null,
    video_width: parsed.data.videoWidth ?? null,
    video_height: parsed.data.videoHeight ?? null,
    media_lead_seconds: parsed.data.mediaLeadSeconds ?? 0,
  };

  const { data, error } = await serviceSupabase
    .from("questions")
    .insert(insert)
    .select("*")
    .single();

  if (error || !data) {
    return privateNoStoreJson<AdminQuestionErrorBody>(
      { error: "WRITE_FAILED", message: "Failed to create question." },
      { status: 500 },
    );
  }

  return privateNoStoreJson<AdminQuestionCreateBody>(
    { question: toListItem(data) },
    { status: 201 },
  );
}
