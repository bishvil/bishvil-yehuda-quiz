/**
 * Admin-shell brand resolution helper.
 *
 * Reads the per-user brand preference from auth.users.app_metadata.brand
 * (a slug), then resolves it to a full ParticipantBrand via the brands table.
 * Used by every admin page that renders AdminShell so the sidebar reflects
 * the admin's preferred brand.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveParticipantBrand, type ParticipantBrand } from "@/src/lib/participant/brands";

/**
 * Load the brand that should be shown in the admin shell for a given user.
 *
 * @param serviceClient - Service-role Supabase client (for auth.admin.getUserById).
 * @param userId - The authenticated admin user's ID.
 */
export async function loadAdminBrand(
  serviceClient: SupabaseClient,
  userId: string | null | undefined,
): Promise<ParticipantBrand> {
  let slug: string | null = null;

  if (userId) {
    const { data } = await serviceClient.auth.admin.getUserById(userId);
    slug =
      (data?.user?.app_metadata as { brand?: string } | null)?.brand ?? null;
  }

  return resolveParticipantBrand(serviceClient, slug);
}
