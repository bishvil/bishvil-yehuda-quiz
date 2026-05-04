import { AdminShell } from "@/src/components/admin/AdminShell";
import { loadAdminBrand } from "@/src/lib/admin/brand-context";
import { getAuthenticatedClaims } from "@/src/lib/auth/server-auth";
import {
  createServerSupabaseClient,
  createServiceRoleSupabaseClient,
} from "@/src/lib/supabase/server";

import { ResultsListScreen } from "./results-list-screen";

export const dynamic = "force-dynamic";

export default async function AdminResultsPage() {
  const serviceSupabase = await createServiceRoleSupabaseClient();
  const cookieSupabase = await createServerSupabaseClient();
  const claims = await getAuthenticatedClaims(cookieSupabase);
  const brand = await loadAdminBrand(serviceSupabase, claims?.userId);

  return (
    <AdminShell brand={brand}>
      <ResultsListScreen />
    </AdminShell>
  );
}
