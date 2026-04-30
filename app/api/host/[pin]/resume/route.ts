import { type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";

import { privateNoStoreJson } from "@/src/lib/http/responses";
import { loadHostContext } from "@/src/lib/sessions/host-context";
import { canTransitionSession } from "@/src/lib/sessions/state-machine";
import { sessionCacheTag } from "@/src/lib/cache/tags";

interface HostResumeRouteContext {
  params: Promise<{ pin: string }>;
}

interface HostResumeSuccessBody {
  sessionId: string;
  status: "live";
}

interface HostResumeErrorBody {
  error: "INVALID_TRANSITION" | "WRITE_FAILED";
  message: string;
}

type HostResumeResponseBody = HostResumeSuccessBody | HostResumeErrorBody;

/**
 * `paused → live` per ADR-0004 §1.
 */
export async function POST(
  _request: NextRequest,
  context: HostResumeRouteContext,
) {
  const { pin } = await context.params;
  const ctx = await loadHostContext(pin);
  if (!ctx.ok) return ctx.response;
  const { session, serviceSupabase } = ctx;

  if (session.status === "live") {
    return privateNoStoreJson<HostResumeResponseBody>(
      { sessionId: session.id, status: "live" },
      { status: 200 },
    );
  }

  if (!canTransitionSession(session.status, "live")) {
    return privateNoStoreJson<HostResumeResponseBody>(
      {
        error: "INVALID_TRANSITION",
        message: `Cannot resume from status ${session.status}.`,
      },
      { status: 409 },
    );
  }

  const { data: updated, error } = await serviceSupabase
    .from("sessions")
    .update({ status: "live", host_last_seen_at: new Date().toISOString() })
    .eq("id", session.id)
    .eq("status", "paused")
    .select("id, status")
    .maybeSingle();

  if (error || !updated) {
    return privateNoStoreJson<HostResumeResponseBody>(
      { error: "WRITE_FAILED", message: "Could not resume session." },
      { status: 500 },
    );
  }

  revalidateTag(sessionCacheTag(session.id), "default");
  return privateNoStoreJson<HostResumeResponseBody>(
    { sessionId: updated.id, status: "live" },
    { status: 200 },
  );
}
