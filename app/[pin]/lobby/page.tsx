import { notFound } from "next/navigation";

import { LobbyScreen } from "./lobby-screen";
import { findAnySessionByPin } from "@/src/lib/sessions/lookup";
import { resolveParticipantBrand } from "@/src/lib/participant/brands";
import { isValidParticipantPin } from "@/src/lib/participant/pin";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/server";

export const dynamic = "force-dynamic";

interface LobbyPageProps {
  params: Promise<{ pin: string }>;
}

export default async function ParticipantLobbyPage({ params }: LobbyPageProps) {
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
    .select("title, brand_id, custom_logo, custom_logo_label, custom_logo_active")
    .eq("id", session.quiz_id)
    .maybeSingle();

  if (!quiz) {
    notFound();
  }

  const { count: questionCount } = await serviceSupabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("quiz_id", session.quiz_id);

  const brand = await resolveParticipantBrand(serviceSupabase, quiz.brand_id);
  const effectiveLogo = quiz.custom_logo_active ? quiz.custom_logo : null;

  return (
    <LobbyScreen
      pin={pin}
      brand={brand}
      quizTitle={quiz.title}
      customLogo={effectiveLogo}
      customLogoLabel={effectiveLogo ? quiz.custom_logo_label : null}
      questionCount={questionCount ?? 0}
      gameMode={session.game_mode}
    />
  );
}
