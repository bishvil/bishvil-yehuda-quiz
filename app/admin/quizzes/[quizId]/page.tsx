import { AdminShell } from "@/src/components/admin/AdminShell";
import { loadAdminBrand } from "@/src/lib/admin/brand-context";
import { loadBrands } from "@/src/lib/participant/brands";
import { getAuthenticatedClaims } from "@/src/lib/auth/server-auth";
import {
  createServerSupabaseClient,
  createServiceRoleSupabaseClient,
} from "@/src/lib/supabase/server";

import { QuizEditorScreen } from "./quiz-editor-screen";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ quizId: string }>;
}

export default async function AdminQuizEditorPage({ params }: PageProps) {
  const { quizId } = await params;

  const serviceSupabase = await createServiceRoleSupabaseClient();
  const [brands, cookieSupabase] = await Promise.all([
    loadBrands(serviceSupabase),
    createServerSupabaseClient(),
  ]);

  const claims = await getAuthenticatedClaims(cookieSupabase);
  const brand = await loadAdminBrand(serviceSupabase, claims?.userId);

  return (
    <AdminShell brand={brand}>
      <QuizEditorScreen quizId={quizId} brands={brands} />
    </AdminShell>
  );
}
