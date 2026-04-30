import { type NextRequest } from "next/server";

import {
  decodeParticipantAccessToken,
  hasExpectedParticipantScope,
} from "@/src/lib/auth/claims";
import { participantJoinRequestSchema } from "@/src/lib/auth/validation";
import { noStoreJson } from "@/src/lib/http/responses";
import { writeLog } from "@/src/lib/logging";
import {
  createServerSupabaseClient,
  createServiceRoleSupabaseClient,
} from "@/src/lib/supabase/server";

interface ParticipantJoinRouteContext {
  params: Promise<{
    pin: string;
  }>;
}

interface ParticipantJoinSuccessBody {
  participantId: string;
  sessionId: string;
  accessToken: string;
  tokenType: "bearer";
}

interface ParticipantJoinErrorBody {
  error:
    | "INVALID_REQUEST"
    | "SESSION_NOT_FOUND"
    | "AUTH_FAILED"
    | "PARTICIPANT_CREATE_FAILED"
    | "TOKEN_SCOPE_FAILED";
  message: string;
}

type ParticipantJoinResponseBody =
  | ParticipantJoinSuccessBody
  | ParticipantJoinErrorBody;

export async function POST(
  request: NextRequest,
  context: ParticipantJoinRouteContext,
) {
  const { pin } = await context.params;
  const parsedBody = participantJoinRequestSchema.safeParse(await request.json());

  if (!parsedBody.success) {
    return noStoreJson<ParticipantJoinResponseBody>(
      {
        error: "INVALID_REQUEST",
        message: "Participant name, phone, and optional unit/team are invalid.",
      },
      { status: 400 },
    );
  }

  const browserScopedSupabase = await createServerSupabaseClient();
  const serviceSupabase = await createServiceRoleSupabaseClient();

  const { data: session, error: sessionError } = await serviceSupabase
    .from("sessions")
    .select("id")
    .eq("pin", pin)
    .in("status", ["scheduled", "live"])
    .maybeSingle();

  if (sessionError || !session) {
    return noStoreJson<ParticipantJoinResponseBody>(
      {
        error: "SESSION_NOT_FOUND",
        message: "No joinable session exists for this PIN.",
      },
      { status: 404 },
    );
  }

  const { data: authData, error: authError } =
    await browserScopedSupabase.auth.signInAnonymously();

  if (authError || !authData.user || !authData.session) {
    writeLog({
      level: "error",
      message: "Anonymous participant sign-in failed",
      context: { pin },
    });

    return noStoreJson<ParticipantJoinResponseBody>(
      {
        error: "AUTH_FAILED",
        message: "Could not create participant authentication session.",
      },
      { status: 500 },
    );
  }

  const participantId = authData.user.id;
  const { data: participant, error: participantError } = await serviceSupabase
    .from("session_participants")
    .insert({
      id: participantId,
      session_id: session.id,
      first_name: parsedBody.data.firstName,
      last_name: parsedBody.data.lastName,
      phone: parsedBody.data.phone,
      unit: parsedBody.data.unit ?? null,
      team: parsedBody.data.team ?? null,
    })
    .select("id, session_id")
    .single();

  if (participantError || !participant) {
    writeLog({
      level: "error",
      message: "Participant row creation failed",
      context: {
        pin,
        sessionId: session.id,
        error: participantError?.message ?? null,
      },
    });

    return noStoreJson<ParticipantJoinResponseBody>(
      {
        error: "PARTICIPANT_CREATE_FAILED",
        message: "Could not join this session.",
      },
      { status: 409 },
    );
  }

  const { error: metadataError } = await serviceSupabase.auth.admin.updateUserById(
    participant.id,
    {
      app_metadata: {
        role: "participant",
        session_id: participant.session_id,
        participant_id: participant.id,
      },
    },
  );

  if (metadataError) {
    return noStoreJson<ParticipantJoinResponseBody>(
      {
        error: "AUTH_FAILED",
        message: "Could not scope participant token.",
      },
      { status: 500 },
    );
  }

  const { data: refreshedData, error: refreshError } =
    await browserScopedSupabase.auth.refreshSession({
      refresh_token: authData.session.refresh_token,
    });

  const accessToken = refreshedData.session?.access_token;

  if (refreshError || !accessToken) {
    return noStoreJson<ParticipantJoinResponseBody>(
      {
        error: "AUTH_FAILED",
        message: "Could not refresh participant token.",
      },
      { status: 500 },
    );
  }

  const claims = decodeParticipantAccessToken(accessToken);

  if (!hasExpectedParticipantScope(claims, participant.session_id, participant.id)) {
    return noStoreJson<ParticipantJoinResponseBody>(
      {
        error: "TOKEN_SCOPE_FAILED",
        message: "Participant token is missing required session scope.",
      },
      { status: 500 },
    );
  }

  return noStoreJson<ParticipantJoinResponseBody>({
    participantId: participant.id,
    sessionId: participant.session_id,
    accessToken,
    tokenType: "bearer",
  });
}
