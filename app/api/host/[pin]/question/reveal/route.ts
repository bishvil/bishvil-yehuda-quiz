import { type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";

import { privateNoStoreJson } from "@/src/lib/http/responses";
import { loadHostContext } from "@/src/lib/sessions/host-context";
import { canTransitionQuestion } from "@/src/lib/sessions/state-machine";
import {
  questionCacheTag,
  questionCountsCacheTag,
} from "@/src/lib/cache/tags";
import { lazyExpireSyncQuestionState } from "@/src/lib/sessions/expiry";

interface HostRevealRouteContext {
  params: Promise<{ pin: string }>;
}

interface HostRevealSuccessBody {
  sessionId: string;
  questionId: string;
  status: "revealed";
  revealedAt: string;
}

interface HostRevealErrorBody {
  error:
    | "INVALID_REQUEST"
    | "QUESTION_STATE_NOT_FOUND"
    | "INVALID_TRANSITION"
    | "ASYNC_NOT_REVEALABLE"
    | "WRITE_FAILED";
  message: string;
}

type HostRevealResponseBody = HostRevealSuccessBody | HostRevealErrorBody;

const requestSchema = z.object({
  questionId: z.string().uuid(),
});

/**
 * `locked → revealed` (sync mode only — async auto-reveals on lock per
 * ADR-0007 §2.4). The host route also lazy-expires the question if the
 * deadline has passed but the row is still `answering`.
 */
export async function POST(
  request: NextRequest,
  context: HostRevealRouteContext,
) {
  const { pin } = await context.params;
  const ctx = await loadHostContext(pin);
  if (!ctx.ok) return ctx.response;
  const { session, serviceSupabase } = ctx;

  if (session.game_mode !== "sync") {
    return privateNoStoreJson<HostRevealResponseBody>(
      {
        error: "ASYNC_NOT_REVEALABLE",
        message: "Async sessions auto-reveal on lock.",
      },
      { status: 409 },
    );
  }

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return privateNoStoreJson<HostRevealResponseBody>(
      { error: "INVALID_REQUEST", message: "questionId is required." },
      { status: 400 },
    );
  }

  await lazyExpireSyncQuestionState(serviceSupabase, session.id, parsed.data.questionId, {
    autoReveal: false,
  });

  const { data: state } = await serviceSupabase
    .from("question_session_state")
    .select("*")
    .eq("session_id", session.id)
    .eq("question_id", parsed.data.questionId)
    .maybeSingle();

  if (!state) {
    return privateNoStoreJson<HostRevealResponseBody>(
      {
        error: "QUESTION_STATE_NOT_FOUND",
        message: "Question has not been started for this session.",
      },
      { status: 404 },
    );
  }

  if (state.status === "revealed") {
    return privateNoStoreJson<HostRevealResponseBody>(
      {
        sessionId: session.id,
        questionId: state.question_id,
        status: "revealed",
        revealedAt: state.revealed_at ?? new Date().toISOString(),
      },
      { status: 200 },
    );
  }

  if (!canTransitionQuestion(state.status, "revealed")) {
    return privateNoStoreJson<HostRevealResponseBody>(
      {
        error: "INVALID_TRANSITION",
        message: `Cannot reveal from status ${state.status}.`,
      },
      { status: 409 },
    );
  }

  const revealedAt = new Date().toISOString();

  const { data: updated, error } = await serviceSupabase
    .from("question_session_state")
    .update({ status: "revealed", revealed_at: revealedAt })
    .eq("session_id", session.id)
    .eq("question_id", state.question_id)
    .eq("status", "locked")
    .select("session_id, question_id, status, revealed_at")
    .maybeSingle();

  if (error || !updated) {
    return privateNoStoreJson<HostRevealResponseBody>(
      { error: "WRITE_FAILED", message: "Could not reveal question." },
      { status: 500 },
    );
  }

  revalidateTag(questionCacheTag(session.id, state.question_id), "default");
  revalidateTag(questionCountsCacheTag(session.id, state.question_id), "default");

  return privateNoStoreJson<HostRevealResponseBody>(
    {
      sessionId: updated.session_id,
      questionId: updated.question_id,
      status: "revealed",
      revealedAt: updated.revealed_at ?? revealedAt,
    },
    { status: 200 },
  );
}
