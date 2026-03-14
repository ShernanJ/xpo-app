import { expect, test } from "playwright/test";

test("login page exposes labelled auth fields", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.locator("label").filter({ hasText: "Password" })).toBeVisible();

  const passwordInput = page.locator('input[autocomplete="current-password"]');
  await expect(passwordInput).toHaveAttribute("type", "password");

  await page.getByRole("button", { name: "Show password" }).click({ force: true });
  await expect(passwordInput).toHaveAttribute("type", "text");
});
