import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/src/lib/supabase/database.types";

export type TeamRole = "admin" | "host";

export interface TeamUserRecord {
  id: string;
  email: string;
  role: TeamRole;
}

/**
 * QA-26: shared resolver for admin/host users keyed by id. Used to enrich
 * session rows with host email and to validate `hostUserId` on create/PATCH.
 * Supabase auth has no relational join with the public schema, so we must
 * always pull users via the auth admin API.
 */
export async function fetchTeamUsers(
  supabase: SupabaseClient<Database>,
): Promise<TeamUserRecord[]> {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (error || !data) return [];
  return data.users
    .map<TeamUserRecord | null>((u) => {
      const role = (u.app_metadata as { role?: string } | null)?.role;
      if (role !== "admin" && role !== "host") return null;
      return { id: u.id, email: u.email ?? "", role };
    })
    .filter((row): row is TeamUserRecord => row !== null);
}

export function buildTeamUserMap(
  users: TeamUserRecord[],
): Map<string, TeamUserRecord> {
  return new Map(users.map((u) => [u.id, u]));
}
