import { expect, test } from "@playwright/test";

test("home page loads and shows the project title", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Bishvil Yehuda Quiz/i }),
  ).toBeVisible();
});
