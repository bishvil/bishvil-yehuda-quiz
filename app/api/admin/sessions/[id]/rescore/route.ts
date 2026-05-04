import { type NextRequest } from "next/server";

import { requireRole } from "@/src/lib/auth/server-auth";
import { privateNoStoreJson } from "@/src/lib/http/responses";
import { writeLog } from "@/src/lib/logging";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/server";

/**
 * POST /api/admin/sessions/[id]/rescore — admin recompute path per
 * ADR-0006 "Update 2026-05-04". The RPC itself locks the session
 * `FOR UPDATE` and raises `session_not_found` (SQLSTATE P0002) for an
 * unknown id, so we skip a separate pre-flight lookup.
 */
interface AdminSessionRescoreResponse {
  rescoredCount: number;
  totalScoreDelta: number;
  participantsTouched: number;
}

interface AdminSessionRescoreErrorBody {
  error: "NOT_FOUND" | "WRITE_FAILED";
  message: string;
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const supabase = await createServiceRoleSupabaseClient();

  const { data, error: rpcError } = await supabase
    .rpc("rescore_session", { p_session_id: id })
    .single();

  if (rpcError) {
    if (rpcError.message?.includes("session_not_found")) {
      return privateNoStoreJson<AdminSessionRescoreErrorBody>(
        { error: "NOT_FOUND", message: "Session not found." },
        { status: 404 },
      );
    }
    writeLog({
      level: "error",
      message: "rescore_session RPC failed",
      context: { sessionId: id, error: rpcError.message },
    });
    return privateNoStoreJson<AdminSessionRescoreErrorBody>(
      { error: "WRITE_FAILED", message: "Rescore failed." },
      { status: 500 },
    );
  }

  // The RPC's RETURNS TABLE columns are non-null (they come from
  // greatest()/coalesce() aggregates), but the generated types are
  // `number | null` because Postgres lets any function column be null.
  // Treat null as a server-side contract break.
  if (
    !data ||
    data.answers_rescored == null ||
    data.total_score_delta == null ||
    data.participants_touched == null
  ) {
    writeLog({
      level: "error",
      message: "rescore_session RPC returned incomplete row",
      context: { sessionId: id },
    });
    return privateNoStoreJson<AdminSessionRescoreErrorBody>(
      { error: "WRITE_FAILED", message: "Rescore failed." },
      { status: 500 },
    );
  }

  return privateNoStoreJson<AdminSessionRescoreResponse>({
    rescoredCount: data.answers_rescored,
    totalScoreDelta: data.total_score_delta,
    participantsTouched: data.participants_touched,
  });
}
