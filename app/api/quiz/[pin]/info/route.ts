import { type NextRequest } from "next/server";

import { PUBLIC_QUIZ_INFO_CACHE_HEADER } from "@/src/lib/constants";
import { publicCachedJson } from "@/src/lib/http/responses";
import { findPublicSessionByPin } from "@/src/lib/sessions/lookup";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/server";

interface QuizInfoRouteContext {
  params: Promise<{ pin: string }>;
}

interface QuizInfoSuccessBody {
  pin: string;
  status: "scheduled" | "live" | "paused" | "ended";
  gameMode: "sync" | "async";
  quizTitle: string;
  brandId: string;
  customLogo: string | null;
  customLogoLabel: string | null;
  questionCount: number;
}

interface QuizInfoErrorBody {
  error: "SESSION_NOT_FOUND";
  message: string;
}

type QuizInfoResponseBody = QuizInfoSuccessBody | QuizInfoErrorBody;

export async function GET(
  _request: NextRequest,
  context: QuizInfoRouteContext,
) {
  const { pin } = await context.params;
  const serviceSupabase = await createServiceRoleSupabaseClient();

  const { data: session } = await findPublicSessionByPin(serviceSupabase, pin);

  if (!session) {
    return publicCachedJson<QuizInfoResponseBody>(
      {
        error: "SESSION_NOT_FOUND",
        message: "No session exists for this PIN.",
      },
      { status: 404, cacheControl: PUBLIC_QUIZ_INFO_CACHE_HEADER },
    );
  }

  if (session.status === "draft") {
    return publicCachedJson<QuizInfoResponseBody>(
      {
        error: "SESSION_NOT_FOUND",
        message: "No session exists for this PIN.",
      },
      { status: 404, cacheControl: PUBLIC_QUIZ_INFO_CACHE_HEADER },
    );
  }

  const { data: quiz } = await serviceSupabase
    .from("quizzes")
    .select("title, brand_id, custom_logo, custom_logo_label")
    .eq("id", session.quiz_id)
    .maybeSingle();

  if (!quiz) {
    return publicCachedJson<QuizInfoResponseBody>(
      {
        error: "SESSION_NOT_FOUND",
        message: "Session quiz is missing.",
      },
      { status: 404, cacheControl: PUBLIC_QUIZ_INFO_CACHE_HEADER },
    );
  }

  const { count } = await serviceSupabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("quiz_id", session.quiz_id);

  return publicCachedJson<QuizInfoResponseBody>(
    {
      pin: session.pin,
      status: session.status,
      gameMode: session.game_mode,
      quizTitle: quiz.title,
      brandId: quiz.brand_id,
      customLogo: quiz.custom_logo,
      customLogoLabel: quiz.custom_logo_label,
      questionCount: count ?? 0,
    },
    { cacheControl: PUBLIC_QUIZ_INFO_CACHE_HEADER },
  );
}
