import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import {
  LOCAL_TEST_ADMIN_EMAIL,
  LOCAL_TEST_PASSWORD,
} from "@/src/lib/constants";

test("old async history shows the latest played date after loading more than 50 games", async ({
  page,
}, testInfo) => {
  const sql = postgres(
    process.env.DIRECT_URL ??
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  );
  const quizId = randomUUID(),
    sessionId = randomUUID(),
    participantId = randomUUID(),
    questionId = randomUUID();
  const title = `דוח היסטורי מיום ראשון ${randomUUID().slice(0, 6)}`;
  try {
    await sql`insert into public.quizzes(id,owner_id,brand_id,title,default_game_mode) values(${quizId}::uuid,'22222222-2222-4222-8222-222222222222','yehuda',${title},'async')`;
    await sql`insert into public.questions(id,quiz_id,ordinal,type,prompt,options,correct_ids,points) values(${questionId}::uuid,${quizId}::uuid,1,'single','באיזו עיר הכותל?','[{"id":"a","text":"ירושלים"},{"id":"b","text":"חיפה"}]',array['a'],800)`;
    await sql`insert into public.sessions(id,quiz_id,pin,status,game_mode,created_at) values(${sessionId}::uuid,${quizId}::uuid,${String(100000 + Math.floor(Math.random() * 900000))},'scheduled','async','2026-05-17T09:10:00Z')`;
    await sql`insert into public.session_participants(id,session_id,first_name,last_name,phone,status) values(${participantId}::uuid,${sessionId}::uuid,'משתתף','היסטורי','+972500000099','completed')`;
    await sql`update public.session_participants set joined_at='2026-11-08T10:00:00Z' where id=${participantId}::uuid`;
    await sql`insert into public.answers(session_id,participant_id,question_id,selected_ids,is_correct,score,time_bonus,submitted_at) values(${sessionId}::uuid,${participantId}::uuid,${questionId}::uuid,array['a'],true,800,0,'2026-11-08T10:05:00Z')`;
    await sql`insert into public.participant_scores(session_id,participant_id,total_score,correct_count) values(${sessionId}::uuid,${participantId}::uuid,800,1)`;
    for (let index = 0; index < 55; index++)
      await sql`insert into public.sessions(quiz_id,pin,status,game_mode,created_at) values(${quizId}::uuid,${String(700000 + index)},'ended','async',${new Date(Date.UTC(2099, 0, 1, 0, index))})`;
    expect(
      (
        await page.request.post("/api/auth/admin/signin", {
          data: {
            email: LOCAL_TEST_ADMIN_EMAIL,
            password: LOCAL_TEST_PASSWORD,
          },
        })
      ).ok(),
    ).toBeTruthy();
    await page.goto("/admin/results");
    await expect(page.getByRole("article")).toHaveCount(50);
    await expect(
      page.getByRole("article").filter({ hasText: "משתתף היסטורי" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "טעינת משחקים נוספים" }).click();
    const card = page.getByRole("article").filter({ hasText: "משתתף היסטורי" });
    await expect(card).toBeVisible();
    await expect(card).toContainText("תוצאות ביניים · משחק אסינכרוני");
    await expect(card).toContainText("פעילות אחרונה");
    await expect(card).toContainText("08.11.2026");
    await expect(card.locator("time")).toHaveAttribute(
      "datetime",
      "2026-11-08T10:05:00.000Z",
    );
    await expect(card).toContainText("800");
    await expect(card).toContainText(title);
    for (const width of [1366, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await card.scrollIntoViewIfNeeded();
      await page.evaluate(() => document.fonts.ready);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
      await card.screenshot({
        path: testInfo.outputPath(`legacy-results-${width}.png`),
      });
    }
    await card.getByRole("link", { name: /תוצאות מלאות/ }).click();
    await expect(page).toHaveURL(
      new RegExp(`/admin/quizzes/${quizId}/sessions/${sessionId}/results`),
    );
    await expect(page.getByText("משתתף היסטורי").first()).toBeVisible();
    await expect(page.getByText("800", { exact: true }).first()).toBeVisible();
  } finally {
    await sql`delete from public.sessions where quiz_id=${quizId}::uuid`;
    await sql`delete from public.questions where quiz_id=${quizId}::uuid`;
    await sql`delete from public.quizzes where id=${quizId}::uuid`;
    await sql.end();
  }
});
