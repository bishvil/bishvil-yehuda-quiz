import { AdminShell } from "@/src/components/admin/AdminShell";
import {
  loadAdminBrands,
  resolveParticipantBrand,
} from "@/src/lib/participant/brands";
import { getAuthenticatedClaims } from "@/src/lib/auth/server-auth";
import {
  createServerSupabaseClient,
  createServiceRoleSupabaseClient,
} from "@/src/lib/supabase/server";

import { BrandsScreen } from "./brands-screen";

export const dynamic = "force-dynamic";

export default async function AdminBrandsSettingsPage() {
  const serviceSupabase = await createServiceRoleSupabaseClient();
  const cookieSupabase = await createServerSupabaseClient();

  const [adminBrands, claims] = await Promise.all([
    loadAdminBrands(serviceSupabase),
    getAuthenticatedClaims(cookieSupabase),
  ]);

  let currentUserBrand: string | null = null;
  if (claims?.userId) {
    const { data } = await serviceSupabase.auth.admin.getUserById(claims.userId);
    currentUserBrand =
      (data?.user?.app_metadata as { brand?: string } | null)?.brand ?? null;
  }

  const shellBrand = await resolveParticipantBrand(serviceSupabase, currentUserBrand);

  return (
    <AdminShell brand={shellBrand}>
      <BrandsScreen
        adminBrands={adminBrands}
        currentUserBrand={currentUserBrand}
      />
    </AdminShell>
  );
}
