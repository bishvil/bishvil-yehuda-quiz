import { AdminShell } from "@/src/components/admin/AdminShell";
import { loadAdminBrand } from "@/src/lib/admin/brand-context";
import { getAuthenticatedClaims } from "@/src/lib/auth/server-auth";
import {
  createServerSupabaseClient,
  createServiceRoleSupabaseClient,
} from "@/src/lib/supabase/server";

import { ResultsScreen } from "./results-screen";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ quizId: string; sessionId: string }>;
}

export default async function AdminResultsPage({ params }: PageProps) {
  const { quizId, sessionId } = await params;

  const serviceSupabase = await createServiceRoleSupabaseClient();
  const cookieSupabase = await createServerSupabaseClient();
  const claims = await getAuthenticatedClaims(cookieSupabase);
  const brand = await loadAdminBrand(serviceSupabase, claims?.userId);

  return (
    <AdminShell brand={brand}>
      <ResultsScreen quizId={quizId} sessionId={sessionId} />
    </AdminShell>
  );
}
