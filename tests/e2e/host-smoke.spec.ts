import { expect, test } from "@playwright/test";

import {
  LOCAL_TEST_HOST_EMAIL,
  LOCAL_TEST_PASSWORD,
  LOCAL_TEST_SESSION_PIN,
} from "@/src/lib/constants";

/**
 * Host dashboard smoke. Programmatically authenticates via the host sign-in
 * API (Wave 2 doesn't ship a host login page yet), then visits /host/[pin]
 * and asserts the live dashboard chrome renders without 401-redirecting.
 *
 * The test relies on the seeded host (host@bishvil.test) and the seeded
 * scheduled session at PIN 123456 from supabase/seed.sql.
 */
test("host can sign in and reach the live dashboard", async ({ page }) => {
  // Use page.request so the auth cookie set by /api/auth/host/signin lands
  // in the same browser context that subsequent page.goto navigations use.
  const signin = await page.request.post("/api/auth/host/signin", {
    data: {
      email: LOCAL_TEST_HOST_EMAIL,
      password: LOCAL_TEST_PASSWORD,
    },
  });

  expect(signin.status(), "host sign-in should succeed").toBe(200);
  const signinBody = await signin.json();
  expect(signinBody).toMatchObject({ role: "host" });

  await page.goto(`/host/${LOCAL_TEST_SESSION_PIN}`);

  // The dashboard renders an "תצוגת מדריך" eyebrow in the header — present
  // on both desktop and mobile layouts. Wait long enough for the first
  // /api/host/[pin]/live poll to land and replace the loading state.
  await expect(page.getByText("תצוגת מדריך").first()).toBeVisible({
    timeout: 15_000,
  });

  // The header pin echoes the route param.
  await expect(page.getByText(LOCAL_TEST_SESSION_PIN).first()).toBeVisible();

  // The primary CTA shows up — exact label depends on session status. For a
  // freshly-seeded scheduled session it's "הפעלת חידון", for a session that
  // has already been touched it could be "התחלת תחנה" or other states.
  // The control bar also surfaces "סיום החידון" so we lock to a non-end label.
  await expect(
    page
      .getByRole("button", {
        name: /הפעלת חידון|התחלת תחנה|חשיפת התשובה|לתחנה הבאה|החידון הסתיים/,
      })
      .first(),
  ).toBeVisible();
});
