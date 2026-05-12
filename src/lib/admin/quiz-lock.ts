/**
 * Quiz edit guard.
 *
 * A quiz becomes read-only the moment any session row points at it,
 * regardless of session status (draft / scheduled / live / paused / ended,
 * archived or not). Admins can still opt into editing a quiz with sessions
 * from the editor after acknowledging the warning; those requests carry an
 * explicit override header and still pass through this single guard.
 *
 * `assertQuizEditable` is the single point of enforcement — it returns
 * `null` when the quiz is editable and a `409 QUIZ_LOCKED` JSON response
 * otherwise. Routes call it in PUT / POST / DELETE / reorder handlers
 * before any write.
 */
import { privateNoStoreJson } from "@/src/lib/http/responses";
import type { createServiceRoleSupabaseClient } from "@/src/lib/supabase/server";

type ServiceRoleSupabaseClient = Awaited<
  ReturnType<typeof createServiceRoleSupabaseClient>
>;

export const QUIZ_LOCKED_MESSAGE =
  "החידון נעול לעריכה כי כבר התקיימו ממנו משחקים. כדי לערוך — שכפלו אותו.";

export interface QuizLockedErrorBody {
  error: "QUIZ_LOCKED";
  message: string;
  sessionCount: number;
}

interface QuizLookupErrorBody {
  error: "QUIZ_NOT_FOUND" | "WRITE_FAILED";
  message: string;
}

type AssertQuizEditableResult =
  | { ok: true }
  | { ok: false; response: Response };

interface AssertQuizEditableOptions {
  allowLockedEdit?: boolean;
}

/**
 * Returns `{ ok: true }` if the quiz exists and has zero sessions, or if the
 * caller explicitly opted into locked-quiz editing.
 * Otherwise returns `{ ok: false, response }` where `response` is a 404 /
 * 409 / 500 ready to be returned from the handler.
 */
export async function assertQuizEditable(
  serviceSupabase: ServiceRoleSupabaseClient,
  quizId: string,
  options: AssertQuizEditableOptions = {},
): Promise<AssertQuizEditableResult> {
  const { data, error } = await serviceSupabase
    .from("quizzes")
    .select("id, sessions(count)")
    .eq("id", quizId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      response: privateNoStoreJson<QuizLookupErrorBody>(
        { error: "WRITE_FAILED", message: "Quiz lookup failed." },
        { status: 500 },
      ),
    };
  }

  if (!data) {
    return {
      ok: false,
      response: privateNoStoreJson<QuizLookupErrorBody>(
        { error: "QUIZ_NOT_FOUND", message: "Quiz not found." },
        { status: 404 },
      ),
    };
  }

  const sessionCount = Array.isArray(data.sessions)
    ? (data.sessions[0]?.count ?? 0)
    : 0;

  if (sessionCount > 0 && !options.allowLockedEdit) {
    return {
      ok: false,
      response: privateNoStoreJson<QuizLockedErrorBody>(
        {
          error: "QUIZ_LOCKED",
          message: QUIZ_LOCKED_MESSAGE,
          sessionCount,
        },
        { status: 409 },
      ),
    };
  }

  return { ok: true };
}
