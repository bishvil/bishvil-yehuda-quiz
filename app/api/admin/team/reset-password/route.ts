import { type NextRequest } from "next/server";

import { requireRole } from "@/src/lib/auth/server-auth";
import { teamUserIdSchema } from "@/src/lib/auth/validation";
import { privateNoStoreJson } from "@/src/lib/http/responses";
import { writeLog } from "@/src/lib/logging";
import {
  createServerSupabaseClient,
  createServiceRoleSupabaseClient,
} from "@/src/lib/supabase/server";

interface OkBody {
  ok: true;
}

interface ErrBody {
  error: "INVALID_REQUEST" | "NOT_FOUND" | "WRITE_FAILED";
  message: string;
}

/**
 * Admin-triggered password recovery email.
 *
 * We deliberately use `resetPasswordForEmail` (anon client) rather than
 * `admin.generateLink({ type: "recovery" })`. `generateLink` returns the
 * action link in the response and only triggers SMTP under specific
 * configurations — in our hosted setup it consistently produced a 200 with
 * no email actually dispatched. `resetPasswordForEmail` always goes through
 * the project's SMTP pipeline and the configured "Reset Password" template.
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  const parsed = teamUserIdSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return privateNoStoreJson<ErrBody>(
      { error: "INVALID_REQUEST", message: parsed.error?.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }
  const { userId } = parsed.data;

  const adminClient = await createServiceRoleSupabaseClient();
  const { data: existing } = await adminClient.auth.admin.getUserById(userId);
  const email = existing?.user?.email ?? null;
  if (!email) {
    return privateNoStoreJson<ErrBody>(
      { error: "NOT_FOUND", message: "User has no email on file." },
      { status: 404 },
    );
  }

  const redirectTo = new URL(
    "/auth/confirm?next=/auth/update-password",
    request.url,
  ).toString();

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) {
    writeLog({
      level: "error",
      message: "resetPasswordForEmail (admin-triggered) failed",
      context: { userId, error: error.message },
    });
    return privateNoStoreJson<ErrBody>(
      { error: "WRITE_FAILED", message: "Failed to send recovery email." },
      { status: 500 },
    );
  }

  return privateNoStoreJson<OkBody>({ ok: true });
}
