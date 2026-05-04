import { AdminShell } from "@/src/components/admin/AdminShell";
import { loadAdminBrand } from "@/src/lib/admin/brand-context";
import {
  loadBrands,
  SYSTEM_DEFAULT_BRAND_SLUG,
} from "@/src/lib/participant/brands";
import { getAuthenticatedClaims } from "@/src/lib/auth/server-auth";
import {
  createServerSupabaseClient,
  createServiceRoleSupabaseClient,
} from "@/src/lib/supabase/server";

import { QuizListScreen } from "./quiz-list-screen";

export const dynamic = "force-dynamic";

export default async function AdminQuizzesPage() {
  const serviceSupabase = await createServiceRoleSupabaseClient();
  const [brands, cookieSupabase] = await Promise.all([
    loadBrands(serviceSupabase),
    createServerSupabaseClient(),
  ]);

  const claims = await getAuthenticatedClaims(cookieSupabase);
  const brand = await loadAdminBrand(serviceSupabase, claims?.userId);

  // The admin's chosen default brand is the same one shown in the sidebar
  // (loadAdminBrand resolves it from app_metadata.brand). New quizzes inherit
  // it; admins can override per-quiz in the editor.
  const defaultBrandId =
    brands.find((b) => b.id === brand.id)?.id ??
    brands.find((b) => b.id === SYSTEM_DEFAULT_BRAND_SLUG)?.id ??
    brands[0]?.id ??
    SYSTEM_DEFAULT_BRAND_SLUG;

  return (
    <AdminShell brand={brand}>
      <QuizListScreen brands={brands} defaultBrandId={defaultBrandId} />
    </AdminShell>
  );
}
