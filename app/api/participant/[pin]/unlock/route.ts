import { z } from "zod";
import { requireRole } from "@/src/lib/auth/server-auth";
import { privateNoStoreJson } from "@/src/lib/http/responses";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/server";
import { findActiveSessionByPin } from "@/src/lib/sessions/lookup";
const schema = z.object({
  questionId: z.string().uuid(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().min(0),
  measuredAt: z.string().datetime(),
});
export async function POST(
  request: Request,
  context: { params: Promise<{ pin: string }> },
) {
  const auth = await requireRole("participant");
  if (!auth.ok) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return privateNoStoreJson({ error: "INVALID_REQUEST" }, { status: 400 });
  const client = await createServiceRoleSupabaseClient();
  const { data: session } = await findActiveSessionByPin(
    client,
    (await context.params).pin,
  );
  if (!session || auth.claims.sessionId !== session.id)
    return privateNoStoreJson({ error: "SESSION_NOT_FOUND" }, { status: 404 });
  const { data, error } = await client.rpc("unlock_quiz_station", {
    p_session_id: session.id,
    p_participant_id: auth.claims.userId,
    p_question_id: parsed.data.questionId,
    p_lat: parsed.data.lat,
    p_lng: parsed.data.lng,
    p_accuracy: parsed.data.accuracy,
    p_measured_at: parsed.data.measuredAt,
  });
  if (error)
    return privateNoStoreJson({ error: "UNLOCK_FAILED" }, { status: 500 });
  return privateNoStoreJson(
    data === "unlocked" ? { status: data } : { error: data },
    { status: data === "unlocked" ? 200 : 409 },
  );
}
