import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { writeLog } from "@/src/lib/logging";
import { createServerSupabaseClient } from "@/src/lib/supabase/server";

const VALID_OTP_TYPES: ReadonlySet<EmailOtpType> = new Set([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

const ERROR_PATH = "/auth/update-password";
const DEFAULT_NEXT = "/auth/update-password";

/**
 * Email confirmation entrypoint for invite, recovery and magic-link flows.
 *
 * Supabase email links arrive here in one of two shapes:
 *  - PKCE flow: `?code=<auth_code>` — exchanged via `exchangeCodeForSession`.
 *  - Token-hash flow: `?token_hash=...&type=<recovery|invite|...>` — verified
 *    via `verifyOtp`.
 *
 * On success we set the session cookies (handled by `@supabase/ssr` inside the
 * server client) and redirect to `next` (defaults to the password update page,
 * which is what every current caller actually wants).
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const rawType = url.searchParams.get("type");
  const next = sanitizeNext(url.searchParams.get("next"));

  // Surface errors Supabase appended to the redirect (e.g. otp_expired).
  const supabaseError = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (supabaseError) {
    return redirectWithError(request, supabaseError);
  }

  if (!code && !tokenHash) {
    return redirectWithError(request, "missing_token");
  }

  const supabase = await createServerSupabaseClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      writeLog({
        level: "warn",
        message: "auth/confirm exchangeCodeForSession failed",
        context: { error: error.message },
      });
      return redirectWithError(request, error.message);
    }
  } else if (tokenHash) {
    const type = rawType && VALID_OTP_TYPES.has(rawType as EmailOtpType)
      ? (rawType as EmailOtpType)
      : null;
    if (!type) {
      return redirectWithError(request, "invalid_type");
    }
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) {
      writeLog({
        level: "warn",
        message: "auth/confirm verifyOtp failed",
        context: { type, error: error.message },
      });
      return redirectWithError(request, error.message);
    }
  }

  const target = url.clone();
  target.pathname = next;
  target.search = "";
  return NextResponse.redirect(target);
}

function sanitizeNext(value: string | null): string {
  if (!value) return DEFAULT_NEXT;
  // Only allow same-origin relative paths to avoid open-redirects.
  if (!value.startsWith("/") || value.startsWith("//")) return DEFAULT_NEXT;
  return value;
}

function redirectWithError(request: NextRequest, reason: string): NextResponse {
  const target = request.nextUrl.clone();
  target.pathname = ERROR_PATH;
  target.search = "";
  target.searchParams.set("error", reason);
  return NextResponse.redirect(target);
}
