import { type NextRequest } from "next/server";

import { requireRole } from "@/src/lib/auth/server-auth";
import { adminQuestionUpdateSchema } from "@/src/lib/admin/validation";
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
    explanation: string | null;
    timeSeconds: number;
    points: number;
  };
}

interface AdminQuestionDeleteBody {
  status: "deleted";
}

interface AdminQuestionErrorBody {
  error: "INVALID_REQUEST" | "QUESTION_NOT_FOUND" | "WRITE_FAILED";
  message: string;
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
    explanation: row.explanation,
    timeSeconds: row.time_seconds,
    points: row.points,
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
  if (parsed.data.explanation !== undefined) {
    update.explanation = parsed.data.explanation;
  }
  if (parsed.data.timeSeconds !== undefined) {
    update.time_seconds = parsed.data.timeSeconds;
  }
  if (parsed.data.points !== undefined) update.points = parsed.data.points;

  const serviceSupabase = await createServiceRoleSupabaseClient();
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

  return privateNoStoreJson<AdminQuestionDetailBody>({ question: toDetail(data) });
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
