import { type NextRequest } from "next/server";

import { requireRole } from "@/src/lib/auth/server-auth";
import { privateNoStoreJson } from "@/src/lib/http/responses";
import { writeLog } from "@/src/lib/logging";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/server";

interface OkBody {
  ok: true;
  reassignedQuizzes: number;
  releasedSessions: number;
}

interface ErrBody {
  error: "INVALID_REQUEST" | "FORBIDDEN_SELF" | "WRITE_FAILED";
  message: string;
}

/**
 * Reassign all of a user's owned quizzes to the calling admin and release
 * (NULL host_id on) all sessions they host. Used to unblock user deletion
 * without losing data — sessions are state-machine-managed (not deletable),
 * and quizzes have NOT NULL owner_id, so transferring ownership is the safe
 * way to clear references.
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  let body: { userId?: unknown };
  try {
    body = await request.json();
  } catch {
    return privateNoStoreJson<ErrBody>(
      { error: "INVALID_REQUEST", message: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const userId = typeof body.userId === "string" ? body.userId : null;
  if (!userId) {
    return privateNoStoreJson<ErrBody>(
      { error: "INVALID_REQUEST", message: "userId is required." },
      { status: 400 },
    );
  }
  if (userId === auth.claims.userId) {
    return privateNoStoreJson<ErrBody>(
      {
        error: "FORBIDDEN_SELF",
        message: "Cannot transfer your own content to yourself.",
      },
      { status: 400 },
    );
  }

  const supabase = await createServiceRoleSupabaseClient();

  const { data: quizzes, error: qErr } = await supabase
    .from("quizzes")
    .update({ owner_id: auth.claims.userId })
    .eq("owner_id", userId)
    .select("id");
  if (qErr) {
    writeLog({
      level: "error",
      message: "cleanup-ownership: quiz reassign failed",
      context: { userId, error: qErr.message },
    });
    return privateNoStoreJson<ErrBody>(
      { error: "WRITE_FAILED", message: "Failed to reassign quizzes." },
      { status: 500 },
    );
  }

  const { data: sessions, error: sErr } = await supabase
    .from("sessions")
    .update({ host_id: null })
    .eq("host_id", userId)
    .select("id");
  if (sErr) {
    writeLog({
      level: "error",
      message: "cleanup-ownership: session release failed",
      context: { userId, error: sErr.message },
    });
    return privateNoStoreJson<ErrBody>(
      { error: "WRITE_FAILED", message: "Failed to release sessions." },
      { status: 500 },
    );
  }

  return privateNoStoreJson<OkBody>({
    ok: true,
    reassignedQuizzes: quizzes?.length ?? 0,
    releasedSessions: sessions?.length ?? 0,
  });
}
