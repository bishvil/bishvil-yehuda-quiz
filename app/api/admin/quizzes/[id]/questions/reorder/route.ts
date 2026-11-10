import { type NextRequest } from "next/server";

import {
  assertQuizEditable,
  QUIZ_LOCKED_MESSAGE,
} from "@/src/lib/admin/quiz-lock";
import { hasLockedQuizEditOverride } from "@/src/lib/admin/quiz-edit-override";
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
  error:
    | "INVALID_REQUEST"
    | "QUIZ_NOT_FOUND"
    | "WRITE_FAILED"
    | "VALIDATION_FAILED";
  message: string;
}

/** The RPC locks, validates and normalizes the complete order in one transaction. */
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

  // Reorder mutates ordinal columns; locked once a session exists unless the
  // admin explicitly acknowledged locked-quiz editing.
  const lock = await assertQuizEditable(serviceSupabase, quizId, {
    allowLockedEdit: hasLockedQuizEditOverride(request),
  });
  if (!lock.ok) return lock.response;

  const { data: count, error } = await serviceSupabase.rpc(
    "reorder_quiz_questions",
    {
      p_quiz_id: quizId,
      p_ordinals: parsed.data.ordinals,
      p_allow_locked_edit: hasLockedQuizEditOverride(request),
    },
  );

  if (error) {
    if (error.code === "P0002") {
      return privateNoStoreJson<AdminQuestionReorderErrorBody>(
        { error: "QUIZ_NOT_FOUND", message: "Quiz not found." },
        { status: 404 },
      );
    }
    if (error.code === "22023") {
      return privateNoStoreJson<AdminQuestionReorderErrorBody>(
        { error: "VALIDATION_FAILED", message: error.message },
        { status: 400 },
      );
    }
    if (error.code === "P0001" && error.message === "QUIZ_LOCKED") {
      return privateNoStoreJson(
        {
          error: "QUIZ_LOCKED",
          message: QUIZ_LOCKED_MESSAGE,
          sessionCount: Number(error.details) || 0,
        },
        { status: 409 },
      );
    }
    return privateNoStoreJson<AdminQuestionReorderErrorBody>(
      {
        error: "WRITE_FAILED",
        message: "Reorder failed. No changes were saved.",
      },
      { status: 500 },
    );
  }

  return privateNoStoreJson<AdminQuestionReorderBody>({
    status: "reordered",
    count: count ?? 0,
  });
}
