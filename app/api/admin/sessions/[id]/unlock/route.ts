import { z } from "zod";
import { requireRole } from "@/src/lib/auth/server-auth";
import { privateNoStoreJson } from "@/src/lib/http/responses";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/server";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;
  const parsed = z
    .object({ participantId: z.string().uuid(), questionId: z.string().uuid() })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return privateNoStoreJson({ error: "INVALID_REQUEST" }, { status: 400 });
  const client = await createServiceRoleSupabaseClient();
  const { data, error } = await client.rpc("unlock_quiz_station", {
    p_session_id: (await context.params).id,
    p_participant_id: parsed.data.participantId,
    p_question_id: parsed.data.questionId,
    p_actor: auth.claims.userId,
  });
  return privateNoStoreJson(
    error
      ? { error: "UNLOCK_FAILED" }
      : data === "unlocked"
        ? { status: data }
        : { error: data },
    { status: error ? 500 : data === "unlocked" ? 200 : 409 },
  );
}
