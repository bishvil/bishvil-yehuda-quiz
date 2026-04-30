import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/src/lib/supabase/database.types";

export type ServiceSupabase = SupabaseClient<Database>;

/**
 * Active session = scheduled or live. The unique partial index
 * `sessions_pin_active_idx` enforces at-most-one row in this state per PIN.
 */
export async function findActiveSessionByPin(
  client: ServiceSupabase,
  pin: string,
) {
  return client
    .from("sessions")
    .select("*")
    .eq("pin", pin)
    .in("status", ["scheduled", "live"])
    .maybeSingle();
}

/**
 * Used by public routes (info, question, counts) which must also serve a
 * session that has already ended so historical results stay reachable.
 */
export async function findAnySessionByPin(
  client: ServiceSupabase,
  pin: string,
) {
  return client
    .from("sessions")
    .select("*")
    .eq("pin", pin)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
}
