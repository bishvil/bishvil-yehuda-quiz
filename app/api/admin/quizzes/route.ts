import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import type { AdminQuizListItem } from "@/src/lib/admin/api-types";

import { requireRole } from "@/src/lib/auth/server-auth";
import { adminQuizCreateSchema } from "@/src/lib/admin/validation";
import { privateNoStoreJson } from "@/src/lib/http/responses";
import { writeLog } from "@/src/lib/logging";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/server";
import type { Database } from "@/src/lib/supabase/database.types";

interface BrandMetadata {
  id: string;
  slug: string | null;
  name: string;
  logo_url: string | null;
  primary_color: string;
}

interface AdminQuizListBody {
  quizzes: AdminQuizListItem[];
}

interface AdminQuizCreateBody {
  quiz: AdminQuizListItem;
}

interface AdminQuizErrorBody {
  error: "INVALID_REQUEST" | "WRITE_FAILED" | "READ_FAILED";
  message: string;
}

export async function GET() {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  const serviceSupabase = await createServiceRoleSupabaseClient();
  const [{ data, error }, brandResult] = await Promise.all([
    serviceSupabase
      .from("quizzes")
      .select(
        "id, title, brand_id, default_game_mode, custom_logo_active, archived_at, created_at, questions(count), sessions(count)",
      )
      .order("created_at", { ascending: false }),
    // The brands table is newer than the generated Database type.
    (serviceSupabase as SupabaseClient)
      .from("brands")
      .select("id, slug, name, logo_url, primary_color"),
  ]);

  if (error || brandResult.error) {
    return privateNoStoreJson<AdminQuizErrorBody>(
      {
        error: "READ_FAILED",
        message: "לא הצלחנו לטעון את החידונים. נסו שוב.",
      },
      { status: 500 },
    );
  }

  const brandsByKey = new Map<string, BrandMetadata>();
  for (const brand of (brandResult.data ?? []) as BrandMetadata[]) {
    brandsByKey.set(brand.id, brand);
    if (brand.slug) brandsByKey.set(brand.slug, brand);
  }
  const quizzes: AdminQuizListItem[] = (data ?? []).map((row) => {
    const brand = brandsByKey.get(row.brand_id);
    return {
      id: row.id,
      title: row.title,
      brandId: row.brand_id,
      brandName: brand?.name ?? "מותג כללי",
      brandLogoUrl: brand?.logo_url ?? null,
      brandPrimary: brand?.primary_color ?? undefined,
      brandKey: brand?.slug ?? brand?.id ?? row.brand_id,
      defaultGameMode: row.default_game_mode,
      customLogoActive: row.custom_logo_active,
      archivedAt: row.archived_at,
      createdAt: row.created_at,
      questionCount: Array.isArray(row.questions)
        ? (row.questions[0]?.count ?? 0)
        : 0,
      sessionCount: Array.isArray(row.sessions)
        ? (row.sessions[0]?.count ?? 0)
        : 0,
    };
  });

  return privateNoStoreJson<AdminQuizListBody>({ quizzes });
}

export async function POST(request: NextRequest) {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  const parsed = adminQuizCreateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return privateNoStoreJson<AdminQuizErrorBody>(
      { error: "INVALID_REQUEST", message: "Quiz body invalid." },
      { status: 400 },
    );
  }

  const serviceSupabase = await createServiceRoleSupabaseClient();
  const insert: Database["public"]["Tables"]["quizzes"]["Insert"] = {
    owner_id: auth.claims.userId,
    brand_id: parsed.data.brandId,
    title: parsed.data.title,
    default_game_mode: parsed.data.defaultGameMode,
    custom_logo: parsed.data.customLogo ?? null,
    custom_logo_label: parsed.data.customLogoLabel ?? null,
    custom_logo_active: parsed.data.customLogoActive ?? false,
    ...(parsed.data.joinFields ? { join_fields: parsed.data.joinFields } : {}),
  };

  const { data, error } = await serviceSupabase
    .from("quizzes")
    .insert(insert)
    .select(
      "id, title, brand_id, default_game_mode, custom_logo_active, archived_at, created_at",
    )
    .single();

  if (error || !data) {
    writeLog({
      level: "error",
      message: "Quiz create failed",
      context: { error: error?.message ?? "unknown" },
    });
    return privateNoStoreJson<AdminQuizErrorBody>(
      { error: "WRITE_FAILED", message: "Could not create quiz." },
      { status: 500 },
    );
  }

  return privateNoStoreJson<AdminQuizCreateBody>(
    {
      quiz: {
        id: data.id,
        title: data.title,
        brandId: data.brand_id,
        defaultGameMode: data.default_game_mode,
        customLogoActive: data.custom_logo_active,
        archivedAt: data.archived_at,
        createdAt: data.created_at,
      },
    },
    { status: 201 },
  );
}
