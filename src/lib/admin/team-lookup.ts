import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/src/lib/supabase/database.types";

export type TeamRole = "admin" | "host";

export interface TeamUserRecord {
  id: string;
  email: string;
  role: TeamRole;
}

/**
 * Supabase auth has no relational join with the public schema, so admin/host
 * users have to be pulled via the auth admin API rather than a Postgres join
 * when enriching session rows or validating a `hostUserId`.
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
