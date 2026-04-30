import { expect, test } from "@playwright/test";

import { LOCAL_TEST_SESSION_PIN } from "@/src/lib/constants";

const PHONE = "0501234567";

function uniqueLastName(): string {
  const stamp = Date.now().toString(36);
  return `בדיקה_${stamp}`;
}

test("participant can fill PIN + profile and reach the lobby", async ({ page }) => {
  await page.goto(`/${LOCAL_TEST_SESSION_PIN}`);

  await expect(
    page.getByRole("heading", { name: "הצטרפות לחידון" }),
  ).toBeVisible();

  // First cell is pre-filled by the route param; verify all six are populated.
  const codeInputs = page.getByRole("group", { name: "קוד החידון" }).getByRole("textbox");
  await expect(codeInputs).toHaveCount(6);

  // Sanity: server already prefilled all six because the route param
  // contained a valid PIN. We don't rely on a specific pre-filled value;
  // the page constructs initial state from the route arg.
  for (let i = 0; i < LOCAL_TEST_SESSION_PIN.length; i += 1) {
    await expect(codeInputs.nth(i)).toHaveValue(LOCAL_TEST_SESSION_PIN[i] ?? "");
  }

  await page.getByLabel("מספר נייד").fill(PHONE);
  await page.getByLabel("שם פרטי").fill("נועה");
  await page.getByLabel("שם משפחה").fill(uniqueLastName());

  const submit = page.getByRole("button", { name: /הצטרפות לחידון/ });
  await expect(submit).toBeEnabled();

  await submit.click();

  await page.waitForURL(`**/${LOCAL_TEST_SESSION_PIN}/lobby`, {
    timeout: 15_000,
  });

  await expect(
    page.getByText(/ממתינים למדריך|מוכנים להתחיל/),
  ).toBeVisible();
});
