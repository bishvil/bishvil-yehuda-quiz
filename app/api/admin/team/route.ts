import { type NextRequest } from "next/server";

import { requireRole } from "@/src/lib/auth/server-auth";
import { privateNoStoreJson } from "@/src/lib/http/responses";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/server";

export interface TeamMemberRow {
  id: string;
  email: string;
  role: "admin" | "host";
  lastSignInAt: string | null;
  createdAt: string;
}

interface TeamListBody {
  members: TeamMemberRow[];
}

interface TeamErrorBody {
  error: "READ_FAILED" | "INVALID_REQUEST" | "WRITE_FAILED" | "NOT_FOUND";
  message: string;
}

interface TeamPatchBody {
  member: TeamMemberRow;
}

/**
 * QA-24: list of users with role admin or host. Powers /admin/settings/team.
 * Excludes participants (they're per-session, not team members).
 */
export async function GET() {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  const supabase = await createServiceRoleSupabaseClient();
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (error) {
    return privateNoStoreJson<TeamErrorBody>(
      { error: "READ_FAILED", message: "Failed to list team members." },
      { status: 500 },
    );
  }

  const members: TeamMemberRow[] = (data?.users ?? [])
    .map((u) => {
      const role = (u.app_metadata as { role?: string } | null)?.role;
      if (role !== "admin" && role !== "host") return null;
      return {
        id: u.id,
        email: u.email ?? "",
        role,
        lastSignInAt: u.last_sign_in_at ?? null,
        createdAt: u.created_at,
      } satisfies TeamMemberRow;
    })
    .filter((row): row is TeamMemberRow => row !== null)
    .sort((a, b) => a.email.localeCompare(b.email));

  return privateNoStoreJson<TeamListBody>({ members });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  let body: { userId?: unknown; role?: unknown };
  try {
    body = await request.json();
  } catch {
    return privateNoStoreJson<TeamErrorBody>(
      { error: "INVALID_REQUEST", message: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const userId = typeof body.userId === "string" ? body.userId : null;
  const role = body.role === "admin" || body.role === "host" ? body.role : null;
  if (!userId || !role) {
    return privateNoStoreJson<TeamErrorBody>(
      { error: "INVALID_REQUEST", message: "userId and role are required." },
      { status: 400 },
    );
  }

  const supabase = await createServiceRoleSupabaseClient();
  const { data: existing } = await supabase.auth.admin.getUserById(userId);
  if (!existing?.user) {
    return privateNoStoreJson<TeamErrorBody>(
      { error: "NOT_FOUND", message: "User not found." },
      { status: 404 },
    );
  }

  const merged = {
    ...(existing.user.app_metadata ?? {}),
    role,
  };
  const { data, error } = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: merged,
  });
  if (error || !data?.user) {
    return privateNoStoreJson<TeamErrorBody>(
      { error: "WRITE_FAILED", message: "Failed to update role." },
      { status: 500 },
    );
  }

  return privateNoStoreJson<TeamPatchBody>({
    member: {
      id: data.user.id,
      email: data.user.email ?? "",
      role,
      lastSignInAt: data.user.last_sign_in_at ?? null,
      createdAt: data.user.created_at,
    },
  });
}
