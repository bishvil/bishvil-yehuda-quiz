import { requireRole } from "@/src/lib/auth/server-auth";
import { privateNoStoreJson } from "@/src/lib/http/responses";
import { findPublicSessionByPin } from "@/src/lib/sessions/lookup";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/server";
import { loadPersonalAnswerReview } from "@/src/lib/participant/load-answer-review";
export async function GET(
  _request: Request,
  context: { params: Promise<{ pin: string }> },
) {
  const auth = await requireRole("participant");
  if (!auth.ok) return auth.response;
  const client = await createServiceRoleSupabaseClient();
  const { data: session } = await findPublicSessionByPin(
    client,
    (await context.params).pin,
  );
  if (!session)
    return privateNoStoreJson({ error: "SESSION_NOT_FOUND" }, { status: 404 });
  if (auth.claims.sessionId !== session.id)
    return privateNoStoreJson(
      { error: "TOKEN_SESSION_MISMATCH" },
      { status: 403 },
    );
  const result = await loadPersonalAnswerReview(
    client,
    session,
    auth.claims.userId,
  );
  return result.ok
    ? privateNoStoreJson({ review: result.review })
    : privateNoStoreJson({ error: result.error }, { status: result.status });
}
