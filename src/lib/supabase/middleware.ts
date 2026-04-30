import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  PRIVATE_NO_STORE_HEADER,
  PROTECTED_ADMIN_PATH_PREFIX,
  PROTECTED_HOST_PATH_PREFIX,
  type AuthRole,
} from "@/src/lib/constants";
import { getRequiredEnvironmentVariable } from "@/src/lib/env";

import type { Database } from "./database.types";

export function getRoleFromClaims(claims: unknown): AuthRole | null {
  if (!isRecord(claims)) {
    return null;
  }

  const appMetadata = claims.app_metadata;

  if (!isRecord(appMetadata)) {
    return null;
  }

  const role = appMetadata.role;

  if (role === "participant" || role === "host" || role === "admin") {
    return role;
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient<Database>(
    getRequiredEnvironmentVariable("NEXT_PUBLIC_SUPABASE_URL"),
    getRequiredEnvironmentVariable("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));

          response = NextResponse.next({
            request,
          });

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });

          Object.entries(headers).forEach(([header, value]) => {
            response.headers.set(header, value);
          });
        },
      },
    },
  );

  const { data, error } = await getClaimsSafely(supabase);
  const role = error || !data ? null : getRoleFromClaims(data.claims);
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith(PROTECTED_HOST_PATH_PREFIX) && role !== "host") {
    return unauthorizedResponse("Host authentication required");
  }

  if (pathname.startsWith(PROTECTED_ADMIN_PATH_PREFIX) && role !== "admin") {
    return unauthorizedResponse("Admin authentication required");
  }

  response.headers.set("Cache-Control", PRIVATE_NO_STORE_HEADER);
  return response;
}

function unauthorizedResponse(message: string): NextResponse {
  return NextResponse.json(
    { error: "UNAUTHORIZED", message },
    {
      status: 401,
      headers: {
        "Cache-Control": PRIVATE_NO_STORE_HEADER,
      },
    },
  );
}

async function getClaimsSafely(
  supabase: ReturnType<typeof createServerClient<Database>>,
) {
  try {
    return await supabase.auth.getClaims();
  } catch {
    return { data: null, error: new Error("Unable to verify auth claims") };
  }
}
