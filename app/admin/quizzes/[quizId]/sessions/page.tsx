import { AdminShell } from "@/src/components/admin/AdminShell";
import { loadAdminBrand } from "@/src/lib/admin/brand-context";
import { getAuthenticatedClaims } from "@/src/lib/auth/server-auth";
import {
  createServerSupabaseClient,
  createServiceRoleSupabaseClient,
} from "@/src/lib/supabase/server";

import { SessionsScreen } from "./sessions-screen";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ quizId: string }>;
}

export default async function AdminQuizSessionsPage({ params }: PageProps) {
  const { quizId } = await params;

  const serviceSupabase = await createServiceRoleSupabaseClient();
  const cookieSupabase = await createServerSupabaseClient();
  const claims = await getAuthenticatedClaims(cookieSupabase);
  const brand = await loadAdminBrand(serviceSupabase, claims?.userId);

  return (
    <AdminShell brand={brand}>
      <SessionsScreen quizId={quizId} />
    </AdminShell>
  );
}
