import postgres from "postgres";

const localDatabaseUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export function getTestPostgres() {
  return postgres(process.env.DIRECT_URL ?? localDatabaseUrl, {
    max: 1,
    idle_timeout: 1,
    max_lifetime: 1,
  });
}

export const SEED_QUIZ_ID = "33333333-3333-4333-8333-333333333333";
export const SEED_HOST_ID = "11111111-1111-4111-8111-111111111111";
export const SEED_ADMIN_ID = "22222222-2222-4222-8222-222222222222";

/**
 * Per-fixture random ordinal in a high range so concurrent test files
 * don't collide on the (quiz_id, ordinal) unique index. The seed quiz
 * has only a handful of authored questions so anything > 1_000 is safe.
 */
function nextOrdinal(): number {
  return 10_000 + Math.floor(Math.random() * 1_000_000);
}

function uuid(): string {
  // Avoid node:crypto.randomUUID — vitest's jsdom env can mask it. Build a
  // v4-shaped UUID from Math.random; uniqueness is fine for test fixtures.
  const hex = (length: number): string =>
    Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-8${hex(3)}-${hex(12)}`;
}

interface CreatedFixtures {
  sessionId: string;
  questionId: string;
  participantId: string;
  pin: string;
}

/**
 * Seeds an isolated session + question + participant into the local DB so
 * an integration test can exercise the cron / answer paths without
 * stepping on the project-wide seed (PIN 123456).
 */
export async function seedSyncFixtures(
  sql: ReturnType<typeof getTestPostgres>,
  options: { gameMode?: "sync" | "async" } = {},
): Promise<CreatedFixtures> {
  const sessionId = uuid();
  const questionId = uuid();
  const participantId = uuid();
  const ordinal = nextOrdinal();
  // Random PIN avoids cross-process collisions in vitest when multiple
  // test files seed sessions concurrently. The 6-digit space (1M) gives
  // collision probability ~1e-6 per fixture pair.
  const pin = String(Math.floor(100_000 + Math.random() * 900_000));
  const gameMode = options.gameMode ?? "sync";

  await sql`
    insert into public.sessions (id, quiz_id, host_id, pin, status, game_mode, auto_reveal)
    values (
      ${sessionId}::uuid,
      ${SEED_QUIZ_ID}::uuid,
      ${SEED_HOST_ID}::uuid,
      ${pin},
      'live',
      ${gameMode},
      ${gameMode === "async"}
    )
  `;

  await sql`
    insert into public.questions (id, quiz_id, ordinal, type, prompt, options, correct_ids, time_seconds, points)
    values (
      ${questionId}::uuid,
      ${SEED_QUIZ_ID}::uuid,
      ${ordinal},
      'single',
      'Test prompt',
      ${JSON.stringify([
        { id: "a", text: "Option A" },
        { id: "b", text: "Option B" },
      ])}::jsonb,
      ARRAY['a']::text[],
      25,
      1500
    )
  `;

  // Create the participant via auth.users so RLS-aware tests work, but for
  // pure DB integration tests we only need the session_participants row.
  await sql`
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (
      ${participantId}::uuid,
      '00000000-0000-0000-0000-000000000000'::uuid,
      'authenticated',
      'authenticated',
      ${`participant-${ordinal}@test.local`},
      '',
      now(),
      ${JSON.stringify({
        role: "participant",
        session_id: sessionId,
        participant_id: participantId,
      })}::jsonb,
      '{}'::jsonb,
      now(),
      now()
    )
    on conflict (id) do nothing
  `;

  await sql`
    insert into public.session_participants (id, session_id, first_name, last_name, phone)
    values (
      ${participantId}::uuid,
      ${sessionId}::uuid,
      'Test',
      'Participant',
      ${`+97250${ordinal.toString().padStart(7, "0")}`}
    )
  `;

  return { sessionId, questionId, participantId, pin };
}

export async function cleanupFixtures(
  sql: ReturnType<typeof getTestPostgres>,
  sessionId: string,
  questionId?: string,
  participantId?: string,
): Promise<void> {
  // Sessions cascade-delete session_participants/answers/state rows, but
  // questions live under the quiz, not the session. Delete them by id so
  // the (quiz_id, ordinal) unique index stays clean across re-runs.
  await sql`delete from public.sessions where id = ${sessionId}::uuid`;
  if (questionId) {
    await sql`delete from public.questions where id = ${questionId}::uuid`;
  }
  if (participantId) {
    await sql`delete from auth.users where id = ${participantId}::uuid`;
  }
}
