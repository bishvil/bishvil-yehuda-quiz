import { type NextRequest } from "next/server";
import { z } from "zod";

import { buildTeamUserMap, fetchTeamUsers } from "@/src/lib/admin/team-lookup";
import { requireRole } from "@/src/lib/auth/server-auth";
import { privateNoStoreJson } from "@/src/lib/http/responses";
import { writeLog } from "@/src/lib/logging";
import { HOST_REASSIGNABLE_STATUSES } from "@/src/lib/sessions/state-machine";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/server";
import type { SessionStatusEnum } from "@/src/lib/supabase/database.types";

type SessionStatus = SessionStatusEnum;

/**
 * Statuses that are safe to soft-archive or hard-delete. live/paused are
 * blocked because the host is actively running the game; callers must end
 * the session first.
 */
const TERMINABLE_STATUSES: readonly SessionStatus[] = ["draft", "scheduled", "ended"];

interface AdminSessionDeleteBody {
  status: "archived";
  archivedAt: string;
}

interface AdminSessionHardDeleteBody {
  status: "deleted";
  id: string;
}

interface AdminSessionDeleteErrorBody {
  error:
    | "NOT_FOUND"
    | "INVALID_STATE"
    | "NOT_ARCHIVED"
    | "WRITE_FAILED";
  message: string;
}

interface AdminSessionRow {
  id: string;
  pin: string;
  quizId: string;
  status: SessionStatus;
  gameMode: "sync" | "async";
  autoReveal: boolean;
  hostId: string | null;
  hostEmail: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
}

interface PatchBody {
  session: AdminSessionRow;
}

interface PatchErrorBody {
  error:
    | "INVALID_REQUEST"
    | "INVALID_HOST"
    | "NOT_FOUND"
    | "INVALID_STATE"
    | "WRITE_FAILED";
  message: string;
}

const patchSchema = z.object({
  hostUserId: z.string().uuid(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return privateNoStoreJson<PatchErrorBody>(
      { error: "INVALID_REQUEST", message: "Body must contain a hostUserId." },
      { status: 400 },
    );
  }

  const supabase = await createServiceRoleSupabaseClient();

  const { data: existing, error: readError } = await supabase
    .from("sessions")
    .select(
      "id, pin, quiz_id, status, game_mode, auto_reveal, host_id, started_at, ended_at, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (readError) {
    return privateNoStoreJson<PatchErrorBody>(
      { error: "WRITE_FAILED", message: "Failed to load session." },
      { status: 500 },
    );
  }

  if (!existing) {
    return privateNoStoreJson<PatchErrorBody>(
      { error: "NOT_FOUND", message: "Session not found." },
      { status: 404 },
    );
  }

  if (!HOST_REASSIGNABLE_STATUSES.includes(existing.status)) {
    return privateNoStoreJson<PatchErrorBody>(
      {
        error: "INVALID_STATE",
        message: "Cannot reassign host once the game has started.",
      },
      { status: 409 },
    );
  }

  const hostUsers = await fetchTeamUsers(supabase);
  const hostMap = buildTeamUserMap(hostUsers);
  if (!hostMap.has(parsed.data.hostUserId)) {
    return privateNoStoreJson<PatchErrorBody>(
      {
        error: "INVALID_HOST",
        message: "Selected host is not an admin or host on this team.",
      },
      { status: 400 },
    );
  }

  const { error: updateError } = await supabase
    .from("sessions")
    .update({ host_id: parsed.data.hostUserId })
    .eq("id", id);

  if (updateError) {
    writeLog({
      level: "error",
      message: "Session host update failed",
      context: { sessionId: id, error: updateError.message },
    });
    return privateNoStoreJson<PatchErrorBody>(
      { error: "WRITE_FAILED", message: "Could not update session." },
      { status: 500 },
    );
  }

  return privateNoStoreJson<PatchBody>({
    session: {
      id: existing.id,
      pin: existing.pin,
      quizId: existing.quiz_id,
      status: existing.status,
      gameMode: existing.game_mode,
      autoReveal: existing.auto_reveal,
      hostId: parsed.data.hostUserId,
      hostEmail: hostMap.get(parsed.data.hostUserId)?.email ?? null,
      startedAt: existing.started_at,
      endedAt: existing.ended_at,
      createdAt: existing.created_at,
    },
  });
}

/**
 * DELETE /api/admin/sessions/[id]
 *
 * Dual-mode delete mirroring the quiz archive/hard-delete pattern:
 *
 *   - Default (no ?hard=true): soft-archive — sets archived_at = now().
 *     Blocked for live/paused sessions (409 INVALID_STATE) — the host must end
 *     the game first. Scheduling sessions are transitioned to ended at the same
 *     time so the PIN partial-unique index releases the PIN slot ("Run again").
 *
 *   - ?hard=true: hard-delete the row. Two guards:
 *       1. Session must already be archived (NOT_ARCHIVED → 409).
 *       2. Session status must not be live/paused (INVALID_STATE → 409).
 *     Cascade: all child tables carry ON DELETE CASCADE on session_id
 *     (session_participants, answers, question_session_state,
 *     participant_question_progress, participant_scores) so the DB removes
 *     child rows atomically. No explicit child deletes needed in this handler.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const url = new URL(request.url);
  const hard = url.searchParams.get("hard") === "true";

  const supabase = await createServiceRoleSupabaseClient();

  const { data: existing, error: lookupError } = await supabase
    .from("sessions")
    .select("id, status, archived_at")
    .eq("id", id)
    .maybeSingle();

  if (lookupError) {
    writeLog({
      level: "error",
      message: "Session lookup failed for delete",
      context: { sessionId: id, error: lookupError.message },
    });
    return privateNoStoreJson<AdminSessionDeleteErrorBody>(
      { error: "WRITE_FAILED", message: "Session lookup failed." },
      { status: 500 },
    );
  }

  if (!existing) {
    return privateNoStoreJson<AdminSessionDeleteErrorBody>(
      { error: "NOT_FOUND", message: "Session not found." },
      { status: 404 },
    );
  }

  if (hard) {
    if (existing.archived_at === null) {
      return privateNoStoreJson<AdminSessionDeleteErrorBody>(
        {
          error: "NOT_ARCHIVED",
          message: "יש לארכב את המשחק לפני מחיקה לצמיתות.",
        },
        { status: 409 },
      );
    }

    if (!TERMINABLE_STATUSES.includes(existing.status)) {
      return privateNoStoreJson<AdminSessionDeleteErrorBody>(
        {
          error: "INVALID_STATE",
          message: "לא ניתן למחוק משחק שעדיין פעיל.",
        },
        { status: 409 },
      );
    }

    const { error: deleteError } = await supabase
      .from("sessions")
      .delete()
      .eq("id", id);

    if (deleteError) {
      writeLog({
        level: "error",
        message: "Session hard-delete failed",
        context: { sessionId: id, error: deleteError.message },
      });
      return privateNoStoreJson<AdminSessionDeleteErrorBody>(
        { error: "WRITE_FAILED", message: "Hard-delete failed." },
        { status: 500 },
      );
    }

    return privateNoStoreJson<AdminSessionHardDeleteBody>({
      status: "deleted",
      id,
    });
  }

  // Soft-archive: block live/paused sessions.
  if (!TERMINABLE_STATUSES.includes(existing.status)) {
    return privateNoStoreJson<AdminSessionDeleteErrorBody>(
      {
        error: "INVALID_STATE",
        message: "יש לסיים את המשחק לפני שניתן לארכב אותו.",
      },
      { status: 409 },
    );
  }

  const archivedAt = new Date().toISOString();
  // Scheduled sessions must be transitioned to ended so the partial unique
  // index on (pin, status IN ('scheduled','live')) releases the PIN slot,
  // allowing "Run again" to create a new session with a fresh PIN.
  const updatePayload: { archived_at: string; status?: SessionStatus } = {
    archived_at: archivedAt,
  };
  if (existing.status === "scheduled") {
    updatePayload.status = "ended";
  }

  const { error: updateError } = await supabase
    .from("sessions")
    .update(updatePayload)
    .eq("id", id);

  if (updateError) {
    writeLog({
      level: "error",
      message: "Session archive failed",
      context: { sessionId: id, error: updateError.message },
    });
    return privateNoStoreJson<AdminSessionDeleteErrorBody>(
      { error: "WRITE_FAILED", message: "Archive failed." },
      { status: 500 },
    );
  }

  return privateNoStoreJson<AdminSessionDeleteBody>({
    status: "archived",
    archivedAt,
  });
}
