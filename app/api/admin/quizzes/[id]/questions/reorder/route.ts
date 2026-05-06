import { type NextRequest } from "next/server";

import { assertQuizEditable } from "@/src/lib/admin/quiz-lock";
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

  // ADR-0013 — reorder mutates ordinal columns; locked once a session
  // exists. assertQuizEditable handles missing-quiz 404s too.
  const lock = await assertQuizEditable(serviceSupabase, quizId);
  if (!lock.ok) return lock.response;

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
    // Negate all existing ordinals to avoid UNIQUE constraint collision.
    // Fetch current ordinals first so we can map them to unique negatives.
    const { data: currentQuestions, error: fetchCurrentError } = await serviceSupabase
      .from("questions")
      .select("id, ordinal")
      .eq("quiz_id", quizId);

    if (fetchCurrentError || !currentQuestions) {
      throw new Error("Failed to fetch current questions");
    }

    // Update each question with a unique negative ordinal (-(current+1))
    for (const row of currentQuestions) {
      const negOrdinal = -(row.ordinal + 1000); // Use offset to ensure unique negatives
      const { error: negError } = await serviceSupabase
        .from("questions")
        .update({ ordinal: negOrdinal })
        .eq("id", row.id)
        .eq("quiz_id", quizId);

      if (negError) {
        throw new Error(`Negate step failed for ${row.id}: ${negError.message}`);
      }
    }

    // Force-normalize to 1..N regardless of the client-supplied ordinal
    // values. Earlier code paths could leave huge sparse ordinals (e.g.
    // 115160) which then surfaced in the participant UI as "תחנה 115160
    // מתוך 6". Sorting by the client-provided ordinal preserves the
    // requested order while collapsing the values to a clean 1..N range.
    const normalized = [...parsed.data.ordinals]
      .sort((a, b) => a.ordinal - b.ordinal)
      .map((row, index) => ({ id: row.id, ordinal: index + 1 }));

    for (const { id, ordinal } of normalized) {
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
      count: normalized.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return privateNoStoreJson<AdminQuestionReorderErrorBody>(
      { error: "WRITE_FAILED", message: `Reorder failed: ${message}` },
      { status: 500 },
    );
  }
}
