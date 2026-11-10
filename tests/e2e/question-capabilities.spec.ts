import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import postgres from "postgres";
import { randomUUID } from "node:crypto";

test("participant completes content, an untimed open answer and a GPS station, then returns to results", async ({
  page,
  context,
}) => {
  const sql = postgres(
    process.env.DIRECT_URL ??
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  );
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const quizId = randomUUID(),
    sessionId = randomUUID(),
    pin = String(Math.floor(100000 + Math.random() * 900000));
  const email = `capabilities-${randomUUID()}@test.local`,
    password = "Test-Only-Password123!";
  let userId: string | undefined;
  try {
    const user = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: "participant", session_id: sessionId },
    });
    expect(user.error).toBeNull();
    userId = user.data.user!.id;
    await sql`insert into public.quizzes(id, owner_id, brand_id, title, default_game_mode)
      select ${quizId}::uuid, owner_id, brand_id, 'מסלול בדיקה', 'async' from public.quizzes where id = '33333333-3333-4333-8333-333333333333'::uuid`;
    await sql`insert into public.questions(quiz_id, ordinal, type, prompt, settings) values
      (${quizId}::uuid, 1, 'content', 'ברוכים הבאים למסלול. קראו והמשיכו.', '{}'),
      (${quizId}::uuid, 2, 'open', 'מהי בירת ישראל?', '{"timeLimitEnabled":false,"acceptedAnswers":["ירושלים"]}')`;
    await sql`insert into public.questions(quiz_id, ordinal, type, prompt, options, correct_ids, settings) values
      (${quizId}::uuid, 3, 'single', 'הגעתם לתחנה. בחרו ירושלים.', '[{"id":"a","text":"ירושלים"},{"id":"b","text":"חיפה"}]', array['a'], '{"timeLimitEnabled":false,"locationGate":{"lat":31.5,"lng":34.9,"radiusM":100}}')`;
    await sql`insert into public.sessions(id, quiz_id, pin, game_mode, status, auto_reveal) values (${sessionId}::uuid, ${quizId}::uuid, ${pin}, 'async', 'live', true)`;
    await sql`insert into public.session_participants(id, session_id, first_name, last_name, phone) values (${userId}::uuid, ${sessionId}::uuid, 'משתתף', 'בדיקה', '+972500000000')`;
    const cookies: Array<{ name: string; value: string }> = [];
    const auth = createServerClient(
      url,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => [],
          setAll: (values) => {
            cookies.push(...values);
          },
        },
      },
    );
    expect(
      (await auth.auth.signInWithPassword({ email, password })).error,
    ).toBeNull();
    await context.addCookies(
      cookies.map((cookie) => ({
        ...cookie,
        domain: "localhost",
        path: "/",
        sameSite: "Lax" as const,
      })),
    );
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({
      latitude: 32,
      longitude: 34.9,
      accuracy: 5,
    });
    await page.goto(`/${pin}/play`);
    await expect(
      page.getByText("ברוכים הבאים למסלול. קראו והמשיכו."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "שליחת תשובה" })).toHaveCount(
      0,
    );
    await page.getByRole("button", { name: "לתחנה הבאה" }).click();
    await expect(page.getByText("מהי בירת ישראל?")).toBeVisible();
    await expect(page.getByLabel(/נותר זמן/)).toHaveCount(0);
    await page
      .getByRole("textbox", { name: "התשובה שלכם" })
      .fill("יְרוּשָׁלַיִם");
    await page.getByRole("button", { name: "שליחת תשובה" }).click();
    await expect(page.getByText("מצוין!", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "לתחנה הבאה" }).click();
    await expect(
      page.getByRole("heading", { name: "התחנה נעולה לפי מיקום" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "בדיקת מיקום ופתיחת התחנה" })
      .click();
    await expect(page.getByRole("status")).toContainText("יש להתקרב");
    await context.setGeolocation({
      latitude: 31.5,
      longitude: 34.9,
      accuracy: 5,
    });
    await page
      .getByRole("button", { name: "בדיקת מיקום ופתיחת התחנה" })
      .click();
    await expect(page.getByText("הגעתם לתחנה. בחרו ירושלים.")).toBeVisible();
    await page.reload();
    await expect(page.getByText("הגעתם לתחנה. בחרו ירושלים.")).toBeVisible();
    await page.getByRole("button", { name: /ירושלים/ }).click();
    await page.getByRole("button", { name: "שליחת תשובה" }).click();
    await expect(page.getByText("מצוין!", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "סיום וצפייה בתוצאה" }).click();
    await expect(page).toHaveURL(new RegExp(`/${pin}/result$`));
    await expect(page.getByText("100%", { exact: true })).toBeVisible();
    await page.goto(`/${pin}/play`);
    await expect(page).toHaveURL(new RegExp(`/${pin}/result$`));
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText("100%", { exact: true })).toBeVisible();
    await page.screenshot({
      path: "/tmp/quiz-capabilities-mobile.png",
      fullPage: true,
    });
  } finally {
    await sql`delete from public.sessions where id = ${sessionId}::uuid`;
    await sql`delete from public.quizzes where id = ${quizId}::uuid`;
    if (userId) await service.auth.admin.deleteUser(userId);
    await sql.end();
  }
});

test("editor persists open answers, untimed questions, map labels and location gates", async ({
  page,
}) => {
  const sql = postgres(
    process.env.DIRECT_URL ??
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  );
  const quizId = randomUUID();
  try {
    const login = await page.request.post("/api/auth/admin/signin", {
      data: { email: "admin@bishvil.test", password: "Password123!" },
    });
    expect(login.ok()).toBe(true);
    await sql`insert into public.quizzes(id, owner_id, brand_id, title, default_game_mode)
      select ${quizId}::uuid, owner_id, brand_id, 'עורך יכולות חדשות', 'async' from public.quizzes where id = '33333333-3333-4333-8333-333333333333'::uuid`;
    const create = await page.request.post(
      `/api/admin/quizzes/${quizId}/questions`,
      {
        data: {
          ordinal: 1,
          type: "single",
          prompt: "שאלת בדיקה",
          options: [
            { id: "a", text: "א" },
            { id: "b", text: "ב" },
          ],
          correctIds: ["a"],
        },
      },
    );
    expect(create.ok()).toBe(true);
    const id = (await create.json()).question.id;
    await page.route("https://nominatim.openstreetmap.org/search?**", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          { place_id: 7, name: "ירושלים", lat: "31.7767", lon: "35.2345" },
        ]),
      }),
    );
    await page.goto(`/admin/quizzes/${quizId}`);
    await page.getByTestId("type-pill-open").click();
    await page
      .getByRole("textbox", { name: /תשובות קבילות/ })
      .fill("ירושלים\nתל אביב");
    await page
      .getByRole("checkbox", { name: "ללא הגבלת זמן", exact: true })
      .check();
    await page
      .getByRole("checkbox", { name: "התחנה תיפתח רק בהגעה למקום" })
      .check();
    await expect(
      page.getByText(
        "יש לבחור מיקום. פתיחה לפי GPS תישמר רק אחרי בחירת נקודה.",
        { exact: true },
      ),
    ).toBeVisible();
    await page
      .getByRole("searchbox", { name: "חיפוש מקום במפה" })
      .fill("ירושלים");
    await page.getByRole("button", { name: "חיפוש", exact: true }).click();
    await page.getByRole("button", { name: "ירושלים", exact: true }).click();
    await expect
      .poll(
        async () =>
          (
            await (
              await page.request.get(`/api/admin/quizzes/${quizId}/questions`)
            ).json()
          ).questions[0].settings,
      )
      .toMatchObject({
        timeLimitEnabled: false,
        acceptedAnswers: ["ירושלים", "תל אביב"],
        locationGate: { radiusM: 100 },
      });
    await page.reload();
    await expect(
      page.getByRole("textbox", { name: /תשובות קבילות/ }),
    ).toHaveValue("ירושלים\nתל אביב");
    await expect(
      page.getByRole("checkbox", { name: "ללא הגבלת זמן", exact: true }),
    ).toBeChecked();
    await page.getByTestId("type-pill-map").click();
    await page
      .getByRole("combobox", { name: "רקע המפה" })
      .selectOption("streets");
    await page
      .getByRole("combobox", { name: "שמות יישובים" })
      .selectOption("medium");
    await expect
      .poll(
        async () =>
          (
            await (
              await page.request.get(`/api/admin/quizzes/${quizId}/questions`)
            ).json()
          ).questions.find((q: { id: string }) => q.id === id)?.map?.geo,
      )
      .toMatchObject({ baseStyle: "streets", labelLevel: "medium" });
    await page.reload();
    await expect(
      page.getByRole("combobox", { name: "שמות יישובים" }),
    ).toHaveValue("medium");
    await page.screenshot({
      path: "/tmp/quiz-editor-capabilities.png",
      fullPage: true,
    });
  } finally {
    await sql`delete from public.quizzes where id = ${quizId}::uuid`;
    await sql.end();
  }
});
