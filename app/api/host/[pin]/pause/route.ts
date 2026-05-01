import { type NextRequest } from "next/server";

import { privateNoStoreJson } from "@/src/lib/http/responses";
import { loadHostContext } from "@/src/lib/sessions/host-context";
import { canTransitionSession } from "@/src/lib/sessions/state-machine";
import { safeRevalidateTag, sessionCacheTag } from "@/src/lib/cache/tags";

interface HostPauseRouteContext {
  params: Promise<{ pin: string }>;
}

interface HostPauseSuccessBody {
  sessionId: string;
  status: "paused";
}

interface HostPauseErrorBody {
  error: "INVALID_TRANSITION" | "ASYNC_NOT_PAUSABLE" | "WRITE_FAILED";
  message: string;
  code?: string;
  currentStatus?: string;
}

type HostPauseResponseBody = HostPauseSuccessBody | HostPauseErrorBody;

/**
 * `live → paused` per ADR-0004 §1. Sync mode only — async sessions have no
 * shared timer to pause.
 */
export async function POST(
  _request: NextRequest,
  context: HostPauseRouteContext,
) {
  const { pin } = await context.params;
  const ctx = await loadHostContext(pin);
  if (!ctx.ok) return ctx.response;
  const { session, serviceSupabase } = ctx;

  if (session.game_mode !== "sync") {
    return privateNoStoreJson<HostPauseResponseBody>(
      {
        error: "ASYNC_NOT_PAUSABLE",
        message: "Async sessions cannot be paused.",
      },
      { status: 409 },
    );
  }

  if (session.status === "paused") {
    return privateNoStoreJson<HostPauseResponseBody>(
      { sessionId: session.id, status: "paused" },
      { status: 200 },
    );
  }

  if (!canTransitionSession(session.status, "paused")) {
    return privateNoStoreJson<HostPauseResponseBody>(
      {
        error: "INVALID_TRANSITION",
        code: "SESSION_INVALID_TRANSITION",
        currentStatus: session.status,
        message: `Cannot pause from status ${session.status}.`,
      },
      { status: 409 },
    );
  }

  const { data: updated, error } = await serviceSupabase
    .from("sessions")
    .update({ status: "paused" })
    .eq("id", session.id)
    .eq("status", "live")
    .select("id, status")
    .maybeSingle();

  if (error || !updated) {
    return privateNoStoreJson<HostPauseResponseBody>(
      { error: "WRITE_FAILED", message: "Could not pause session." },
      { status: 500 },
    );
  }

  safeRevalidateTag(sessionCacheTag(session.id));
  return privateNoStoreJson<HostPauseResponseBody>(
    { sessionId: updated.id, status: "paused" },
    { status: 200 },
  );
}
