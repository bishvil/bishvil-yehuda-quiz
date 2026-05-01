import { type NextRequest } from "next/server";

import { privateNoStoreJson } from "@/src/lib/http/responses";
import { loadHostContext } from "@/src/lib/sessions/host-context";
import { canTransitionSession } from "@/src/lib/sessions/state-machine";
import { safeRevalidateTag, sessionCacheTag } from "@/src/lib/cache/tags";
import { writeLog } from "@/src/lib/logging";

interface HostStartRouteContext {
  params: Promise<{ pin: string }>;
}

interface HostStartSuccessBody {
  sessionId: string;
  status: "live";
  startedAt: string;
}

interface HostStartErrorBody {
  error: "INVALID_TRANSITION" | "QUESTIONS_REQUIRED" | "WRITE_FAILED";
  message: string;
  code?: string;
  currentStatus?: string;
}

type HostStartResponseBody = HostStartSuccessBody | HostStartErrorBody;

/**
 * Transition a session `scheduled → live`. Idempotent if already live.
 * Refuses if the session has zero questions, since a live empty session is
 * unrecoverable for participants.
 */
export async function POST(
  _request: NextRequest,
  context: HostStartRouteContext,
) {
  const { pin } = await context.params;
  const ctx = await loadHostContext(pin);
  if (!ctx.ok) return ctx.response;
  const { session, serviceSupabase } = ctx;

  if (session.status === "live") {
    return privateNoStoreJson<HostStartResponseBody>(
      {
        sessionId: session.id,
        status: "live",
        startedAt: session.started_at ?? new Date().toISOString(),
      },
      { status: 200 },
    );
  }

  if (!canTransitionSession(session.status, "live")) {
    return privateNoStoreJson<HostStartResponseBody>(
      {
        error: "INVALID_TRANSITION",
        code: "SESSION_INVALID_TRANSITION",
        currentStatus: session.status,
        message: `Cannot start session in status ${session.status}.`,
      },
      { status: 409 },
    );
  }

  const { count: questionCount } = await serviceSupabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("quiz_id", session.quiz_id);

  if (!questionCount || questionCount === 0) {
    return privateNoStoreJson<HostStartResponseBody>(
      {
        error: "QUESTIONS_REQUIRED",
        message: "Cannot start a session with no questions.",
      },
      { status: 409 },
    );
  }

  const startedAt = new Date().toISOString();
  const { data: updated, error: updateError } = await serviceSupabase
    .from("sessions")
    .update({
      status: "live",
      started_at: startedAt,
      host_last_seen_at: startedAt,
    })
    .eq("id", session.id)
    .eq("status", session.status)
    .select("id, status, started_at")
    .maybeSingle();

  if (updateError || !updated) {
    writeLog({
      level: "error",
      message: "Failed to start session",
      context: {
        sessionId: session.id,
        error: updateError?.message ?? "no row updated",
      },
    });
    return privateNoStoreJson<HostStartResponseBody>(
      { error: "WRITE_FAILED", message: "Could not start session." },
      { status: 500 },
    );
  }

  safeRevalidateTag(sessionCacheTag(session.id));

  return privateNoStoreJson<HostStartResponseBody>(
    {
      sessionId: updated.id,
      status: "live",
      startedAt: updated.started_at ?? startedAt,
    },
    { status: 200 },
  );
}
