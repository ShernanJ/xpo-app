import { expect, test } from "playwright/test";

test("pricing is hidden when monetization is disabled", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("link", { name: "Pricing" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Refund Policy" })).toHaveCount(0);
  await expect(page.getByText("Simple pricing. Predictable usage.")).toHaveCount(0);

  const pricingResponse = await page.goto("/pricing");
  expect(pricingResponse?.status()).toBe(404);

  const refundResponse = await page.goto("/refund-policy");
  expect(refundResponse?.status()).toBe(404);
});
