import { expect, test } from "playwright/test";

test("unauthenticated chat access redirects away from the protected route", async ({ page }) => {
  await page.goto("/chat");
  await expect(page).not.toHaveURL(/\/chat(?:\/.*)?$/);
});
