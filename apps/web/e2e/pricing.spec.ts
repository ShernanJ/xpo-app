import { expect, test } from "playwright/test";

test("pricing is hidden when monetization is disabled", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("link", { name: "Pricing" })).toHaveCount(0);
  await expect(page.getByText("Simple pricing. Predictable usage.")).toHaveCount(0);

  const response = await page.goto("/pricing");
  expect(response?.status()).toBe(404);
});
