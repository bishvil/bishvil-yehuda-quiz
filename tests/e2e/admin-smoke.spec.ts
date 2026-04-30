import { expect, test } from "@playwright/test";
import postgres from "postgres";

import {
  LOCAL_TEST_ADMIN_EMAIL,
  LOCAL_TEST_PASSWORD,
} from "@/src/lib/constants";

const localDatabaseUrl =
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function getE2ePostgres() {
  return postgres(process.env.DIRECT_URL ?? localDatabaseUrl, {
    max: 1,
    idle_timeout: 1,
    max_lifetime: 1,
  });
}

/**
 * Smoke test for the admin authoring flow:
 *   sign in -> quiz list -> create quiz -> land on editor ->
 *   add a question -> see auto-save indicator -> launch session ->
 *   sessions list shows the new PIN.
 *
 * The quiz + sessions are torn down at the end. Auth uses the seeded
 * local admin (LOCAL_TEST_ADMIN_EMAIL).
 */
test("admin can author a quiz, add a question, and launch a session", async ({
  page,
}) => {
  test.setTimeout(60_000);

  const sql = getE2ePostgres();
  const captured: { quizIds: string[]; sessionIds: string[] } = {
    quizIds: [],
    sessionIds: [],
  };

  try {
    const signin = await page.request.post("/api/auth/admin/signin", {
      data: {
        email: LOCAL_TEST_ADMIN_EMAIL,
        password: LOCAL_TEST_PASSWORD,
      },
    });
    expect(signin.status(), "admin sign-in should succeed").toBe(200);

    await page.goto("/admin/quizzes");
    await expect(
      page.getByRole("heading", { name: /החידונים שלי|אין חידונים/ }).first(),
    ).toBeVisible({ timeout: 15_000 });

    const createButton = page
      .getByTestId("admin-create-quiz")
      .or(page.getByRole("button", { name: /חידון חדש|צור חידון/ }))
      .first();
    await expect(createButton).toBeEnabled({ timeout: 10_000 });
    await createButton.click();

    await page.waitForURL(/\/admin\/quizzes\/[^/]+$/, { timeout: 15_000 });
    const titleField = page.getByTestId("admin-quiz-title");
    await expect(titleField).toBeVisible({ timeout: 15_000 });

    const url = page.url();
    const quizIdMatch = /\/admin\/quizzes\/([^/?#]+)/.exec(url);
    expect(quizIdMatch, `quiz id must appear in url: ${url}`).not.toBeNull();
    const quizId = quizIdMatch![1]!;
    captured.quizIds.push(quizId);

    const stamped = `E2E test ${Date.now().toString(36)}`;
    await titleField.fill(stamped);

    const addStation = page.getByTestId("admin-add-question");
    await expect(addStation).toBeVisible();
    await addStation.click();

    const promptField = page.getByTestId("question-prompt");
    await expect(promptField).toBeVisible({ timeout: 10_000 });
    await promptField.fill("e2e prompt");

    await expect(page.getByText(/נשמר אוטומטית|שומר/).first()).toBeVisible({
      timeout: 15_000,
    });

    const launch = page.getByTestId("admin-launch-session");
    await expect(launch).toBeEnabled();
    await launch.click();

    await page.waitForURL(/\/admin\/quizzes\/[^/]+\/sessions$/, {
      timeout: 15_000,
    });

    const pinDisplay = page.getByTestId("admin-session-pin").first();
    await expect(pinDisplay).toBeVisible({ timeout: 15_000 });
    const pin = (await pinDisplay.textContent())?.trim() ?? "";
    expect(pin).toMatch(/^\d{6}$/);

    const rows = await sql<{ id: string; status: string; pin: string }[]>`
      select id, status, pin from public.sessions where pin = ${pin}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("scheduled");
    captured.sessionIds.push(rows[0]!.id);
  } finally {
    if (captured.sessionIds.length > 0) {
      await sql`delete from public.sessions where id = any(${captured.sessionIds}::uuid[])`;
    }
    if (captured.quizIds.length > 0) {
      await sql`delete from public.questions where quiz_id = any(${captured.quizIds}::uuid[])`;
      await sql`delete from public.quizzes where id = any(${captured.quizIds}::uuid[])`;
    }
    await sql.end();
  }
});
