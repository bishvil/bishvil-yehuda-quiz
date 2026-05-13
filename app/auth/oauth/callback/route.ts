import { NextResponse, type NextRequest } from "next/server";

import { writeLog } from "@/src/lib/logging";
import { isValidParticipantPin } from "@/src/lib/participant/pin";
import { createServerSupabaseClient } from "@/src/lib/supabase/server";

const STAFF_ROUTES = {
  admin: "/admin/quizzes",
  host: "/host",
} as const;

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const flow = url.searchParams.get("flow");
  const supabaseError =
    url.searchParams.get("error_description") ?? url.searchParams.get("error");

  if (supabaseError || !code) {
    return redirectToAccessNeeded(request, "oauth");
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    writeLog({
      level: "warn",
      message: "oauth callback exchangeCodeForSession failed",
      context: { flow, error: error.message },
    });
    return redirectToAccessNeeded(request, "oauth");
  }

  if (flow === "staff") {
    const { data } = await supabase.auth.getUser();
    const role = data.user?.app_metadata?.role;

    if (role === "admin") {
      return redirectRelative(request, STAFF_ROUTES.admin);
    }

    if (role === "host") {
      return redirectRelative(request, STAFF_ROUTES.host);
    }

    await supabase.auth.signOut();
    return redirectToAccessNeeded(request, "staff");
  }

  if (flow === "participant") {
    const pin = url.searchParams.get("pin");
    if (!pin || !isValidParticipantPin(pin)) {
      await supabase.auth.signOut();
      return redirectToAccessNeeded(request, "participant");
    }

    return redirectRelative(request, `/${pin}?google=connected`);
  }

  await supabase.auth.signOut();
  return redirectToAccessNeeded(request, "oauth");
}

function redirectToAccessNeeded(
  request: NextRequest,
  reason: "oauth" | "staff" | "participant",
): NextResponse {
  return redirectRelative(request, `/auth/access-needed?reason=${reason}`);
}

function redirectRelative(request: NextRequest, path: string): NextResponse {
  const target = request.nextUrl.clone();
  const [pathname, search = ""] = path.split("?");
  target.pathname = pathname ?? "/";
  target.search = search ? `?${search}` : "";
  return NextResponse.redirect(target);
}
