import { expect, test } from "playwright/test";

test("login page exposes labelled auth fields", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.locator("label").filter({ hasText: "Password" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send code" })).toBeVisible();
});
