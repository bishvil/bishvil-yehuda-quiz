import { type NextRequest } from "next/server";

import { requireRole } from "@/src/lib/auth/server-auth";
import { privateNoStoreJson } from "@/src/lib/http/responses";
import { PARTICIPANT_BRANDS } from "@/src/lib/participant/brands";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/server";

interface BrandGetBody {
  brand: string | null;
}

interface BrandPutBody {
  brand: string;
}

interface BrandErrorBody {
  error: "INVALID_REQUEST" | "WRITE_FAILED";
  message: string;
}

/**
 * QA-24: per-user brand preference. Persisted on auth.users.app_metadata.brand
 * (avoids a schema migration in v1). Read on every request via
 * `requireRole(...).claims` ergonomics; consumers that need it should
 * also fall back to the quiz brand for participant-facing surfaces.
 */
export async function GET() {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  const supabase = await createServiceRoleSupabaseClient();
  const { data } = await supabase.auth.admin.getUserById(auth.claims.userId);
  const brand =
    (data?.user?.app_metadata as { brand?: string } | null)?.brand ?? null;

  return privateNoStoreJson<BrandGetBody>({ brand });
}

export async function PUT(request: NextRequest) {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  let body: { brand?: unknown };
  try {
    body = await request.json();
  } catch {
    return privateNoStoreJson<BrandErrorBody>(
      { error: "INVALID_REQUEST", message: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const brand = typeof body.brand === "string" ? body.brand : "";
  if (!brand || !(brand in PARTICIPANT_BRANDS)) {
    return privateNoStoreJson<BrandErrorBody>(
      { error: "INVALID_REQUEST", message: "Unknown brand id." },
      { status: 400 },
    );
  }

  const supabase = await createServiceRoleSupabaseClient();
  const { data: existing } = await supabase.auth.admin.getUserById(
    auth.claims.userId,
  );
  const merged = {
    ...(existing?.user?.app_metadata ?? {}),
    brand,
  };
  const { error } = await supabase.auth.admin.updateUserById(
    auth.claims.userId,
    { app_metadata: merged },
  );
  if (error) {
    return privateNoStoreJson<BrandErrorBody>(
      { error: "WRITE_FAILED", message: "Failed to save brand." },
      { status: 500 },
    );
  }

  return privateNoStoreJson<BrandPutBody>({ brand });
}
