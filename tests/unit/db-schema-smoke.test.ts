import postgres from "postgres";
import { describe, expect, it } from "vitest";

const localDatabaseUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const applicationTables = [
  "quizzes",
  "questions",
  "sessions",
  "session_participants",
  "question_session_state",
  "participant_question_progress",
  "answers",
  "participant_scores",
] as const;

type ApplicationTable = (typeof applicationTables)[number];

interface CountRow {
  count: number;
}

const countQueryByTable: Record<ApplicationTable, string> = {
  quizzes: 'select count(*)::int as count from public."quizzes"',
  questions: 'select count(*)::int as count from public."questions"',
  sessions: 'select count(*)::int as count from public."sessions"',
  session_participants:
    'select count(*)::int as count from public."session_participants"',
  question_session_state:
    'select count(*)::int as count from public."question_session_state"',
  participant_question_progress:
    'select count(*)::int as count from public."participant_question_progress"',
  answers: 'select count(*)::int as count from public."answers"',
  participant_scores:
    'select count(*)::int as count from public."participant_scores"',
};

describe("database schema smoke", () => {
  it("can count every application table on the local Supabase stack", async () => {
    const sql = postgres(process.env.DIRECT_URL ?? localDatabaseUrl, {
      max: 1,
      idle_timeout: 1,
    });

    try {
      await Promise.all(
        applicationTables.map(async (tableName) => {
          const rows = await sql.unsafe<CountRow[]>(countQueryByTable[tableName]);

          expect(rows).toHaveLength(1);
          expect(rows[0]?.count).toBeGreaterThanOrEqual(0);
        }),
      );
    } finally {
      await sql.end();
    }
  });
});
