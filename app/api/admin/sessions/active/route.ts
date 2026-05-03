import { buildTeamUserMap, fetchTeamUsers } from "@/src/lib/admin/team-lookup";
import { requireRole } from "@/src/lib/auth/server-auth";
import { privateNoStoreJson } from "@/src/lib/http/responses";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/server";
import type { Database } from "@/src/lib/supabase/database.types";

type SessionStatus = Database["public"]["Tables"]["sessions"]["Row"]["status"];

export interface ActiveSessionRow {
  id: string;
  pin: string;
  status: SessionStatus;
  quizId: string;
  quizTitle: string;
  brandId: string;
  gameMode: "sync" | "async";
  hostId: string | null;
  hostEmail: string | null;
  startedAt: string | null;
  createdAt: string;
}

interface ActiveSessionsBody {
  sessions: ActiveSessionRow[];
}

interface ActiveSessionsErrorBody {
  error: "READ_FAILED";
  message: string;
}

const ACTIVE_STATUSES: readonly SessionStatus[] = [
  "live",
  "scheduled",
  "paused",
];

/**
 * QA-23: cross-quiz list of sessions that are currently in flight. Powers
 * `/admin/sessions`. Excludes draft (not-yet-published) and ended (already
 * past) — those land on the Results page.
 */
export async function GET() {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  interface SessionJoinedRow {
    id: string;
    pin: string;
    status: SessionStatus;
    quiz_id: string;
    host_id: string | null;
    game_mode: "sync" | "async";
    started_at: string | null;
    created_at: string;
    quizzes: { title: string; brand_id: string } | null;
  }

  const supabase = await createServiceRoleSupabaseClient();
  const [{ data, error }, hostUsers] = await Promise.all([
    supabase
      .from("sessions")
      .select(
        "id, pin, status, quiz_id, host_id, game_mode, started_at, created_at, quizzes(title, brand_id)",
      )
      .in("status", [...ACTIVE_STATUSES])
      .order("started_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    fetchTeamUsers(supabase),
  ]);

  if (error) {
    return privateNoStoreJson<ActiveSessionsErrorBody>(
      { error: "READ_FAILED", message: "Failed to list active sessions." },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as unknown as SessionJoinedRow[];
  const hostMap = buildTeamUserMap(hostUsers);

  const sessions: ActiveSessionRow[] = rows
    .filter((row) => row.quizzes !== null)
    .map((row) => ({
      id: row.id,
      pin: row.pin,
      status: row.status,
      quizId: row.quiz_id,
      quizTitle: row.quizzes?.title ?? "",
      brandId: row.quizzes?.brand_id ?? "",
      gameMode: row.game_mode,
      hostId: row.host_id,
      hostEmail: row.host_id ? (hostMap.get(row.host_id)?.email ?? null) : null,
      startedAt: row.started_at,
      createdAt: row.created_at,
    }));

  return privateNoStoreJson<ActiveSessionsBody>({ sessions });
}
