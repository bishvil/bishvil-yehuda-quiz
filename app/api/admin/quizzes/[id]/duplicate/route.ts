import { type NextRequest } from "next/server";

import { requireRole } from "@/src/lib/auth/server-auth";
import { privateNoStoreJson } from "@/src/lib/http/responses";
import { writeLog } from "@/src/lib/logging";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/server";
import type { Database } from "@/src/lib/supabase/database.types";

/**
 * POST /api/admin/quizzes/[id]/duplicate (ADR-0013).
 *
 * Deep-copies a quiz + its questions into a new quiz owned by the caller.
 * The original is untouched. Storage objects (image / video) stay shared
 * because URLs are immutable per ADR-0010.
 *
 * Behaviour:
 * - Title becomes `"עותק של <source.title>"`.
 * - `archived_at` is reset to null — the duplicate is always active even
 *   if the source is archived (an archived quiz is the most common reason
 *   to duplicate).
 * - Owner becomes the calling admin, not the source's owner.
 * - All question content fields, including `order_index`, are preserved.
 *
 * No transaction is available through the Supabase JS client. If the
 * batch insert into `questions` fails after the new quiz row is written,
 * we hard-delete the orphan quiz so a retry isn't blocked.
 */
interface AdminQuizDuplicateBody {
  quiz: {
    id: string;
    title: string;
  };
}

interface AdminQuizDuplicateErrorBody {
  error: "QUIZ_NOT_FOUND" | "WRITE_FAILED";
  message: string;
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, context: RouteContext) {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  const { id: sourceId } = await context.params;
  const serviceSupabase = await createServiceRoleSupabaseClient();

  const { data: source, error: sourceError } = await serviceSupabase
    .from("quizzes")
    .select(
      "id, title, brand_id, default_game_mode, custom_logo, custom_logo_label, custom_logo_active, join_fields",
    )
    .eq("id", sourceId)
    .maybeSingle();

  if (sourceError) {
    return privateNoStoreJson<AdminQuizDuplicateErrorBody>(
      { error: "WRITE_FAILED", message: "Quiz lookup failed." },
      { status: 500 },
    );
  }

  if (!source) {
    return privateNoStoreJson<AdminQuizDuplicateErrorBody>(
      { error: "QUIZ_NOT_FOUND", message: "Quiz not found." },
      { status: 404 },
    );
  }

  const { data: sourceQuestions, error: questionsError } = await serviceSupabase
    .from("questions")
    .select("*")
    .eq("quiz_id", sourceId)
    .order("ordinal", { ascending: true });

  if (questionsError) {
    return privateNoStoreJson<AdminQuizDuplicateErrorBody>(
      { error: "WRITE_FAILED", message: "Question lookup failed." },
      { status: 500 },
    );
  }

  const insertQuiz: Database["public"]["Tables"]["quizzes"]["Insert"] = {
    owner_id: auth.claims.userId,
    brand_id: source.brand_id,
    title: `עותק של ${source.title}`,
    default_game_mode: source.default_game_mode,
    custom_logo: source.custom_logo,
    custom_logo_label: source.custom_logo_label,
    custom_logo_active: source.custom_logo_active,
    join_fields: source.join_fields,
  };

  const { data: newQuiz, error: insertQuizError } = await serviceSupabase
    .from("quizzes")
    .insert(insertQuiz)
    .select("id, title")
    .single();

  if (insertQuizError || !newQuiz) {
    writeLog({
      level: "error",
      message: "Quiz duplicate failed at quizzes insert",
      context: { sourceId, error: insertQuizError?.message ?? "unknown" },
    });
    return privateNoStoreJson<AdminQuizDuplicateErrorBody>(
      { error: "WRITE_FAILED", message: "Could not duplicate quiz." },
      { status: 500 },
    );
  }

  if ((sourceQuestions ?? []).length > 0) {
    const insertQuestions: Database["public"]["Tables"]["questions"]["Insert"][] =
      (sourceQuestions ?? []).map((row) => ({
        quiz_id: newQuiz.id,
        ordinal: row.ordinal,
        type: row.type,
        prompt: row.prompt,
        options: row.options,
        correct_ids: row.correct_ids,
        map: row.map,
        image_url: row.image_url,
        image_alt: row.image_alt,
        image_width: row.image_width,
        image_height: row.image_height,
        image_path: row.image_path,
        explanation: row.explanation,
        time_seconds: row.time_seconds,
        points: row.points,
        video_url: row.video_url,
        video_path: row.video_path,
        video_embed_url: row.video_embed_url,
        video_provider: row.video_provider,
        video_mime_type: row.video_mime_type,
        video_duration_seconds: row.video_duration_seconds,
        video_poster_url: row.video_poster_url,
        video_width: row.video_width,
        video_height: row.video_height,
        media_lead_seconds: row.media_lead_seconds ?? 0,
      }));

    const { error: insertQuestionsError } = await serviceSupabase
      .from("questions")
      .insert(insertQuestions);

    if (insertQuestionsError) {
      // Roll the orphan quiz back so the next attempt isn't blocked.
      await serviceSupabase.from("quizzes").delete().eq("id", newQuiz.id);
      writeLog({
        level: "error",
        message: "Quiz duplicate failed at questions insert; rolled back",
        context: {
          sourceId,
          newQuizId: newQuiz.id,
          error: insertQuestionsError.message,
        },
      });
      return privateNoStoreJson<AdminQuizDuplicateErrorBody>(
        { error: "WRITE_FAILED", message: "Could not duplicate questions." },
        { status: 500 },
      );
    }
  }

  return privateNoStoreJson<AdminQuizDuplicateBody>(
    {
      quiz: {
        id: newQuiz.id,
        title: newQuiz.title,
      },
    },
    { status: 201 },
  );
}
