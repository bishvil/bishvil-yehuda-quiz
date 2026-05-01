import { redirect } from "next/navigation";

import { HostHomeContent } from "@/src/components/host/HostHomeContent";
import { getRoleFromClaims } from "@/src/lib/supabase/middleware";
import { createServerSupabaseClient } from "@/src/lib/supabase/server";
import { listHostSessions } from "@/src/lib/sessions/host-sessions";

export const dynamic = "force-dynamic";

/**
 * Host home — `/host` index. Middleware (see `src/lib/supabase/middleware.ts`)
 * already enforces a host-role cookie before this page renders, so a missing
 * claim here is a bug rather than a normal control-flow path. We still
 * defensively redirect to /login if the claim resolution fails so the
 * page never throws on production.
 *
 * Once auth-elevation subtask C lands, the middleware also lets admins
 * through; the empty-state CTA reads the role to decide whether to surface
 * the "ניהול חידונים" link.
 */
export default async function HostHomePage() {
  const supabase = await createServerSupabaseClient();
  const { data: claimsBody, error } = await supabase.auth.getClaims();

  if (error || !claimsBody) {
    redirect("/login");
  }

  const claims = claimsBody.claims as {
    sub?: string;
    email?: string;
  } & Record<string, unknown>;

  const userId = typeof claims.sub === "string" ? claims.sub : null;
  const email = typeof claims.email === "string" ? claims.email : "";
  const role = getRoleFromClaims(claims);

  if (!userId) {
    redirect("/login");
  }

  const sessions = await listHostSessions(supabase, userId);

  return (
    <HostHomeContent
      email={email}
      sessions={sessions}
      isAdmin={role === "admin"}
      signOutHref={null}
    />
  );
}
