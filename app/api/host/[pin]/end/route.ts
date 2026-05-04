import { type NextRequest } from "next/server";

import { privateNoStoreJson } from "@/src/lib/http/responses";
import { loadHostContext } from "@/src/lib/sessions/host-context";
import { canTransitionSession } from "@/src/lib/sessions/state-machine";
import { safeRevalidateTag, sessionCacheTag } from "@/src/lib/cache/tags";

interface HostEndRouteContext {
  params: Promise<{ pin: string }>;
}

interface HostEndSuccessBody {
  sessionId: string;
  status: "ended";
  endedAt: string;
}

interface HostEndErrorBody {
  error: "INVALID_TRANSITION" | "WRITE_FAILED";
  message: string;
  code?: string;
  currentStatus?: string;
}

type HostEndResponseBody = HostEndSuccessBody | HostEndErrorBody;

/**
 * Ends the session. Per ADR-0004 §1 the host can end from `live`, `paused`,
 * or (admin can end from) `scheduled`. As part of ending, all `answering`
 * question state rows are forced to `locked` (ADR-0005 §4 last row), so
 * any participant who hasn't submitted gets score 0 for those questions
 * (no answer row written, ADR-0006 §7 forfeit-row policy).
 */
export async function POST(
  _request: NextRequest,
  context: HostEndRouteContext,
) {
  const { pin } = await context.params;
  const ctx = await loadHostContext(pin);
  if (!ctx.ok) return ctx.response;
  const { session, serviceSupabase, canControl } = ctx;

  if (!canControl) {
    return privateNoStoreJson<HostEndResponseBody>(
      {
        error: "INVALID_TRANSITION",
        message: "Async sessions cannot be ended by the host — use the admin panel.",
      },
      { status: 409 },
    );
  }

  if (session.status === "ended") {
    return privateNoStoreJson<HostEndResponseBody>(
      {
        sessionId: session.id,
        status: "ended",
        endedAt: session.ended_at ?? new Date().toISOString(),
      },
      { status: 200 },
    );
  }

  if (!canTransitionSession(session.status, "ended")) {
    return privateNoStoreJson<HostEndResponseBody>(
      {
        error: "INVALID_TRANSITION",
        code: "SESSION_INVALID_TRANSITION",
        currentStatus: session.status,
        message: `Cannot end from status ${session.status}.`,
      },
      { status: 409 },
    );
  }

  const endedAt = new Date().toISOString();

  await serviceSupabase
    .from("question_session_state")
    .update({ status: "locked" })
    .eq("session_id", session.id)
    .eq("status", "answering");

  // ADR-0004 §2: when a session transitions to `ended`, every participant
  // is forced to `completed` (with whatever answers they had). Joined-but-
  // never-answered participants get the zero-score completion path.
  await serviceSupabase
    .from("session_participants")
    .update({ status: "completed" })
    .eq("session_id", session.id)
    .neq("status", "completed");

  const { data: updated, error } = await serviceSupabase
    .from("sessions")
    .update({ status: "ended", ended_at: endedAt })
    .eq("id", session.id)
    .neq("status", "ended")
    .select("id, status, ended_at")
    .maybeSingle();

  if (error || !updated) {
    return privateNoStoreJson<HostEndResponseBody>(
      { error: "WRITE_FAILED", message: "Could not end session." },
      { status: 500 },
    );
  }

  safeRevalidateTag(sessionCacheTag(session.id));
  return privateNoStoreJson<HostEndResponseBody>(
    {
      sessionId: updated.id,
      status: "ended",
      endedAt: updated.ended_at ?? endedAt,
    },
    { status: 200 },
  );
}
