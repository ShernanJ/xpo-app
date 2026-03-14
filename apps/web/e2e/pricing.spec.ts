import { expect, test } from "playwright/test";

test("pricing page uses a semantic billing cadence control", async ({ page }) => {
  await page.goto("/pricing");

  const monthly = page.getByRole("radio", { name: "Monthly" });
  const annual = page.getByRole("radio", { name: "Annual" });

  await expect(page.getByRole("radiogroup", { name: "Billing cadence" })).toBeVisible();
  await expect(monthly).toHaveAttribute("aria-checked", "true");

  await annual.click();
  await expect(annual).toHaveAttribute("aria-checked", "true");
});
