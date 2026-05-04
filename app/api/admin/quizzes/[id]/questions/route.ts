import { type NextRequest } from "next/server";

import { requireRole } from "@/src/lib/auth/server-auth";
import { adminQuestionCreateSchema } from "@/src/lib/admin/validation";
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
  explanation: string | null;
  timeSeconds: number;
  points: number;
  createdAt: string;
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
    explanation: row.explanation,
    timeSeconds: row.time_seconds,
    points: row.points,
    createdAt: row.created_at,
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

  const serviceSupabase = await createServiceRoleSupabaseClient();
  const { data: quizExists } = await serviceSupabase
    .from("quizzes")
    .select("id")
    .eq("id", quizId)
    .maybeSingle();

  if (!quizExists) {
    return privateNoStoreJson<AdminQuestionErrorBody>(
      { error: "QUIZ_NOT_FOUND", message: "Quiz not found." },
      { status: 404 },
    );
  }

  const insert: Database["public"]["Tables"]["questions"]["Insert"] = {
    quiz_id: quizId,
    ordinal: parsed.data.ordinal,
    type: parsed.data.type,
    prompt: parsed.data.prompt,
    options: (parsed.data.options ?? null) as Json | null,
    correct_ids: parsed.data.correctIds ?? null,
    map: (parsed.data.map ?? null) as Json | null,
    image_url: parsed.data.imageUrl ?? null,
    explanation: parsed.data.explanation ?? null,
    time_seconds: parsed.data.timeSeconds,
    points: parsed.data.points,
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
