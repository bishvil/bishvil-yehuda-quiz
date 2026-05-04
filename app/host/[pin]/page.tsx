import { notFound } from "next/navigation";

import { HostScreen } from "./host-screen";
import { isValidParticipantPin } from "@/src/lib/participant/pin";
import { resolveParticipantBrand } from "@/src/lib/participant/brands";
import { findAnySessionByPin } from "@/src/lib/sessions/lookup";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/server";

export const dynamic = "force-dynamic";

interface HostSessionPageProps {
  params: Promise<{ pin: string }>;
}

/**
 * Host live dashboard. Auth is enforced upstream by middleware; live data is
 * fetched client-side via /api/host/[pin]/live.
 */
export default async function HostSessionPage({ params }: HostSessionPageProps) {
  const { pin } = await params;

  if (!isValidParticipantPin(pin)) {
    notFound();
  }

  const serviceSupabase = await createServiceRoleSupabaseClient();
  const { data: session } = await findAnySessionByPin(serviceSupabase, pin);
  if (!session) {
    notFound();
  }

  const { data: quiz } = await serviceSupabase
    .from("quizzes")
    .select("brand_id, custom_logo, custom_logo_label, custom_logo_active")
    .eq("id", session.quiz_id)
    .maybeSingle();

  if (!quiz) {
    notFound();
  }

  const brand = await resolveParticipantBrand(serviceSupabase, quiz.brand_id);
  const effectiveLogo = quiz.custom_logo_active ? quiz.custom_logo : null;

  return (
    <HostScreen
      pin={pin}
      brand={brand}
      customLogo={effectiveLogo}
      customLogoLabel={effectiveLogo ? quiz.custom_logo_label : null}
    />
  );
}
