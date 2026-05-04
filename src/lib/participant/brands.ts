/**
 * Brand resolver — DB-backed lookups replacing the former hardcoded map.
 * Brands live in the `brands` table seeded with 4 system entries.
 * The `ParticipantBrand` interface is the consumer-facing shape; it is kept
 * stable so HostHeader, BrandBlock, and test fixtures need no shape changes.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const SYSTEM_DEFAULT_BRAND_SLUG = "yehuda";

export interface ParticipantBrand {
  id: string;
  name: string;
  tagline: string;
  logoUrl: string;
  primary: string;
  accent: string;
}

/** DB row shape returned by the brands table select. */
interface BrandRow {
  id: string;
  slug: string | null;
  name: string;
  tagline: string | null;
  logo_url: string;
  primary_color: string;
  accent_color: string;
}

function rowToBrand(row: BrandRow): ParticipantBrand {
  return {
    id: row.slug ?? row.id,
    name: row.name,
    tagline: row.tagline ?? "",
    logoUrl: row.logo_url,
    primary: row.primary_color,
    accent: row.accent_color,
  };
}

/**
 * List all non-archived brands ordered by system-first, then name.
 * Uses the untyped Supabase client to avoid depending on stale generated types.
 */
export async function loadBrands(client: SupabaseClient): Promise<ParticipantBrand[]> {
  const { data, error } = await client
    .from("brands")
    .select("id, slug, name, tagline, logo_url, primary_color, accent_color")
    .is("archived_at", null)
    .order("is_system", { ascending: false })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Failed to load brands: ${error.message}`);
  }

  return ((data as BrandRow[]) ?? []).map(rowToBrand);
}

/** Extended brand shape for admin-side screens (includes isSystem). */
export interface AdminBrand {
  id: string;
  slug: string | null;
  name: string;
  tagline: string;
  logoUrl: string;
  primary: string;
  accent: string;
  isSystem: boolean;
  createdAt: string;
}

/** DB row shape extended with admin-only fields. */
interface AdminBrandRow extends BrandRow {
  is_system: boolean;
  created_at: string;
}

/**
 * List all non-archived brands for admin-side UIs.
 * Includes `isSystem` and `slug` (not exposed in `ParticipantBrand`).
 * Ordered system-first, then alphabetically.
 */
export async function loadAdminBrands(
  client: SupabaseClient,
): Promise<AdminBrand[]> {
  const { data, error } = await client
    .from("brands")
    .select(
      "id, slug, name, tagline, logo_url, primary_color, accent_color, is_system, created_at",
    )
    .is("archived_at", null)
    .order("is_system", { ascending: false })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Failed to load admin brands: ${error.message}`);
  }

  return ((data as AdminBrandRow[]) ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline ?? "",
    logoUrl: row.logo_url,
    primary: row.primary_color,
    accent: row.accent_color,
    isSystem: row.is_system,
    createdAt: row.created_at,
  }));
}

/**
 * Resolve a brand by slug (back-compat with existing brand_id values) or UUID.
 * Falls back to the system `yehuda` brand row. Throws if yehuda is missing
 * (deployment bug — seed data must be present).
 */
export async function resolveParticipantBrand(
  client: SupabaseClient,
  brandIdOrSlug: string | null | undefined,
): Promise<ParticipantBrand> {
  if (brandIdOrSlug) {
    // Try by slug first (existing brand_ids are slugs like "yehuda").
    const { data: bySlug } = await client
      .from("brands")
      .select("id, slug, name, tagline, logo_url, primary_color, accent_color")
      .eq("slug", brandIdOrSlug)
      .is("archived_at", null)
      .maybeSingle();

    if (bySlug) {
      return rowToBrand(bySlug as BrandRow);
    }

    // If not found by slug and value looks like a UUID, try by id.
    const UUID_RE =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (UUID_RE.test(brandIdOrSlug)) {
      const { data: byId } = await client
        .from("brands")
        .select("id, slug, name, tagline, logo_url, primary_color, accent_color")
        .eq("id", brandIdOrSlug)
        .is("archived_at", null)
        .maybeSingle();

      if (byId) {
        return rowToBrand(byId as BrandRow);
      }
    }
  }

  // Fallback: system yehuda brand.
  const { data: yehuda } = await client
    .from("brands")
    .select("id, slug, name, tagline, logo_url, primary_color, accent_color")
    .eq("slug", SYSTEM_DEFAULT_BRAND_SLUG)
    .maybeSingle();

  if (!yehuda) {
    throw new Error(
      `System brand '${SYSTEM_DEFAULT_BRAND_SLUG}' is missing from the brands table. Check seed data.`,
    );
  }

  return rowToBrand(yehuda as BrandRow);
}

/**
 * customLogo (per-quiz) overrides brand.logo per design-intake.md §5.
 * Callers must pre-clear customLogo (set to null) when the per-quiz toggle
 * is off, so this helper only sees the effective override.
 */
export function resolveActiveLogo(args: {
  brand: ParticipantBrand;
  customLogo: string | null | undefined;
  customLogoLabel: string | null | undefined;
}): { logoUrl: string; label: string; isCustom: boolean } {
  if (args.customLogo) {
    return {
      logoUrl: args.customLogo,
      label: args.customLogoLabel ?? args.brand.name,
      isCustom: true,
    };
  }

  return {
    logoUrl: args.brand.logoUrl,
    label: args.brand.name,
    isCustom: false,
  };
}
