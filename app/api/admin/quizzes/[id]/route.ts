import { type NextRequest } from "next/server";

import { requireRole } from "@/src/lib/auth/server-auth";
import { adminQuizUpdateSchema } from "@/src/lib/admin/validation";
import { privateNoStoreJson } from "@/src/lib/http/responses";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/server";
import type { Database } from "@/src/lib/supabase/database.types";

interface AdminQuizRouteContext {
  params: Promise<{ id: string }>;
}

interface AdminQuizDetailBody {
  quiz: {
    id: string;
    title: string;
    brandId: string;
    defaultGameMode: "sync" | "async";
    customLogo: string | null;
    customLogoLabel: string | null;
    joinFields: string[];
    archivedAt: string | null;
    createdAt: string;
  };
}

interface AdminQuizErrorBody {
  error:
    | "INVALID_REQUEST"
    | "QUIZ_NOT_FOUND"
    | "WRITE_FAILED"
    | "NOT_ARCHIVED"
    | "HAS_SESSIONS";
  message: string;
  sessionCount?: number;
}

interface AdminQuizDeleteBody {
  status: "archived";
  archivedAt: string;
}

interface AdminQuizHardDeleteBody {
  status: "deleted";
  id: string;
}

export async function GET(
  _request: NextRequest,
  context: AdminQuizRouteContext,
) {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const serviceSupabase = await createServiceRoleSupabaseClient();
  const { data, error } = await serviceSupabase
    .from("quizzes")
    .select(
      "id, title, brand_id, default_game_mode, custom_logo, custom_logo_label, join_fields, archived_at, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return privateNoStoreJson<AdminQuizErrorBody>(
      { error: "WRITE_FAILED", message: "Quiz lookup failed." },
      { status: 500 },
    );
  }

  if (!data) {
    return privateNoStoreJson<AdminQuizErrorBody>(
      { error: "QUIZ_NOT_FOUND", message: "Quiz not found." },
      { status: 404 },
    );
  }

  return privateNoStoreJson<AdminQuizDetailBody>({
    quiz: {
      id: data.id,
      title: data.title,
      brandId: data.brand_id,
      defaultGameMode: data.default_game_mode,
      customLogo: data.custom_logo,
      customLogoLabel: data.custom_logo_label,
      joinFields: normalizeJoinFields(data.join_fields),
      archivedAt: data.archived_at,
      createdAt: data.created_at,
    },
  });
}

export async function PUT(
  request: NextRequest,
  context: AdminQuizRouteContext,
) {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const parsed = adminQuizUpdateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return privateNoStoreJson<AdminQuizErrorBody>(
      { error: "INVALID_REQUEST", message: "Quiz body invalid." },
      { status: 400 },
    );
  }

  const update: Database["public"]["Tables"]["quizzes"]["Update"] = {};
  if (parsed.data.brandId !== undefined) update.brand_id = parsed.data.brandId;
  if (parsed.data.title !== undefined) update.title = parsed.data.title;
  if (parsed.data.defaultGameMode !== undefined) {
    update.default_game_mode = parsed.data.defaultGameMode;
  }
  if (parsed.data.customLogo !== undefined) {
    update.custom_logo = parsed.data.customLogo;
  }
  if (parsed.data.customLogoLabel !== undefined) {
    update.custom_logo_label = parsed.data.customLogoLabel;
  }
  if (parsed.data.archivedAt !== undefined) {
    update.archived_at = parsed.data.archivedAt;
  }
  if (parsed.data.joinFields !== undefined) {
    update.join_fields = parsed.data.joinFields;
  }

  const serviceSupabase = await createServiceRoleSupabaseClient();
  const { data, error } = await serviceSupabase
    .from("quizzes")
    .update(update)
    .eq("id", id)
    .select(
      "id, title, brand_id, default_game_mode, custom_logo, custom_logo_label, join_fields, archived_at, created_at",
    )
    .maybeSingle();

  if (error) {
    return privateNoStoreJson<AdminQuizErrorBody>(
      { error: "WRITE_FAILED", message: "Update failed." },
      { status: 500 },
    );
  }

  if (!data) {
    return privateNoStoreJson<AdminQuizErrorBody>(
      { error: "QUIZ_NOT_FOUND", message: "Quiz not found." },
      { status: 404 },
    );
  }

  return privateNoStoreJson<AdminQuizDetailBody>({
    quiz: {
      id: data.id,
      title: data.title,
      brandId: data.brand_id,
      defaultGameMode: data.default_game_mode,
      customLogo: data.custom_logo,
      customLogoLabel: data.custom_logo_label,
      joinFields: normalizeJoinFields(data.join_fields),
      archivedAt: data.archived_at,
      createdAt: data.created_at,
    },
  });
}

/**
 * Coerce the `join_fields` jsonb column into a string array.
 * The column defaults to `["name","phone","unit"]` but Drizzle types it as
 * `Json`, so we narrow it on the way out.
 */
function normalizeJoinFields(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((value): value is string => typeof value === "string");
  }
  return [];
}

/**
 * DELETE [QA-21]: dual-mode.
 *   - default (no query): soft-archive per ADR-0004 (`archived_at != null`).
 *     Existing live/scheduled sessions keep running.
 *   - `?hard=true`: hard-delete the quiz row. Two guards:
 *       1. Quiz must already be archived (caller archives first).
 *       2. Quiz must have zero sessions. The FK
 *          `sessions.quiz_id REFERENCES quizzes(id) ON DELETE RESTRICT`
 *          (migration 0000_sloppy_bug.sql:125) would block the delete
 *          anyway, but we check explicitly so the UI can show a count.
 *     Cascade: `questions.quiz_id` is `ON DELETE CASCADE`
 *     (migration 0000_sloppy_bug.sql:124), so questions are removed
 *     automatically with the parent quiz.
 */
export async function DELETE(
  request: NextRequest,
  context: AdminQuizRouteContext,
) {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const url = new URL(request.url);
  const hard = url.searchParams.get("hard") === "true";

  const serviceSupabase = await createServiceRoleSupabaseClient();

  if (hard) {
    const { data: existing, error: lookupError } = await serviceSupabase
      .from("quizzes")
      .select("id, archived_at, sessions(count)")
      .eq("id", id)
      .maybeSingle();

    if (lookupError) {
      return privateNoStoreJson<AdminQuizErrorBody>(
        { error: "WRITE_FAILED", message: "Quiz lookup failed." },
        { status: 500 },
      );
    }

    if (!existing) {
      return privateNoStoreJson<AdminQuizErrorBody>(
        { error: "QUIZ_NOT_FOUND", message: "Quiz not found." },
        { status: 404 },
      );
    }

    if (existing.archived_at === null) {
      return privateNoStoreJson<AdminQuizErrorBody>(
        {
          error: "NOT_ARCHIVED",
          message: "יש לארכב את החידון לפני מחיקה לצמיתות.",
        },
        { status: 409 },
      );
    }

    const sessionCount = Array.isArray(existing.sessions)
      ? (existing.sessions[0]?.count ?? 0)
      : 0;

    if (sessionCount > 0) {
      return privateNoStoreJson<AdminQuizErrorBody>(
        {
          error: "HAS_SESSIONS",
          message: "לא ניתן למחוק חידון עם משחקים.",
          sessionCount,
        },
        { status: 409 },
      );
    }

    const { error: deleteError } = await serviceSupabase
      .from("quizzes")
      .delete()
      .eq("id", id);

    if (deleteError) {
      return privateNoStoreJson<AdminQuizErrorBody>(
        { error: "WRITE_FAILED", message: "Hard-delete failed." },
        { status: 500 },
      );
    }

    return privateNoStoreJson<AdminQuizHardDeleteBody>({
      status: "deleted",
      id,
    });
  }

  const archivedAt = new Date().toISOString();
  const { data, error } = await serviceSupabase
    .from("quizzes")
    .update({ archived_at: archivedAt })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    return privateNoStoreJson<AdminQuizErrorBody>(
      { error: "WRITE_FAILED", message: "Archive failed." },
      { status: 500 },
    );
  }

  if (!data) {
    return privateNoStoreJson<AdminQuizErrorBody>(
      { error: "QUIZ_NOT_FOUND", message: "Quiz not found." },
      { status: 404 },
    );
  }

  return privateNoStoreJson<AdminQuizDeleteBody>({
    status: "archived",
    archivedAt,
  });
}
