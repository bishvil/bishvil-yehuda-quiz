import type { ServiceSupabase } from "./lookup";
import type { SessionStatusEnum } from "@/src/lib/supabase/database.types";

/**
 * One row returned by {@link listHostSessions} — enough to render the
 * `/host` home cards without a follow-up query per session.
 */
export interface HostSessionRow {
  id: string;
  pin: string;
  status: SessionStatusEnum;
  quizId: string;
  quizTitle: string;
  brandId: string;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
}

interface SessionRowJoined {
  id: string;
  pin: string;
  status: SessionStatusEnum;
  quiz_id: string;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  quizzes: {
    title: string;
    brand_id: string;
  } | null;
}

/**
 * Fetch every session whose `host_id` matches the signed-in host. We sort
 * by status (live → scheduled → paused → ended/draft) then `created_at`
 * descending so the freshest active sessions surface first; the host home
 * additionally collapses ended rows under a toggle. The DB has no
 * `scheduled_for` column today (see ADR-0004 §states), so scheduled rows
 * are ordered by creation time only.
 */
export async function listHostSessions(
  client: ServiceSupabase,
  hostId: string,
): Promise<HostSessionRow[]> {
  const { data, error } = await client
    .from("sessions")
    .select(
      "id, pin, status, quiz_id, started_at, ended_at, created_at, quizzes(title, brand_id)",
    )
    .eq("host_id", hostId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  const rows = data as unknown as SessionRowJoined[];

  return rows
    .filter((row) => row.quizzes !== null)
    .map((row) => ({
      id: row.id,
      pin: row.pin,
      status: row.status,
      quizId: row.quiz_id,
      quizTitle: row.quizzes?.title ?? "",
      brandId: row.quizzes?.brand_id ?? "",
      startedAt: row.started_at,
      endedAt: row.ended_at,
      createdAt: row.created_at,
    }))
    .sort((a, b) => statusRank(a.status) - statusRank(b.status));
}

function statusRank(status: SessionStatusEnum): number {
  switch (status) {
    case "live":
      return 0;
    case "scheduled":
      return 1;
    case "paused":
      return 2;
    case "draft":
      return 3;
    case "ended":
      return 4;
  }
}

/**
 * Group rows for the host home: ended sessions collapse under a toggle.
 */
export interface GroupedHostSessions {
  active: HostSessionRow[];
  ended: HostSessionRow[];
}

export function groupHostSessions(rows: HostSessionRow[]): GroupedHostSessions {
  const active: HostSessionRow[] = [];
  const ended: HostSessionRow[] = [];
  for (const row of rows) {
    if (row.status === "ended") {
      ended.push(row);
    } else {
      active.push(row);
    }
  }
  return { active, ended };
}
