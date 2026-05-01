import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import postgres from "postgres";

import {
  LOCAL_TEST_HOST_EMAIL,
  LOCAL_TEST_PASSWORD,
} from "@/src/lib/constants";

const localDatabaseUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function getE2ePostgres() {
  return postgres(process.env.DIRECT_URL ?? localDatabaseUrl, {
    max: 1,
    idle_timeout: 1,
    max_lifetime: 1,
  });
}

function uniquePin(): string {
  return String(Math.floor(100_000 + Math.random() * 900_000));
}

test("host flow starts, reveals, and advances without partial mutation errors", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);

  const sql = getE2ePostgres();
  const quizId = randomUUID();
  const sessionId = randomUUID();
  const firstQuestionId = randomUUID();
  const secondQuestionId = randomUUID();
  const pin = uniquePin();

  try {
    await sql`
      insert into public.quizzes (id, owner_id, brand_id, title, default_game_mode)
      values (
        ${quizId}::uuid,
        '11111111-1111-4111-8111-111111111111'::uuid,
        'yehuda',
        'E2E host flow',
        'sync'
      )
    `;
    await sql`
      insert into public.sessions (id, quiz_id, host_id, pin, status, game_mode, auto_reveal)
      values (
        ${sessionId}::uuid,
        ${quizId}::uuid,
        '11111111-1111-4111-8111-111111111111'::uuid,
        ${pin},
        'scheduled',
        'sync',
        false
      )
    `;
    await sql`
      insert into public.questions (
        id, quiz_id, ordinal, type, prompt, options, correct_ids, time_seconds, points
      ) values
      (
        ${firstQuestionId}::uuid,
        ${quizId}::uuid,
        1,
        'single',
        'E2E first station',
        ${sql.json([
          { id: "a", text: "Correct" },
          { id: "b", text: "Distractor" },
        ])},
        ARRAY['a']::text[],
        10,
        1000
      ),
      (
        ${secondQuestionId}::uuid,
        ${quizId}::uuid,
        2,
        'single',
        'E2E second station',
        ${sql.json([
          { id: "a", text: "Next correct" },
          { id: "b", text: "Next distractor" },
        ])},
        ARRAY['a']::text[],
        10,
        1000
      )
    `;

    const signin = await page.request.post("/api/auth/host/signin", {
      data: {
        email: LOCAL_TEST_HOST_EMAIL,
        password: LOCAL_TEST_PASSWORD,
      },
    });
    expect(signin.status(), "host sign-in should succeed").toBe(200);

    await page.goto(`/host/${pin}`);
    await expect(page.getByText("תצוגת מדריך").first()).toBeVisible({
      timeout: 15_000,
    });

    const startSession = page.getByRole("button", { name: /הפעלת חידון/ }).first();
    await expect(startSession).toBeEnabled();
    await startSession.click();

    const startQuestion = page.getByRole("button", { name: /התחלת תחנה/ }).first();
    await expect(startQuestion).toBeEnabled({ timeout: 15_000 });
    await startQuestion.click();
    await expect(page.getByText("E2E first station").first()).toBeVisible({
      timeout: 15_000,
    });

    const join = await request.post(`/api/session/${pin}/join`, {
      data: {
        firstName: "נועה",
        lastName: `בדיקה_${Date.now().toString(36)}`,
        phone: `050${String(Date.now()).slice(-7)}`,
      },
    });
    expect(join.status(), "participant join should succeed").toBe(200);

    const answer = await request.post(`/api/session/${pin}/answer`, {
      data: {
        questionId: firstQuestionId,
        selectedIds: ["a"],
      },
    });
    const answerBody = await answer.json();
    expect(
      answer.status(),
      `participant answer should be accepted: ${JSON.stringify(answerBody)}`,
    ).toBe(200);

    await sql`
      update public.question_session_state
      set status = 'locked',
          deadline_at = now() - interval '1 second'
      where session_id = ${sessionId}::uuid
        and question_id = ${firstQuestionId}::uuid
    `;

    const reveal = page.getByRole("button", { name: /חשיפת התשובה/ }).first();
    await expect(reveal).toBeEnabled({ timeout: 15_000 });
    await reveal.click();
    await expect(page.getByRole("button", { name: /לתחנה הבאה/ }).first()).toBeEnabled({
      timeout: 15_000,
    });

    await page.getByRole("button", { name: /לתחנה הבאה/ }).first().click();
    await expect(page.getByText("E2E second station").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/אירעה שגיאה|לא ניתן|שגיאה/)).toHaveCount(0);

    const [session] = await sql<{ current_question_id: string; status: string }[]>`
      select current_question_id, status
      from public.sessions
      where id = ${sessionId}::uuid
    `;
    expect(session).toMatchObject({
      current_question_id: secondQuestionId,
      status: "live",
    });
  } finally {
    await sql`
      delete from auth.users
      where raw_app_meta_data->>'session_id' = ${sessionId}
    `;
    await sql`delete from public.sessions where id = ${sessionId}::uuid`;
    await sql`delete from public.questions where id in (${firstQuestionId}::uuid, ${secondQuestionId}::uuid)`;
    await sql`delete from public.quizzes where id = ${quizId}::uuid`;
    await sql.end();
  }
});
