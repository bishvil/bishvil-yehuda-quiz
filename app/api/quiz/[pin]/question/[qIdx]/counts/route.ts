import { type NextRequest } from "next/server";

import {
  PRIVATE_NO_STORE_HEADER,
  PUBLIC_POST_REVEAL_COUNTS_CACHE_HEADER,
} from "@/src/lib/constants";
import { publicCachedJson, privateNoStoreJson } from "@/src/lib/http/responses";
import { findPublicSessionByPin } from "@/src/lib/sessions/lookup";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/server";

interface PublicCountsRouteContext {
  params: Promise<{ pin: string; qIdx: string }>;
}

interface PublicCountsSuccessBody {
  questionIndex: number;
  answerCounts: Record<string, number>;
  correctIds: string[] | null;
  totalResponses: number;
}

interface PublicCountsErrorBody {
  error:
    | "SESSION_NOT_FOUND"
    | "QUESTION_NOT_FOUND"
    | "INVALID_INDEX"
    | "NOT_REVEALED";
  message: string;
}

type PublicCountsResponseBody = PublicCountsSuccessBody | PublicCountsErrorBody;

/**
 * ADR-0008 §4: pre-reveal answer counts are host-only. This endpoint is only
 * cacheable post-reveal — before that, it returns 409 with `private,no-store`.
 */
export async function GET(
  _request: NextRequest,
  context: PublicCountsRouteContext,
) {
  const { pin, qIdx } = await context.params;
  const ordinal = Number.parseInt(qIdx, 10);

  if (!Number.isFinite(ordinal) || ordinal < 1) {
    return privateNoStoreJson<PublicCountsResponseBody>(
      { error: "INVALID_INDEX", message: "Question index must be a positive integer." },
      { status: 400 },
    );
  }

  const serviceSupabase = await createServiceRoleSupabaseClient();
  const { data: session } = await findPublicSessionByPin(serviceSupabase, pin);

  if (!session) {
    return privateNoStoreJson<PublicCountsResponseBody>(
      { error: "SESSION_NOT_FOUND", message: "No session exists for this PIN." },
      { status: 404 },
    );
  }

  const { data: question } = await serviceSupabase
    .from("questions")
    .select("id, correct_ids")
    .eq("quiz_id", session.quiz_id)
    .eq("ordinal", ordinal)
    .maybeSingle();

  if (!question) {
    return privateNoStoreJson<PublicCountsResponseBody>(
      { error: "QUESTION_NOT_FOUND", message: "Question not found." },
      { status: 404 },
    );
  }

  // Counts are public only once the question is `revealed` for everyone.
  // Sync mode: state row is shared. Async mode: per-participant — public
  // counts only become safe after the session has ended.
  let isPublic = false;

  if (session.game_mode === "sync") {
    const { data: state } = await serviceSupabase
      .from("question_session_state")
      .select("status")
      .eq("session_id", session.id)
      .eq("question_id", question.id)
      .maybeSingle();
    isPublic = state?.status === "revealed";
  } else if (session.status === "ended") {
    isPublic = true;
  }

  if (!isPublic) {
    return new Response(
      JSON.stringify({
        error: "NOT_REVEALED",
        message: "Answer counts are not yet public for this question.",
      } satisfies PublicCountsErrorBody),
      {
        status: 409,
        headers: {
          "Cache-Control": PRIVATE_NO_STORE_HEADER,
          "content-type": "application/json",
        },
      },
    );
  }

  const { data: answerRows } = await serviceSupabase
    .from("answers")
    .select("selected_ids")
    .eq("session_id", session.id)
    .eq("question_id", question.id);

  const counts: Record<string, number> = {};
  let totalResponses = 0;

  if (answerRows) {
    for (const row of answerRows) {
      totalResponses += 1;
      const selected = row.selected_ids ?? [];
      for (const id of selected) {
        counts[id] = (counts[id] ?? 0) + 1;
      }
    }
  }

  return publicCachedJson<PublicCountsResponseBody>(
    {
      questionIndex: ordinal,
      answerCounts: counts,
      correctIds: question.correct_ids,
      totalResponses,
    },
    { cacheControl: PUBLIC_POST_REVEAL_COUNTS_CACHE_HEADER },
  );
}
