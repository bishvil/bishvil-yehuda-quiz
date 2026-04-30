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
    archivedAt: string | null;
    createdAt: string;
  };
}

interface AdminQuizErrorBody {
  error:
    | "INVALID_REQUEST"
    | "QUIZ_NOT_FOUND"
    | "WRITE_FAILED";
  message: string;
}

interface AdminQuizDeleteBody {
  status: "archived";
  archivedAt: string;
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
      "id, title, brand_id, default_game_mode, custom_logo, custom_logo_label, archived_at, created_at",
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

  const serviceSupabase = await createServiceRoleSupabaseClient();
  const { data, error } = await serviceSupabase
    .from("quizzes")
    .update(update)
    .eq("id", id)
    .select(
      "id, title, brand_id, default_game_mode, custom_logo, custom_logo_label, archived_at, created_at",
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
      archivedAt: data.archived_at,
      createdAt: data.created_at,
    },
  });
}

/**
 * Soft-delete: archive the quiz per ADR-0004 (`archived_at != null`).
 * Existing live/scheduled sessions keep running (lifecycle interaction
 * documented in ADR-0004 "Required Table: quizzes").
 */
export async function DELETE(
  _request: NextRequest,
  context: AdminQuizRouteContext,
) {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const archivedAt = new Date().toISOString();

  const serviceSupabase = await createServiceRoleSupabaseClient();
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
