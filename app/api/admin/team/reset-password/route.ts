import { type NextRequest } from "next/server";

import { requireRole } from "@/src/lib/auth/server-auth";
import { teamUserIdSchema } from "@/src/lib/auth/validation";
import { privateNoStoreJson } from "@/src/lib/http/responses";
import { writeLog } from "@/src/lib/logging";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/server";

interface OkBody {
  ok: true;
  /**
   * Returned only when not in production. Lets the admin copy the link
   * directly when SMTP is not configured (typical dev setup).
   */
  actionLink?: string;
}

interface ErrBody {
  error: "INVALID_REQUEST" | "NOT_FOUND" | "WRITE_FAILED";
  message: string;
}

/**
 * Admin-triggered password recovery email. Generates a recovery link via
 * Supabase admin API, which dispatches the configured recovery template.
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

  const supabase = await createServiceRoleSupabaseClient();
  const { data: existing } = await supabase.auth.admin.getUserById(userId);
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

  const { data, error } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });
  if (error) {
    writeLog({
      level: "error",
      message: "generateLink(recovery) failed",
      context: { userId, error: error.message },
    });
    return privateNoStoreJson<ErrBody>(
      { error: "WRITE_FAILED", message: "Failed to send recovery email." },
      { status: 500 },
    );
  }

  const actionLink =
    process.env.NODE_ENV !== "production"
      ? (data?.properties?.action_link ?? undefined)
      : undefined;

  return privateNoStoreJson<OkBody>({ ok: true, actionLink });
}
