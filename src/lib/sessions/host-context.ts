import { type NextResponse } from "next/server";

import { forbiddenJson, requireRole } from "@/src/lib/auth/server-auth";
import { findAnySessionByPin, findHostSessionByPin } from "@/src/lib/sessions/lookup";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/server";
import { privateNoStoreJson } from "@/src/lib/http/responses";
import type { ServiceSupabase } from "@/src/lib/sessions/lookup";
import type { Database } from "@/src/lib/supabase/database.types";

type SessionRow = Database["public"]["Tables"]["sessions"]["Row"];

export type HostContextResult =
  | {
      ok: true;
      session: SessionRow;
      hostId: string;
      serviceSupabase: ServiceSupabase;
    }
  | { ok: false; response: NextResponse };

interface HostContextOptions {
  /** When true, allows looking up a session even after it has ended. */
  includeEnded?: boolean;
}

export async function loadHostContext(
  pin: string,
  options: HostContextOptions = {},
): Promise<HostContextResult> {
  const auth = await requireRole("host");
  if (!auth.ok) {
    return { ok: false, response: auth.response };
  }

  const serviceSupabase = await createServiceRoleSupabaseClient();
  const lookup = options.includeEnded ? findAnySessionByPin : findHostSessionByPin;
  const { data: session } = await lookup(serviceSupabase, pin);

  if (!session) {
    return {
      ok: false,
      response: privateNoStoreJson(
        { error: "SESSION_NOT_FOUND", message: "No matching session." },
        { status: 404 },
      ),
    };
  }

  const isAdmin = auth.claims.role === "admin";
  if (!isAdmin && (!session.host_id || session.host_id !== auth.claims.userId)) {
    return {
      ok: false,
      response: forbiddenJson("This host does not control this session."),
    };
  }

  if (session.game_mode !== "sync") {
    return {
      ok: false,
      response: forbiddenJson("Host controls are only available for sync sessions."),
    };
  }

  return {
    ok: true,
    session,
    hostId: auth.claims.userId,
    serviceSupabase,
  };
}
