import { type NextRequest } from "next/server";
import { z } from "zod";

import { buildTeamUserMap, fetchTeamUsers } from "@/src/lib/admin/team-lookup";
import { requireRole } from "@/src/lib/auth/server-auth";
import { privateNoStoreJson } from "@/src/lib/http/responses";
import { writeLog } from "@/src/lib/logging";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/server";
import type { Database } from "@/src/lib/supabase/database.types";

type SessionStatus = Database["public"]["Tables"]["sessions"]["Row"]["status"];

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

// QA-26: re-assigning a host is only safe before play has begun. Once a
// session is `live`/`paused`/`ended`, ADR-0004 bound the host to the run —
// transferring mid-game would orphan the host dashboard and the
// `host_last_seen_at` heartbeat.
const PATCH_ALLOWED_STATUSES: readonly SessionStatus[] = ["draft", "scheduled"];

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
  if (!z.string().uuid().safeParse(id).success) {
    return privateNoStoreJson<PatchErrorBody>(
      { error: "INVALID_REQUEST", message: "Invalid session id." },
      { status: 400 },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return privateNoStoreJson<PatchErrorBody>(
      { error: "INVALID_REQUEST", message: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const parsed = patchSchema.safeParse(json);
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

  if (!PATCH_ALLOWED_STATUSES.includes(existing.status)) {
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

  const { data: updated, error: updateError } = await supabase
    .from("sessions")
    .update({ host_id: parsed.data.hostUserId })
    .eq("id", id)
    .select(
      "id, pin, quiz_id, status, game_mode, auto_reveal, host_id, started_at, ended_at, created_at",
    )
    .single();

  if (updateError || !updated) {
    writeLog({
      level: "error",
      message: "Session host update failed",
      context: { sessionId: id, error: updateError?.message ?? "unknown" },
    });
    return privateNoStoreJson<PatchErrorBody>(
      { error: "WRITE_FAILED", message: "Could not update session." },
      { status: 500 },
    );
  }

  return privateNoStoreJson<PatchBody>({
    session: {
      id: updated.id,
      pin: updated.pin,
      quizId: updated.quiz_id,
      status: updated.status,
      gameMode: updated.game_mode,
      autoReveal: updated.auto_reveal,
      hostId: updated.host_id,
      hostEmail: updated.host_id
        ? (hostMap.get(updated.host_id)?.email ?? null)
        : null,
      startedAt: updated.started_at,
      endedAt: updated.ended_at,
      createdAt: updated.created_at,
    },
  });
}
