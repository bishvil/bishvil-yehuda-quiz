import { type NextRequest } from "next/server";

import { requireRole } from "@/src/lib/auth/server-auth";
import { adminQuestionReorderSchema } from "@/src/lib/admin/validation";
import { privateNoStoreJson } from "@/src/lib/http/responses";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/server";

interface AdminQuestionReorderContext {
  params: Promise<{ id: string }>;
}

interface AdminQuestionReorderBody {
  status: "reordered";
  count: number;
}

interface AdminQuestionReorderErrorBody {
  error: "INVALID_REQUEST" | "QUIZ_NOT_FOUND" | "WRITE_FAILED" | "VALIDATION_FAILED";
  message: string;
}

/**
 * Bulk reorder endpoint that updates all question ordinals atomically.
 *
 * Uses ordinal negation transaction to avoid UNIQUE(quiz_id, ordinal) collisions:
 * 1. Negate all ordinals for the quiz (-1 * ordinal)
 * 2. Set each question to its final positive ordinal
 *
 * This ensures no duplicate ordinals during the intermediate state.
 */
export async function POST(
  request: NextRequest,
  context: AdminQuestionReorderContext,
) {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  const { id: quizId } = await context.params;
  const parsed = adminQuestionReorderSchema.safeParse(await request.json());
  if (!parsed.success) {
    return privateNoStoreJson<AdminQuestionReorderErrorBody>(
      { error: "INVALID_REQUEST", message: "Reorder body invalid." },
      { status: 400 },
    );
  }

  const serviceSupabase = await createServiceRoleSupabaseClient();

  // Verify quiz exists
  const { data: quizExists, error: quizError } = await serviceSupabase
    .from("quizzes")
    .select("id")
    .eq("id", quizId)
    .maybeSingle();

  if (quizError) {
    return privateNoStoreJson<AdminQuestionReorderErrorBody>(
      { error: "WRITE_FAILED", message: "Failed to verify quiz." },
      { status: 500 },
    );
  }

  if (!quizExists) {
    return privateNoStoreJson<AdminQuestionReorderErrorBody>(
      { error: "QUIZ_NOT_FOUND", message: "Quiz not found." },
      { status: 404 },
    );
  }

  // Fetch all current questions to validate the update is complete
  const { data: currentQuestions, error: fetchError } = await serviceSupabase
    .from("questions")
    .select("id, ordinal")
    .eq("quiz_id", quizId);

  if (fetchError) {
    return privateNoStoreJson<AdminQuestionReorderErrorBody>(
      { error: "WRITE_FAILED", message: "Failed to fetch questions." },
      { status: 500 },
    );
  }

  // Validate that every question in the quiz is being reassigned exactly once
  const currentIds = new Set((currentQuestions ?? []).map((q) => q.id));
  const newIds = new Set(parsed.data.ordinals.map((o) => o.id));

  if (currentIds.size !== newIds.size || ![...currentIds].every((id) => newIds.has(id))) {
    return privateNoStoreJson<AdminQuestionReorderErrorBody>(
      {
        error: "VALIDATION_FAILED",
        message: "Reorder must include all questions and no others.",
      },
      { status: 400 },
    );
  }

  try {
    // Negate all ordinals to avoid UNIQUE constraint collision
    const { error: negateError } = await serviceSupabase
      .from("questions")
      .update({ ordinal: -1 })
      .eq("quiz_id", quizId);

    if (negateError) {
      throw new Error(`Negate step failed: ${negateError.message}`);
    }

    // Update each question to its final positive ordinal
    for (const { id, ordinal } of parsed.data.ordinals) {
      const { error: updateError } = await serviceSupabase
        .from("questions")
        .update({ ordinal })
        .eq("id", id)
        .eq("quiz_id", quizId);

      if (updateError) {
        throw new Error(`Update question ${id} failed: ${updateError.message}`);
      }
    }

    return privateNoStoreJson<AdminQuestionReorderBody>({
      status: "reordered",
      count: parsed.data.ordinals.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return privateNoStoreJson<AdminQuestionReorderErrorBody>(
      { error: "WRITE_FAILED", message: `Reorder failed: ${message}` },
      { status: 500 },
    );
  }
}
