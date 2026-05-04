import { type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireRole } from "@/src/lib/auth/server-auth";
import {
  adminBrandUpdateSchema,
  adminBrandSystemUpdateSchema,
} from "@/src/lib/admin/validation";
import { privateNoStoreJson } from "@/src/lib/http/responses";
import { type AdminBrand } from "@/src/lib/participant/brands";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/server";

interface AdminBrandUpdateBody {
  brand: AdminBrand;
}

interface AdminBrandDeleteBody {
  status: "archived";
  id: string;
}

interface AdminBrandErrorBody {
  error:
    | "INVALID_REQUEST"
    | "NOT_FOUND"
    | "SYSTEM_BRAND"
    | "BRAND_IN_USE"
    | "WRITE_FAILED";
  message: string;
  quizTitles?: string[];
}

interface AdminBrandRouteContext {
  params: Promise<{ id: string }>;
}

interface BrandRow {
  id: string;
  slug: string | null;
  name: string;
  tagline: string | null;
  logo_url: string;
  primary_color: string;
  accent_color: string;
  is_system: boolean;
  created_at: string;
  archived_at: string | null;
}

type BrandRowNoArchive = Omit<BrandRow, "archived_at">;

function rowToAdminBrand(row: BrandRowNoArchive): AdminBrand {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline ?? "",
    logoUrl: row.logo_url,
    primary: row.primary_color,
    accent: row.accent_color,
    isSystem: row.is_system,
    createdAt: row.created_at,
  };
}

/** PUT /api/admin/brands/[id] — update a brand. */
export async function PUT(
  request: NextRequest,
  context: AdminBrandRouteContext,
) {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  const { id } = await context.params;

  const supabase = await createServiceRoleSupabaseClient();
  // Cast to untyped client — brands table is not yet in generated types.
  const db = supabase as unknown as SupabaseClient;

  // Fetch existing brand row to know is_system flag.
  const { data: existing } = await db
    .from("brands")
    .select(
      "id, slug, name, tagline, logo_url, primary_color, accent_color, is_system, created_at, archived_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (!existing) {
    return privateNoStoreJson<AdminBrandErrorBody>(
      { error: "NOT_FOUND", message: "Brand not found." },
      { status: 404 },
    );
  }

  const existingRow = existing as BrandRow;

  if (existingRow.archived_at !== null) {
    return privateNoStoreJson<AdminBrandErrorBody>(
      { error: "NOT_FOUND", message: "Brand has been archived." },
      { status: 404 },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return privateNoStoreJson<AdminBrandErrorBody>(
      { error: "INVALID_REQUEST", message: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const isSystem = existingRow.is_system;

  // For system brands, use the strict schema that only allows cosmetic fields.
  if (isSystem) {
    const parsed = adminBrandSystemUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      return privateNoStoreJson<AdminBrandErrorBody>(
        {
          error: "SYSTEM_BRAND",
          message:
            "System brands: only tagline and colors may be modified. " +
            parsed.error.issues.map((i) => i.message).join("; "),
        },
        { status: 403 },
      );
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.tagline !== undefined)
      updates.tagline = parsed.data.tagline;
    if (parsed.data.primaryColor !== undefined)
      updates.primary_color = parsed.data.primaryColor;
    if (parsed.data.accentColor !== undefined)
      updates.accent_color = parsed.data.accentColor;

    const { data: updated, error: updateError } = await db
      .from("brands")
      .update(updates)
      .eq("id", id)
      .select(
        "id, slug, name, tagline, logo_url, primary_color, accent_color, is_system, created_at",
      )
      .single();

    if (updateError || !updated) {
      return privateNoStoreJson<AdminBrandErrorBody>(
        { error: "WRITE_FAILED", message: "Failed to update brand." },
        { status: 500 },
      );
    }

    return privateNoStoreJson<AdminBrandUpdateBody>({
      brand: rowToAdminBrand(updated as BrandRowNoArchive),
    });
  }

  // User-created brand: allow all editable fields.
  const parsed = adminBrandUpdateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return privateNoStoreJson<AdminBrandErrorBody>(
      {
        error: "INVALID_REQUEST",
        message: parsed.error.issues.map((i) => i.message).join("; "),
      },
      { status: 400 },
    );
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.tagline !== undefined) updates.tagline = parsed.data.tagline;
  if (parsed.data.logoUrl !== undefined) updates.logo_url = parsed.data.logoUrl;
  if (parsed.data.primaryColor !== undefined)
    updates.primary_color = parsed.data.primaryColor;
  if (parsed.data.accentColor !== undefined)
    updates.accent_color = parsed.data.accentColor;

  const { data: updated, error: updateError } = await db
    .from("brands")
    .update(updates)
    .eq("id", id)
    .select(
      "id, slug, name, tagline, logo_url, primary_color, accent_color, is_system, created_at",
    )
    .single();

  if (updateError || !updated) {
    return privateNoStoreJson<AdminBrandErrorBody>(
      { error: "WRITE_FAILED", message: "Failed to update brand." },
      { status: 500 },
    );
  }

  return privateNoStoreJson<AdminBrandUpdateBody>({
    brand: rowToAdminBrand(updated as BrandRowNoArchive),
  });
}

/** DELETE /api/admin/brands/[id] — soft-archive a brand. */
export async function DELETE(
  _request: NextRequest,
  context: AdminBrandRouteContext,
) {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  const { id } = await context.params;

  const supabase = await createServiceRoleSupabaseClient();
  // Cast to untyped client — brands table is not yet in generated types.
  const db = supabase as unknown as SupabaseClient;

  // Fetch existing brand row.
  const { data: existing } = await db
    .from("brands")
    .select("id, slug, is_system, archived_at")
    .eq("id", id)
    .maybeSingle();

  if (!existing) {
    return privateNoStoreJson<AdminBrandErrorBody>(
      { error: "NOT_FOUND", message: "Brand not found." },
      { status: 404 },
    );
  }

  const existingRow = existing as Pick<
    BrandRow,
    "id" | "slug" | "is_system" | "archived_at"
  >;

  if (existingRow.archived_at !== null) {
    return privateNoStoreJson<AdminBrandErrorBody>(
      { error: "NOT_FOUND", message: "Brand has already been archived." },
      { status: 404 },
    );
  }

  if (existingRow.is_system) {
    return privateNoStoreJson<AdminBrandErrorBody>(
      { error: "SYSTEM_BRAND", message: "System brands cannot be archived." },
      { status: 403 },
    );
  }

  // Check for non-archived quizzes referencing this brand (by id or slug).
  const slug = existingRow.slug;
  let quizQuery = (supabase as unknown as SupabaseClient)
    .from("quizzes")
    .select("title")
    .is("archived_at", null);

  if (slug) {
    quizQuery = quizQuery.or(`brand_id.eq.${slug},brand_id.eq.${id}`);
  } else {
    quizQuery = quizQuery.eq("brand_id", id);
  }

  const { data: referencingQuizzes } = await quizQuery;
  const quizTitles = ((referencingQuizzes as Array<{ title: string }> | null) ?? []).map(
    (q) => q.title,
  );

  if (quizTitles.length > 0) {
    return privateNoStoreJson<AdminBrandErrorBody>(
      {
        error: "BRAND_IN_USE",
        message: `המותג בשימוש ב-${quizTitles.length} חידון/ים. יש להסיר תחילה.`,
        quizTitles,
      },
      { status: 409 },
    );
  }

  // Soft-archive.
  const { error: archiveError } = await db
    .from("brands")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);

  if (archiveError) {
    return privateNoStoreJson<AdminBrandErrorBody>(
      { error: "WRITE_FAILED", message: "Failed to archive brand." },
      { status: 500 },
    );
  }

  return privateNoStoreJson<AdminBrandDeleteBody>({ status: "archived", id });
}
