import { type NextRequest } from "next/server";

import {
  decodeParticipantAccessTokenUnsafe,
  hasExpectedParticipantScope,
} from "@/src/lib/auth/claims";
import { normalizePhone } from "@/src/lib/auth/phone";
import { participantJoinRequestSchema } from "@/src/lib/auth/validation";
import { noStoreJson } from "@/src/lib/http/responses";
import { writeLog } from "@/src/lib/logging";
import {
  createServerSupabaseClient,
  createServiceRoleSupabaseClient,
} from "@/src/lib/supabase/server";
import type { Json } from "@/src/lib/supabase/database.types";

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

interface GoogleParticipantProfile {
  email: string;
  identityKey: string;
  firstName: string;
  lastName: string;
}

export async function POST(
  request: NextRequest,
  context: ParticipantJoinRouteContext,
) {
  const { pin } = await context.params;
  const parsedBody = participantJoinRequestSchema.safeParse(
    await request.json(),
  );

  if (!parsedBody.success) {
    return noStoreJson<ParticipantJoinResponseBody>(
      {
        error: "INVALID_REQUEST",
        message:
          "Participant phone, Google identity, and optional unit/team are invalid.",
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

  const normalizedPhone = normalizePhone(parsedBody.data.phone);
  const identityProvider = parsedBody.data.identityProvider;
  const googleProfile = await readGoogleProfileAndClearSession(
    browserScopedSupabase,
  );

  if (!googleProfile) {
    return noStoreJson<ParticipantJoinResponseBody>(
      {
        error: "AUTH_FAILED",
        message: "Google authentication is required to join with Google.",
      },
      { status: 401 },
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
  const resolvedFirstName = googleProfile.firstName;
  const resolvedLastName = googleProfile.lastName;
  const googleEmail = googleProfile.email;
  const identityKey = googleProfile.identityKey;
  const profileFields = {
    firstName: resolvedFirstName,
    lastName: resolvedLastName,
    phone: normalizedPhone,
    email: googleEmail,
    unit: parsedBody.data.unit ?? null,
    team: parsedBody.data.team ?? null,
  } satisfies Record<string, string | null>;

  const { data: participant, error: participantError } = await serviceSupabase
    .from("session_participants")
    .insert({
      id: participantId,
      session_id: session.id,
      first_name: resolvedFirstName,
      last_name: resolvedLastName,
      phone: normalizedPhone,
      identity_provider: identityProvider,
      identity_key: identityKey,
      profile_fields: profileFields as Json,
      unit: parsedBody.data.unit ?? null,
      team: parsedBody.data.team ?? null,
    })
    .select("id, session_id")
    .maybeSingle();

  if (participantError || !participant) {
    const { data: existingParticipant } = await serviceSupabase
      .from("session_participants")
      .select("id, session_id")
      .eq("session_id", session.id)
      .eq("identity_provider", identityProvider)
      .eq("identity_key", identityKey)
      .maybeSingle();

    if (existingParticipant) {
      await serviceSupabase
        .from("session_participants")
        .update({
          identity_provider: identityProvider,
          identity_key: identityKey,
          profile_fields: profileFields as Json,
        })
        .eq("id", existingParticipant.id);
    }

    if (!existingParticipant) {
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

    return finishParticipantJoin({
      browserScopedSupabase,
      serviceSupabase,
      authUserId: participantId,
      refreshToken: authData.session.refresh_token,
      participant: existingParticipant,
    });
  }

  return finishParticipantJoin({
    browserScopedSupabase,
    serviceSupabase,
    authUserId: participantId,
    refreshToken: authData.session.refresh_token,
    participant,
  });
}

async function readGoogleProfileAndClearSession(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
): Promise<GoogleParticipantProfile | null> {
  const { data, error } = await supabase.auth.getUser();
  const email = data.user?.email?.trim().toLowerCase() ?? null;
  const googleIdentity =
    data.user?.identities?.find((identity) => identity.provider === "google") ??
    null;

  if (error || !email || !googleIdentity) {
    return null;
  }

  const identityKey = readGoogleIdentityKey(googleIdentity);

  if (!identityKey) {
    writeLog({
      level: "warn",
      message:
        "Google identity is missing provider subject; falling back to email identity key",
      context: { userId: data.user?.id ?? null },
    });
  }

  await supabase.auth.signOut();
  return {
    email,
    identityKey: identityKey ?? email,
    ...deriveGoogleParticipantName(data.user?.user_metadata, email),
  };
}

function readGoogleIdentityKey(identity: {
  id: string;
  identity_id?: string;
  identity_data?: Record<string, unknown>;
}): string | null {
  return (
    readMetadataString(identity.identity_data?.sub) ??
    readMetadataString(identity.identity_id) ??
    readMetadataString(identity.id)
  );
}

function deriveGoogleParticipantName(
  metadata: unknown,
  email: string,
): { firstName: string; lastName: string } {
  const record =
    typeof metadata === "object" && metadata !== null
      ? (metadata as Record<string, unknown>)
      : {};
  const givenName = readMetadataString(record.given_name);
  const familyName = readMetadataString(record.family_name);

  if (givenName && familyName) {
    return { firstName: givenName, lastName: familyName };
  }

  const fullName =
    readMetadataString(record.full_name) ?? readMetadataString(record.name);
  const parts = fullName?.split(/\s+/).filter(Boolean) ?? [];

  return {
    firstName: givenName ?? parts[0] ?? email.split("@")[0] ?? "משתתף",
    lastName: familyName ?? (parts.slice(1).join(" ") || "Google"),
  };
}

function readMetadataString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

async function finishParticipantJoin(args: {
  browserScopedSupabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  serviceSupabase: Awaited<ReturnType<typeof createServiceRoleSupabaseClient>>;
  authUserId: string;
  refreshToken: string;
  participant: { id: string; session_id: string };
}) {
  const { error: metadataError } =
    await args.serviceSupabase.auth.admin.updateUserById(args.authUserId, {
      app_metadata: {
        role: "participant",
        session_id: args.participant.session_id,
        participant_id: args.participant.id,
      },
    });

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
    await args.browserScopedSupabase.auth.refreshSession({
      refresh_token: args.refreshToken,
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

  const claims = decodeParticipantAccessTokenUnsafe(accessToken);

  if (
    !hasExpectedParticipantScope(
      claims,
      args.participant.session_id,
      args.participant.id,
    )
  ) {
    return noStoreJson<ParticipantJoinResponseBody>(
      {
        error: "TOKEN_SCOPE_FAILED",
        message: "Participant token is missing required session scope.",
      },
      { status: 500 },
    );
  }

  return noStoreJson<ParticipantJoinResponseBody>({
    participantId: args.participant.id,
    sessionId: args.participant.session_id,
    accessToken,
    tokenType: "bearer",
  });
}
