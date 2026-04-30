import { type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";

import { privateNoStoreJson } from "@/src/lib/http/responses";
import { loadHostContext } from "@/src/lib/sessions/host-context";
import { sessionCacheTag } from "@/src/lib/cache/tags";

interface HostQuestionNextRouteContext {
  params: Promise<{ pin: string }>;
}

interface HostQuestionNextSuccessBody {
  sessionId: string;
  nextQuestionId: string | null;
  nextQuestionIndex: number | null;
  status: "advanced" | "all_revealed";
}

interface HostQuestionNextErrorBody {
  error: "SESSION_NOT_LIVE" | "WRITE_FAILED";
  message: string;
}

type HostQuestionNextResponseBody =
  | HostQuestionNextSuccessBody
  | HostQuestionNextErrorBody;

/**
 * Advances `session.current_question_id` to the next question by ordinal
 * (ADR-0005 §3.4). Returns `all_revealed` if no more questions exist —
 * the host should then call /end to terminate the session.
 */
export async function POST(
  _request: NextRequest,
  context: HostQuestionNextRouteContext,
) {
  const { pin } = await context.params;
  const ctx = await loadHostContext(pin);
  if (!ctx.ok) return ctx.response;
  const { session, serviceSupabase } = ctx;

  if (session.status !== "live" && session.status !== "paused") {
    return privateNoStoreJson<HostQuestionNextResponseBody>(
      {
        error: "SESSION_NOT_LIVE",
        message: `Session status is ${session.status}.`,
      },
      { status: 409 },
    );
  }

  const { data: currentQuestion } = session.current_question_id
    ? await serviceSupabase
        .from("questions")
        .select("ordinal")
        .eq("id", session.current_question_id)
        .maybeSingle()
    : { data: null };

  const currentOrdinal = currentQuestion?.ordinal ?? 0;

  const { data: nextQuestion } = await serviceSupabase
    .from("questions")
    .select("id, ordinal")
    .eq("quiz_id", session.quiz_id)
    .gt("ordinal", currentOrdinal)
    .order("ordinal", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!nextQuestion) {
    return privateNoStoreJson<HostQuestionNextResponseBody>(
      {
        sessionId: session.id,
        nextQuestionId: null,
        nextQuestionIndex: null,
        status: "all_revealed",
      },
      { status: 200 },
    );
  }

  const { error } = await serviceSupabase
    .from("sessions")
    .update({
      current_question_id: nextQuestion.id,
      host_last_seen_at: new Date().toISOString(),
    })
    .eq("id", session.id);

  if (error) {
    return privateNoStoreJson<HostQuestionNextResponseBody>(
      { error: "WRITE_FAILED", message: "Could not advance question." },
      { status: 500 },
    );
  }

  revalidateTag(sessionCacheTag(session.id), "default");

  return privateNoStoreJson<HostQuestionNextResponseBody>(
    {
      sessionId: session.id,
      nextQuestionId: nextQuestion.id,
      nextQuestionIndex: nextQuestion.ordinal,
      status: "advanced",
    },
    { status: 200 },
  );
}
