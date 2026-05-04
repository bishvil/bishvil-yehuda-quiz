import { AdminShell } from "@/src/components/admin/AdminShell";
import { loadAdminBrand } from "@/src/lib/admin/brand-context";
import { getAuthenticatedClaims } from "@/src/lib/auth/server-auth";
import {
  createServerSupabaseClient,
  createServiceRoleSupabaseClient,
} from "@/src/lib/supabase/server";

import { TeamSettingsScreen } from "./team-settings-screen";

export const dynamic = "force-dynamic";

export default async function AdminTeamSettingsPage() {
  const serviceSupabase = await createServiceRoleSupabaseClient();
  const cookieSupabase = await createServerSupabaseClient();
  const claims = await getAuthenticatedClaims(cookieSupabase);
  const brand = await loadAdminBrand(serviceSupabase, claims?.userId);

  return (
    <AdminShell brand={brand}>
      <TeamSettingsScreen />
    </AdminShell>
  );
}
