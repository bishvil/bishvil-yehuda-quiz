import { type NextRequest } from "next/server";

import { requireRole } from "@/src/lib/auth/server-auth";
import {
  teamCreateSchema,
  teamPatchSchema,
  teamUserIdSchema,
} from "@/src/lib/auth/validation";
import { privateNoStoreJson } from "@/src/lib/http/responses";
import { writeLog } from "@/src/lib/logging";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/server";

export interface TeamMemberRow {
  id: string;
  email: string;
  role: "admin" | "host";
  lastSignInAt: string | null;
  createdAt: string;
  ownedQuizzes: number;
  ownedSessions: number;
}

interface TeamListBody {
  members: TeamMemberRow[];
  currentUserId: string;
}

interface TeamErrorBody {
  error:
    | "READ_FAILED"
    | "INVALID_REQUEST"
    | "WRITE_FAILED"
    | "NOT_FOUND"
    | "OWNS_CONTENT"
    | "FORBIDDEN_SELF";
  message: string;
  details?: { ownedQuizzes?: number; ownedSessions?: number };
}

interface TeamPatchBody {
  member: TeamMemberRow;
}

interface TeamCreateBody {
  member: TeamMemberRow;
}

interface TeamDeleteBody {
  ok: true;
}

type ServiceClient = Awaited<
  ReturnType<typeof createServiceRoleSupabaseClient>
>;

async function getOwnershipCounts(supabase: ServiceClient): Promise<{
  quizzesByOwner: Map<string, number>;
  sessionsByHost: Map<string, number>;
}> {
  const quizzesByOwner = new Map<string, number>();
  const sessionsByHost = new Map<string, number>();

  const [quizRes, sessionRes] = await Promise.all([
    supabase.from("quizzes").select("owner_id"),
    supabase.from("sessions").select("host_id"),
  ]);
  if (quizRes.error) throw quizRes.error;
  if (sessionRes.error) throw sessionRes.error;

  for (const row of quizRes.data ?? []) {
    if (!row.owner_id) continue;
    quizzesByOwner.set(
      row.owner_id,
      (quizzesByOwner.get(row.owner_id) ?? 0) + 1,
    );
  }
  for (const row of sessionRes.data ?? []) {
    if (!row.host_id) continue;
    sessionsByHost.set(
      row.host_id,
      (sessionsByHost.get(row.host_id) ?? 0) + 1,
    );
  }

  return { quizzesByOwner, sessionsByHost };
}

async function getOwnershipForUser(
  supabase: ServiceClient,
  userId: string,
): Promise<{ ownedQuizzes: number; ownedSessions: number }> {
  const [quizRes, sessionRes] = await Promise.all([
    supabase
      .from("quizzes")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId),
    supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("host_id", userId),
  ]);
  if (quizRes.error) throw quizRes.error;
  if (sessionRes.error) throw sessionRes.error;
  return {
    ownedQuizzes: quizRes.count ?? 0,
    ownedSessions: sessionRes.count ?? 0,
  };
}

/**
 * QA-24: list of users with role admin or host. Powers /admin/settings/team.
 * Excludes participants (they're per-session, not team members).
 */
export async function GET() {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  const supabase = await createServiceRoleSupabaseClient();
  const [usersRes, countsRes] = await Promise.all([
    supabase.auth.admin.listUsers({ perPage: 200 }),
    getOwnershipCounts(supabase).then(
      (c) => ({ ok: true, counts: c }) as const,
      (err: unknown) => ({ ok: false, error: err as Error }) as const,
    ),
  ]);

  if (usersRes.error) {
    writeLog({
      level: "error",
      message: "listUsers failed in team route",
      context: {
        code: (usersRes.error as { code?: string }).code ?? null,
        status: (usersRes.error as { status?: number }).status ?? null,
        authMessage: usersRes.error.message,
      },
    });
    return privateNoStoreJson<TeamErrorBody>(
      { error: "READ_FAILED", message: "Failed to list team members." },
      { status: 500 },
    );
  }
  if (!countsRes.ok) {
    writeLog({
      level: "error",
      message: "ownership count failed in team route",
      context: { error: countsRes.error.message },
    });
    return privateNoStoreJson<TeamErrorBody>(
      { error: "READ_FAILED", message: "Failed to compute ownership counts." },
      { status: 500 },
    );
  }
  const { counts } = countsRes;
  const data = usersRes.data;

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
        ownedQuizzes: counts.quizzesByOwner.get(u.id) ?? 0,
        ownedSessions: counts.sessionsByHost.get(u.id) ?? 0,
      } satisfies TeamMemberRow;
    })
    .filter((row): row is TeamMemberRow => row !== null)
    .sort((a, b) => a.email.localeCompare(b.email));

  return privateNoStoreJson<TeamListBody>({
    members,
    currentUserId: auth.claims.userId,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  const parsed = teamCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return privateNoStoreJson<TeamErrorBody>(
      { error: "INVALID_REQUEST", message: parsed.error?.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }
  const { email, password, role } = parsed.data;

  const supabase = await createServiceRoleSupabaseClient();
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role },
    user_metadata: { role },
  });
  if (error || !data?.user) {
    return privateNoStoreJson<TeamErrorBody>(
      {
        error: "WRITE_FAILED",
        message: error?.message ?? "Failed to create user.",
      },
      { status: 400 },
    );
  }

  return privateNoStoreJson<TeamCreateBody>(
    {
      member: {
        id: data.user.id,
        email: data.user.email ?? email,
        role,
        lastSignInAt: data.user.last_sign_in_at ?? null,
        createdAt: data.user.created_at,
        ownedQuizzes: 0,
        ownedSessions: 0,
      },
    },
    { status: 201 },
  );
}

export async function PATCH(request: NextRequest) {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  const parsed = teamPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return privateNoStoreJson<TeamErrorBody>(
      { error: "INVALID_REQUEST", message: parsed.error?.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }
  const { userId, role } = parsed.data;

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

  let ownedQuizzes = 0;
  let ownedSessions = 0;
  try {
    const owned = await getOwnershipForUser(supabase, userId);
    ownedQuizzes = owned.ownedQuizzes;
    ownedSessions = owned.ownedSessions;
  } catch {
    // non-fatal — UI will reload list on next fetch
  }

  return privateNoStoreJson<TeamPatchBody>({
    member: {
      id: data.user.id,
      email: data.user.email ?? "",
      role,
      lastSignInAt: data.user.last_sign_in_at ?? null,
      createdAt: data.user.created_at,
      ownedQuizzes,
      ownedSessions,
    },
  });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  const parsed = teamUserIdSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return privateNoStoreJson<TeamErrorBody>(
      { error: "INVALID_REQUEST", message: parsed.error?.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }
  const { userId } = parsed.data;

  if (userId === auth.claims.userId) {
    return privateNoStoreJson<TeamErrorBody>(
      {
        error: "FORBIDDEN_SELF",
        message: "Admins cannot delete their own account.",
      },
      { status: 403 },
    );
  }

  const supabase = await createServiceRoleSupabaseClient();

  let ownedQuizzes = 0;
  let ownedSessions = 0;
  try {
    const owned = await getOwnershipForUser(supabase, userId);
    ownedQuizzes = owned.ownedQuizzes;
    ownedSessions = owned.ownedSessions;
  } catch (err) {
    writeLog({
      level: "error",
      message: "ownership count failed in delete user",
      context: { error: (err as Error).message },
    });
    return privateNoStoreJson<TeamErrorBody>(
      { error: "READ_FAILED", message: "Failed to verify ownership." },
      { status: 500 },
    );
  }

  if (ownedQuizzes > 0 || ownedSessions > 0) {
    return privateNoStoreJson<TeamErrorBody>(
      {
        error: "OWNS_CONTENT",
        message:
          `User still owns ${ownedQuizzes} quiz(zes) and is host on ` +
          `${ownedSessions} session(s). Reassign or archive them first.`,
        details: { ownedQuizzes, ownedSessions },
      },
      { status: 409 },
    );
  }

  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) {
    writeLog({
      level: "error",
      message: "deleteUser failed",
      context: { error: error.message, userId },
    });
    return privateNoStoreJson<TeamErrorBody>(
      { error: "WRITE_FAILED", message: "Failed to delete user." },
      { status: 500 },
    );
  }

  return privateNoStoreJson<TeamDeleteBody>({ ok: true });
}
