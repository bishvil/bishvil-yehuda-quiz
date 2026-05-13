import { requireRole } from "@/src/lib/auth/server-auth";
import { privateNoStoreJson } from "@/src/lib/http/responses";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/server";
import type {
  AdminParticipantAnalyticsResponse,
  AdminParticipantAnalyticsRow,
  AdminParticipantParticipation,
  AdminParticipantProfileFields,
} from "@/src/lib/admin/api-types";
import type { Json } from "@/src/lib/supabase/database.types";

interface AdminParticipantsErrorBody {
  error: "READ_FAILED";
  message: string;
}

interface SessionRow {
  id: string;
  pin: string;
  quiz_id: string;
  status: AdminParticipantParticipation["sessionStatus"];
  game_mode: AdminParticipantParticipation["gameMode"];
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  quizzes: { title: string } | null;
}

interface ParticipantRow {
  id: string;
  session_id: string;
  first_name: string;
  last_name: string;
  phone: string;
  identity_provider: string | null;
  identity_key: string | null;
  profile_fields: Json | null;
  joined_at: string;
  display_name: string;
}

interface ScoreRow {
  participant_id: string;
  total_score: number;
  correct_count: number;
}

interface AnswerRow {
  participant_id: string;
  is_correct: boolean;
}

export async function GET() {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  // User-level analytics group by identity_provider + identity_key. Raw
  // session_participants rows stay session-scoped participations.
  // See docs/proposals/participant-identity-analytics.md for the tradeoffs.
  const supabase = await createServiceRoleSupabaseClient();
  const { data: sessionData, error: sessionError } = await supabase
    .from("sessions")
    .select(
      "id, pin, quiz_id, status, game_mode, started_at, ended_at, created_at, quizzes(title)",
    )
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(200);

  if (sessionError) {
    return privateNoStoreJson<AdminParticipantsErrorBody>(
      { error: "READ_FAILED", message: "Failed to list sessions." },
      { status: 500 },
    );
  }

  const sessions = (sessionData ?? []) as unknown as SessionRow[];
  const sessionIds = sessions.map((session) => session.id);
  if (sessionIds.length === 0) {
    return privateNoStoreJson<AdminParticipantAnalyticsResponse>({
      participants: [],
    });
  }

  const [
    { data: participantData, error: participantError },
    { data: scoreData, error: scoreError },
    { data: answerData, error: answerError },
  ] = await Promise.all([
    supabase
      .from("session_participants")
      .select(
        "id, session_id, first_name, last_name, phone, identity_provider, identity_key, profile_fields, joined_at, display_name",
      )
      .in("session_id", sessionIds),
    supabase
      .from("participant_scores")
      .select("participant_id, total_score, correct_count")
      .in("session_id", sessionIds),
    supabase
      .from("answers")
      .select("participant_id, is_correct")
      .in("session_id", sessionIds),
  ]);

  if (participantError || scoreError || answerError) {
    return privateNoStoreJson<AdminParticipantsErrorBody>(
      { error: "READ_FAILED", message: "Failed to load participant data." },
      { status: 500 },
    );
  }

  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const scoreByParticipant = new Map(
    ((scoreData ?? []) as ScoreRow[]).map((score) => [
      score.participant_id,
      score,
    ]),
  );
  const answerStatsByParticipant = new Map<
    string,
    { total: number; correct: number }
  >();

  for (const answer of (answerData ?? []) as AnswerRow[]) {
    const stats = answerStatsByParticipant.get(answer.participant_id) ?? {
      total: 0,
      correct: 0,
    };
    stats.total += 1;
    if (answer.is_correct) stats.correct += 1;
    answerStatsByParticipant.set(answer.participant_id, stats);
  }

  const participations = ((participantData ?? []) as ParticipantRow[])
    .map((participant) => {
      const session = sessionById.get(participant.session_id);
      if (!session) return null;
      const score = scoreByParticipant.get(participant.id);
      const answerStats = answerStatsByParticipant.get(participant.id) ?? {
        total: 0,
        correct: 0,
      };
      const profileFields = normalizeProfileFields(participant.profile_fields, {
        firstName: participant.first_name,
        lastName: participant.last_name,
        phone: participant.phone,
      });

      return {
        participantId: participant.id,
        sessionId: participant.session_id,
        quizId: session.quiz_id,
        quizTitle: session.quizzes?.title ?? "",
        pin: session.pin,
        sessionStatus: session.status,
        gameMode: session.game_mode,
        startedAt: session.started_at,
        endedAt: session.ended_at,
        joinedAt: participant.joined_at,
        firstName: participant.first_name,
        lastName: participant.last_name,
        phone: participant.phone,
        identityProvider: participant.identity_provider ?? "phone",
        identityKey: participant.identity_key ?? participant.phone,
        profileFields,
        totalScore: score?.total_score ?? 0,
        correctCount: score?.correct_count ?? answerStats.correct,
        answerCount: answerStats.total,
        accuracyPct:
          answerStats.total === 0
            ? 0
            : Math.round((answerStats.correct / answerStats.total) * 100),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => b.joinedAt.localeCompare(a.joinedAt));

  const participants = aggregateUniqueParticipants(participations);

  return privateNoStoreJson<AdminParticipantAnalyticsResponse>({
    participants,
  });
}

function aggregateUniqueParticipants(
  participations: Array<
    AdminParticipantParticipation & {
      identityProvider: string;
      identityKey: string;
    }
  >,
): AdminParticipantAnalyticsRow[] {
  const buckets = new Map<
    string,
    {
      identityProvider: string;
      identityKey: string;
      participations: AdminParticipantParticipation[];
    }
  >();

  for (const participation of participations) {
    const key = `${participation.identityProvider}:${participation.identityKey}`;
    const bucket = buckets.get(key) ?? {
      identityProvider: participation.identityProvider,
      identityKey: participation.identityKey,
      participations: [],
    };

    bucket.participations.push(toPublicParticipation(participation));
    buckets.set(key, bucket);
  }

  return Array.from(buckets.values())
    .map((bucket) => {
      const rows = [...bucket.participations].sort((a, b) =>
        b.joinedAt.localeCompare(a.joinedAt),
      );
      const latest = rows[0]!;
      const namesSeen = Array.from(
        new Set(
          rows
            .map((row) => `${row.firstName} ${row.lastName}`.trim())
            .filter(Boolean),
        ),
      );
      const totalScore = rows.reduce((sum, row) => sum + row.totalScore, 0);
      const answerCount = rows.reduce((sum, row) => sum + row.answerCount, 0);
      const correctCount = rows.reduce((sum, row) => sum + row.correctCount, 0);
      const participationCount = rows.length;

      return {
        identityProvider: bucket.identityProvider,
        identityKey: bucket.identityKey,
        displayName: namesSeen[0] ?? latest.phone,
        latestFirstName: latest.firstName,
        latestLastName: latest.lastName,
        latestPhone: latest.phone,
        namesSeen,
        profileFields: latest.profileFields,
        firstSeenAt: rows[rows.length - 1]!.joinedAt,
        lastSeenAt: latest.joinedAt,
        participationCount,
        totalScore,
        averageScore:
          participationCount === 0
            ? 0
            : Math.round(totalScore / participationCount),
        correctCount,
        answerCount,
        accuracyPct:
          answerCount === 0
            ? 0
            : Math.round((correctCount / answerCount) * 100),
        participations: rows,
      };
    })
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
}

function toPublicParticipation(
  row: AdminParticipantParticipation & {
    identityProvider: string;
    identityKey: string;
  },
): AdminParticipantParticipation {
  return {
    participantId: row.participantId,
    sessionId: row.sessionId,
    quizId: row.quizId,
    quizTitle: row.quizTitle,
    pin: row.pin,
    sessionStatus: row.sessionStatus,
    gameMode: row.gameMode,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    joinedAt: row.joinedAt,
    firstName: row.firstName,
    lastName: row.lastName,
    phone: row.phone,
    profileFields: row.profileFields,
    totalScore: row.totalScore,
    correctCount: row.correctCount,
    answerCount: row.answerCount,
    accuracyPct: row.accuracyPct,
  };
}

function normalizeProfileFields(
  raw: Json | null,
  fallback: AdminParticipantProfileFields,
): AdminParticipantProfileFields {
  if (!raw || Array.isArray(raw) || typeof raw !== "object") return fallback;

  const fields: AdminParticipantProfileFields = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") fields[key] = value;
    else if (value === null) fields[key] = null;
  }

  return { ...fallback, ...fields };
}
