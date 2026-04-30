import { notFound } from "next/navigation";

import { PlayScreen } from "./play-screen";
import { findAnySessionByPin } from "@/src/lib/sessions/lookup";
import { resolveParticipantBrand } from "@/src/lib/participant/brands";
import { isValidParticipantPin } from "@/src/lib/participant/pin";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/server";

export const dynamic = "force-dynamic";

interface PlayPageProps {
  params: Promise<{ pin: string }>;
}

export default async function ParticipantPlayPage({ params }: PlayPageProps) {
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
    .select("title, brand_id, custom_logo, custom_logo_label")
    .eq("id", session.quiz_id)
    .maybeSingle();

  if (!quiz) {
    notFound();
  }

  const brand = resolveParticipantBrand(quiz.brand_id);

  return (
    <PlayScreen
      pin={pin}
      brand={brand}
      customLogo={quiz.custom_logo}
      customLogoLabel={quiz.custom_logo_label}
      gameMode={session.game_mode}
    />
  );
}
