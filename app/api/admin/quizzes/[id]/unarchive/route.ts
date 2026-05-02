import { type NextRequest } from "next/server";

import { requireRole } from "@/src/lib/auth/server-auth";
import { privateNoStoreJson } from "@/src/lib/http/responses";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/server";

interface AdminQuizUnarchiveRouteContext {
  params: Promise<{ id: string }>;
}

interface AdminQuizUnarchiveBody {
  status: "active";
  archivedAt: null;
}

interface AdminQuizUnarchiveErrorBody {
  error: "QUIZ_NOT_FOUND" | "WRITE_FAILED";
  message: string;
}

/**
 * Restore a previously-archived quiz. Sets `archived_at` back to NULL
 * so the quiz re-appears in the default (non-archived) list view.
 */
export async function POST(
  _request: NextRequest,
  context: AdminQuizUnarchiveRouteContext,
) {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  const { id } = await context.params;

  const serviceSupabase = await createServiceRoleSupabaseClient();
  const { data, error } = await serviceSupabase
    .from("quizzes")
    .update({ archived_at: null })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    return privateNoStoreJson<AdminQuizUnarchiveErrorBody>(
      { error: "WRITE_FAILED", message: "Unarchive failed." },
      { status: 500 },
    );
  }

  if (!data) {
    return privateNoStoreJson<AdminQuizUnarchiveErrorBody>(
      { error: "QUIZ_NOT_FOUND", message: "Quiz not found." },
      { status: 404 },
    );
  }

  return privateNoStoreJson<AdminQuizUnarchiveBody>({
    status: "active",
    archivedAt: null,
  });
}
