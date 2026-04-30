import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import type { AuthRole } from "@/src/lib/constants";
import { PRIVATE_NO_STORE_HEADER } from "@/src/lib/constants";
import { getRequiredEnvironmentVariable } from "@/src/lib/env";
import { writeLog } from "@/src/lib/logging";
import { createServerSupabaseClient } from "@/src/lib/supabase/server";
import type { Database } from "@/src/lib/supabase/database.types";

export interface AuthenticatedClaims {
  userId: string;
  role: AuthRole;
  sessionId: string | null;
  participantId: string | null;
}

interface AppMetadataShape {
  role?: AuthRole;
  session_id?: string;
  participant_id?: string;
}

interface ClaimsLikePayload {
  sub?: string;
  app_metadata?: AppMetadataShape;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractClaims(rawClaims: unknown): AuthenticatedClaims | null {
  if (!isRecord(rawClaims)) return null;

  const payload = rawClaims as ClaimsLikePayload;
  const userId = payload.sub;
  const appMeta = payload.app_metadata;
  const role = appMeta?.role;

  if (
    typeof userId !== "string" ||
    (role !== "participant" && role !== "host" && role !== "admin")
  ) {
    return null;
  }

  return {
    userId:
      role === "participant" && typeof appMeta?.participant_id === "string"
        ? appMeta.participant_id
        : userId,
    role,
    sessionId: appMeta?.session_id ?? null,
    participantId: appMeta?.participant_id ?? null,
  };
}

export async function getAuthenticatedClaims(
  supabase: SupabaseClient<Database>,
): Promise<AuthenticatedClaims | null> {
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data) return null;
    return extractClaims(data.claims);
  } catch (caught) {
    writeLog({
      level: "warn",
      message: "Failed to read claims from request",
      context: { error: caught instanceof Error ? caught.message : "unknown" },
    });
    return null;
  }
}

interface UnauthorizedBody {
  error: "UNAUTHORIZED";
  message: string;
}

interface ForbiddenBody {
  error: "FORBIDDEN";
  message: string;
}

export function unauthorizedJson(message: string): NextResponse<UnauthorizedBody> {
  return NextResponse.json(
    { error: "UNAUTHORIZED", message },
    {
      status: 401,
      headers: { "Cache-Control": PRIVATE_NO_STORE_HEADER },
    },
  );
}

export function forbiddenJson(message: string): NextResponse<ForbiddenBody> {
  return NextResponse.json(
    { error: "FORBIDDEN", message },
    {
      status: 403,
      headers: { "Cache-Control": PRIVATE_NO_STORE_HEADER },
    },
  );
}

export type RequireRoleResult =
  | { ok: true; claims: AuthenticatedClaims }
  | { ok: false; response: NextResponse };

export async function requireRole(role: AuthRole): Promise<RequireRoleResult> {
  const supabase = await createServerSupabaseClient();
  const claims = await getAuthenticatedClaims(supabase);

  if (!claims) {
    return { ok: false, response: unauthorizedJson("Authentication required.") };
  }

  if (claims.role !== role) {
    return {
      ok: false,
      response: forbiddenJson(`Expected ${role} credentials.`),
    };
  }

  return { ok: true, claims };
}

/**
 * Cron requests are signed with `Authorization: Bearer <CRON_SECRET>`.
 * Vercel sets this on the scheduled invocation; locally we set it directly.
 */
export function requireCronAuth(request: Request): RequireRoleResult {
  const expected = getRequiredEnvironmentVariable("CRON_SECRET");
  const header = request.headers.get("authorization");

  if (!header || header !== `Bearer ${expected}`) {
    return { ok: false, response: unauthorizedJson("Cron secret required.") };
  }

  return {
    ok: true,
    claims: {
      userId: "cron",
      role: "admin",
      sessionId: null,
      participantId: null,
    },
  };
}
