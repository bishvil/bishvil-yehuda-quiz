import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, SessionStatusEnum } from "@/src/lib/supabase/database.types";

export type ServiceSupabase = SupabaseClient<Database>;

export async function findSessionByPin(
  client: ServiceSupabase,
  pin: string,
  allowedStatuses: readonly SessionStatusEnum[],
) {
  return client
    .from("sessions")
    .select("*")
    .eq("pin", pin)
    .in("status", [...allowedStatuses])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
}

/**
 * Active session = scheduled or live. The unique partial index
 * `sessions_pin_active_idx` enforces at-most-one row in this state per PIN.
 */
export async function findActiveSessionByPin(
  client: ServiceSupabase,
  pin: string,
) {
  return findSessionByPin(client, pin, ["scheduled", "live"]);
}

/**
 * Host-controlled sessions include paused runs so resume/end/question routes
 * can return state-specific responses instead of losing the session by PIN.
 */
export async function findHostSessionByPin(
  client: ServiceSupabase,
  pin: string,
) {
  return findSessionByPin(client, pin, ["scheduled", "live", "paused"]);
}

/**
 * ADR-0007 public-API visibility policy: `paused` is a host-controlled mid-
 * session freeze. Unauthenticated PIN-only callers must treat the session as
 * if it doesn't exist while paused so cached public payloads cannot refresh
 * through the paused state. Participants still see the paused state via their
 * authenticated participant route, which uses a host-aware lookup helper.
 *
 * Allowed statuses: `scheduled` and `live` cover the active lobby/play
 * window; `ended` keeps public result/question URLs reachable. `draft` and
 * `paused` are private/host-only.
 */
export async function findPublicSessionByPin(
  client: ServiceSupabase,
  pin: string,
) {
  return findSessionByPin(client, pin, ["scheduled", "live", "ended"]);
}

/**
 * Raw latest-by-PIN lookup. Keep this out of public unauthenticated APIs; use
 * an explicit allowed-status helper so ADR-0008 cache/privacy policy is visible
 * at each boundary.
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
