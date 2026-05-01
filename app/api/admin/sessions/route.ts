import { type NextRequest } from "next/server";

import { generateRandomPin } from "@/src/lib/admin/pin";
import { adminSessionCreateSchema } from "@/src/lib/admin/validation";
import { requireRole } from "@/src/lib/auth/server-auth";
import { privateNoStoreJson } from "@/src/lib/http/responses";
import { writeLog } from "@/src/lib/logging";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/server";
import type { Database } from "@/src/lib/supabase/database.types";

const POSTGRES_UNIQUE_VIOLATION_CODE = "23505";
const PIN_GENERATION_RETRIES = 6;

interface AdminSessionListRow {
  id: string;
  pin: string;
  quizId: string;
  status: Database["public"]["Tables"]["sessions"]["Row"]["status"];
  gameMode: "sync" | "async";
  autoReveal: boolean;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
}

interface AdminSessionListBody {
  sessions: AdminSessionListRow[];
}

interface AdminSessionCreateBody {
  session: {
    id: string;
    pin: string;
    quizId: string;
    status: "scheduled";
    gameMode: "sync" | "async";
    autoReveal: boolean;
    endedAt: string | null;
    createdAt: string;
  };
}

interface AdminSessionErrorBody {
  error:
    | "INVALID_REQUEST"
    | "QUIZ_NOT_FOUND"
    | "QUIZ_HAS_NO_QUESTIONS"
    | "PIN_GENERATION_FAILED"
    | "WRITE_FAILED";
  message: string;
}

export async function GET(request: NextRequest) {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  const quizId = request.nextUrl.searchParams.get("quizId");
  const serviceSupabase = await createServiceRoleSupabaseClient();

  let query = serviceSupabase
    .from("sessions")
    .select(
      "id, pin, quiz_id, status, game_mode, auto_reveal, started_at, ended_at, created_at",
    )
    .order("created_at", { ascending: false });

  if (quizId) {
    query = query.eq("quiz_id", quizId);
  }

  const { data, error } = await query;

  if (error) {
    return privateNoStoreJson<AdminSessionErrorBody>(
      { error: "WRITE_FAILED", message: "Failed to list sessions." },
      { status: 500 },
    );
  }

  const sessions: AdminSessionListRow[] = (data ?? []).map((row) => ({
    id: row.id,
    pin: row.pin,
    quizId: row.quiz_id,
    status: row.status,
    gameMode: row.game_mode,
    autoReveal: row.auto_reveal,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    createdAt: row.created_at,
  }));

  return privateNoStoreJson<AdminSessionListBody>({ sessions });
}

/**
 * Creates a new session from a quiz. Inherits `game_mode` from the quiz at
 * creation time per ADR-0004 (mode is stable across the run). Generates a
 * unique 6-digit PIN per ADR-0004 §"PIN Format and Uniqueness". Async mode
 * sets `auto_reveal=true` per ADR-0007 §2.4.
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  const parsed = adminSessionCreateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return privateNoStoreJson<AdminSessionErrorBody>(
      { error: "INVALID_REQUEST", message: "Session body invalid." },
      { status: 400 },
    );
  }

  const serviceSupabase = await createServiceRoleSupabaseClient();
  const { data: quiz } = await serviceSupabase
    .from("quizzes")
    .select("id, default_game_mode, archived_at")
    .eq("id", parsed.data.quizId)
    .maybeSingle();

  if (!quiz) {
    return privateNoStoreJson<AdminSessionErrorBody>(
      { error: "QUIZ_NOT_FOUND", message: "Quiz not found." },
      { status: 404 },
    );
  }

  if (quiz.archived_at !== null) {
    return privateNoStoreJson<AdminSessionErrorBody>(
      { error: "QUIZ_NOT_FOUND", message: "Quiz is archived." },
      { status: 404 },
    );
  }

  // ADR-0004 §"Allowed transitions" requires `draft → scheduled` to have at
  // least one authored question. Wave-2 review M2 — the editor blocks empty
  // launch but the sessions page did not, so guard at the API too.
  const { count: questionCount, error: questionCountError } = await serviceSupabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("quiz_id", quiz.id);

  if (questionCountError) {
    writeLog({
      level: "error",
      message: "Question count lookup failed",
      context: { error: questionCountError.message },
    });
    return privateNoStoreJson<AdminSessionErrorBody>(
      { error: "WRITE_FAILED", message: "Could not verify quiz contents." },
      { status: 500 },
    );
  }

  if ((questionCount ?? 0) === 0) {
    return privateNoStoreJson<AdminSessionErrorBody>(
      {
        error: "QUIZ_HAS_NO_QUESTIONS",
        message: "Add at least one question before launching a session.",
      },
      { status: 400 },
    );
  }

  const gameMode = quiz.default_game_mode;
  const autoReveal = gameMode === "async";

  for (let attempt = 0; attempt < PIN_GENERATION_RETRIES; attempt += 1) {
    const pin = generateRandomPin();
    const insert: Database["public"]["Tables"]["sessions"]["Insert"] = {
      quiz_id: quiz.id,
      host_id: parsed.data.hostUserId ?? null,
      pin,
      status: "scheduled",
      game_mode: gameMode,
      auto_reveal: autoReveal,
      ended_at: parsed.data.endedAt ?? null,
    };

    const { data, error } = await serviceSupabase
      .from("sessions")
      .insert(insert)
      .select(
        "id, pin, quiz_id, status, game_mode, auto_reveal, ended_at, created_at",
      )
      .single();

    if (!error && data) {
      return privateNoStoreJson<AdminSessionCreateBody>(
        {
          session: {
            id: data.id,
            pin: data.pin,
            quizId: data.quiz_id,
            status: "scheduled",
            gameMode: data.game_mode,
            autoReveal: data.auto_reveal,
            endedAt: data.ended_at,
            createdAt: data.created_at,
          },
        },
        { status: 201 },
      );
    }

    // Retry on PIN collision against the active partial unique index.
    if (error?.code !== POSTGRES_UNIQUE_VIOLATION_CODE) {
      writeLog({
        level: "error",
        message: "Session insert failed",
        context: { error: error?.message ?? "unknown" },
      });
      return privateNoStoreJson<AdminSessionErrorBody>(
        { error: "WRITE_FAILED", message: "Could not create session." },
        { status: 500 },
      );
    }
  }

  return privateNoStoreJson<AdminSessionErrorBody>(
    {
      error: "PIN_GENERATION_FAILED",
      message: "Could not allocate a unique PIN — too many active sessions.",
    },
    { status: 503 },
  );
}
