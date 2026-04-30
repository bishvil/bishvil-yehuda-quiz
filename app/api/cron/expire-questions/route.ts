import { type NextRequest } from "next/server";

import { requireCronAuth } from "@/src/lib/auth/server-auth";
import { questionCacheTag, safeRevalidateTag } from "@/src/lib/cache/tags";
import { noStoreJson } from "@/src/lib/http/responses";
import { writeLog } from "@/src/lib/logging";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/server";

interface ExpireQuestionsBody {
  scanned: number;
  syncLocked: number;
  syncRevealed: number;
  asyncRevealed: number;
}

/**
 * Vercel cron at `* * * * *`. Locks all `answering` rows whose
 * `deadline_at` has passed. Sync mode goes to `locked` (host must reveal);
 * async mode (or sessions with auto_reveal=true) goes to `revealed` and
 * sets `revealed_at` per ADR-0007 §2.4. Cron is a freshness optimizer
 * (ADR-0004 §4.3) — lazy expiry inside route handlers will self-heal any
 * row this misses.
 *
 * Scheduled config will live in vercel.json/vercel.ts as
 * `{ path: '/api/cron/expire-questions', schedule: '* * * * *' }`.
 */
export async function POST(request: NextRequest) {
  const auth = requireCronAuth(request);
  if (!auth.ok) return auth.response;

  const serviceSupabase = await createServiceRoleSupabaseClient();
  const nowIso = new Date().toISOString();

  // 1. Sync mode: question_session_state. Auto-reveal flag on the session
  // determines whether the row goes to `locked` or straight to `revealed`.
  const { data: expiredSyncRows } = await serviceSupabase
    .from("question_session_state")
    .select("session_id, question_id, deadline_at, status")
    .eq("status", "answering")
    .lt("deadline_at", nowIso);

  let syncLocked = 0;
  let syncRevealed = 0;
  const tagsToInvalidate = new Set<string>();

  if (expiredSyncRows && expiredSyncRows.length > 0) {
    const sessionIds = Array.from(
      new Set(expiredSyncRows.map((row) => row.session_id)),
    );

    const { data: sessionRows } = await serviceSupabase
      .from("sessions")
      .select("id, auto_reveal")
      .in("id", sessionIds);

    const autoRevealById = new Map(
      (sessionRows ?? []).map((row) => [row.id, row.auto_reveal]),
    );

    for (const row of expiredSyncRows) {
      const autoReveal = autoRevealById.get(row.session_id) ?? false;
      const targetStatus = autoReveal ? "revealed" : "locked";

      const updateBody = autoReveal
        ? { status: targetStatus as "revealed", revealed_at: nowIso }
        : { status: targetStatus as "locked" };

      const { data: updated } = await serviceSupabase
        .from("question_session_state")
        .update(updateBody)
        .eq("session_id", row.session_id)
        .eq("question_id", row.question_id)
        .eq("status", "answering")
        .select("session_id, question_id");

      if (updated && updated.length > 0) {
        if (autoReveal) {
          syncRevealed += 1;
        } else {
          syncLocked += 1;
        }
        tagsToInvalidate.add(
          questionCacheTag(row.session_id, row.question_id),
        );
      }
    }
  }

  // 2. Async mode: participant_question_progress. Always auto-reveals.
  const { data: expiredAsyncRows } = await serviceSupabase
    .from("participant_question_progress")
    .select("session_id, participant_id, question_id, deadline_at")
    .eq("status", "answering")
    .lt("deadline_at", nowIso);

  let asyncRevealed = 0;

  if (expiredAsyncRows && expiredAsyncRows.length > 0) {
    for (const row of expiredAsyncRows) {
      const { data: updated } = await serviceSupabase
        .from("participant_question_progress")
        .update({ status: "revealed", revealed_at: nowIso })
        .eq("session_id", row.session_id)
        .eq("participant_id", row.participant_id)
        .eq("question_id", row.question_id)
        .eq("status", "answering")
        .select("session_id, question_id");

      if (updated && updated.length > 0) {
        asyncRevealed += 1;
        tagsToInvalidate.add(
          questionCacheTag(row.session_id, row.question_id),
        );
      }
    }
  }

  for (const tag of tagsToInvalidate) {
    safeRevalidateTag(tag);
  }

  const summary: ExpireQuestionsBody = {
    scanned: (expiredSyncRows?.length ?? 0) + (expiredAsyncRows?.length ?? 0),
    syncLocked,
    syncRevealed,
    asyncRevealed,
  };

  writeLog({
    level: "info",
    message: "expire-questions cron run",
    context: {
      scanned: summary.scanned,
      syncLocked,
      syncRevealed,
      asyncRevealed,
    },
  });

  return noStoreJson<ExpireQuestionsBody>(summary, { status: 200 });
}
