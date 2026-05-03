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
