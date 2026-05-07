import { type NextRequest } from "next/server";

import { forgotPasswordSchema } from "@/src/lib/auth/validation";
import { privateNoStoreJson } from "@/src/lib/http/responses";
import { writeLog } from "@/src/lib/logging";
import { createServerSupabaseClient } from "@/src/lib/supabase/server";

interface OkBody {
  ok: true;
}

/**
 * Public self-service password recovery. Always returns ok regardless of
 * whether the email exists, to avoid user enumeration. Uses the anon-keyed
 * server client so the request is rate-limited by Supabase like a normal
 * client call.
 */
export async function POST(request: NextRequest) {
  const parsed = forgotPasswordSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return privateNoStoreJson<OkBody>({ ok: true });
  }
  const { email } = parsed.data;

  const supabase = await createServerSupabaseClient();
  // Recovery links arrive with `?code=...` (PKCE) or `?token_hash=...&type=recovery`.
  // `/auth/confirm` exchanges the credential into a session cookie before
  // forwarding to the password-update form.
  const redirectTo = new URL(
    "/auth/confirm?next=/auth/update-password",
    request.url,
  ).toString();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });
  if (error) {
    writeLog({
      level: "warn",
      message: "resetPasswordForEmail failed (silenced to client)",
      context: { error: error.message },
    });
  }

  return privateNoStoreJson<OkBody>({ ok: true });
}
