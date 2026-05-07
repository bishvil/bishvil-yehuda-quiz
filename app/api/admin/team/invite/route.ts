import { type NextRequest } from "next/server";

import { requireRole } from "@/src/lib/auth/server-auth";
import { privateNoStoreJson } from "@/src/lib/http/responses";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/server";

interface InviteBody {
  user: {
    id: string;
    email: string;
    role: "admin" | "host";
  };
}

interface InviteErrorBody {
  error: "INVALID_REQUEST" | "WRITE_FAILED";
  message: string;
}

/**
 * QA-24: invite a new team member by email. Sends Supabase invite mail
 * with the role baked into app_metadata so it survives sign-up.
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  let body: { email?: unknown; role?: unknown };
  try {
    body = await request.json();
  } catch {
    return privateNoStoreJson<InviteErrorBody>(
      { error: "INVALID_REQUEST", message: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const role = body.role === "admin" || body.role === "host" ? body.role : null;
  if (!email || !role) {
    return privateNoStoreJson<InviteErrorBody>(
      { error: "INVALID_REQUEST", message: "email and role are required." },
      { status: 400 },
    );
  }

  const supabase = await createServiceRoleSupabaseClient();
  // Send invitees through `/auth/confirm` so the PKCE code (or token_hash)
  // appended to the redirect is exchanged into a session cookie before they
  // land on the password-update form. Without a redirectTo Supabase falls back
  // to site_url, leaving the credential unhandled on the landing page.
  const redirectTo = new URL(
    "/auth/confirm?next=/auth/update-password",
    request.url,
  ).toString();
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { role },
    redirectTo,
  });
  if (error || !data?.user) {
    return privateNoStoreJson<InviteErrorBody>(
      {
        error: "WRITE_FAILED",
        message: error?.message ?? "Failed to send invite.",
      },
      { status: 500 },
    );
  }

  // Force role into app_metadata too — `data` arg above only sets
  // user_metadata which the client can change. Role is an authorization
  // claim so it must live in app_metadata.
  await supabase.auth.admin.updateUserById(data.user.id, {
    app_metadata: { ...(data.user.app_metadata ?? {}), role },
  });

  return privateNoStoreJson<InviteBody>({
    user: { id: data.user.id, email: data.user.email ?? email, role },
  });
}
