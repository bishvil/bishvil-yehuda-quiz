import { type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireRole } from "@/src/lib/auth/server-auth";
import {
  adminBrandCreateSchema,
} from "@/src/lib/admin/validation";
import { privateNoStoreJson } from "@/src/lib/http/responses";
import { loadAdminBrands, type AdminBrand } from "@/src/lib/participant/brands";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/server";

interface AdminBrandsListBody {
  brands: AdminBrand[];
}

interface AdminBrandCreateBody {
  brand: AdminBrand;
}

interface AdminBrandErrorBody {
  error: "INVALID_REQUEST" | "WRITE_FAILED";
  message: string;
}

interface BrandInsertRow {
  id: string;
  slug: string | null;
  name: string;
  tagline: string | null;
  logo_url: string;
  primary_color: string;
  accent_color: string;
  is_system: boolean;
  created_at: string;
}

/** GET /api/admin/brands — list non-archived brands (admin only). */
export async function GET() {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  const supabase = await createServiceRoleSupabaseClient();
  const brands = await loadAdminBrands(supabase as unknown as SupabaseClient);

  return privateNoStoreJson<AdminBrandsListBody>({ brands });
}

/** POST /api/admin/brands — create a new user brand. */
export async function POST(request: NextRequest) {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return privateNoStoreJson<AdminBrandErrorBody>(
      { error: "INVALID_REQUEST", message: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const parsed = adminBrandCreateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return privateNoStoreJson<AdminBrandErrorBody>(
      {
        error: "INVALID_REQUEST",
        message: parsed.error.issues.map((i) => i.message).join("; "),
      },
      { status: 400 },
    );
  }

  const { name, tagline, logoUrl, primaryColor, accentColor } = parsed.data;

  const supabase = await createServiceRoleSupabaseClient();
  // Cast to untyped client — brands table is not yet in generated types.
  const untypedClient = supabase as unknown as SupabaseClient;

  const { data, error } = await untypedClient
    .from("brands")
    .insert({
      name,
      tagline: tagline ?? null,
      logo_url: logoUrl,
      primary_color: primaryColor ?? "#306030",
      accent_color: accentColor ?? "#A0C040",
      is_system: false,
      created_by: auth.claims.userId,
    })
    .select(
      "id, slug, name, tagline, logo_url, primary_color, accent_color, is_system, created_at",
    )
    .single();

  if (error || !data) {
    return privateNoStoreJson<AdminBrandErrorBody>(
      { error: "WRITE_FAILED", message: "Failed to create brand." },
      { status: 500 },
    );
  }

  const row = data as BrandInsertRow;
  const brand: AdminBrand = {
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

  return privateNoStoreJson<AdminBrandCreateBody>({ brand }, { status: 201 });
}
