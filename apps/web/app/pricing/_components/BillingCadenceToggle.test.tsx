import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { BillingCadenceToggle } from "./BillingCadenceToggle";

function BillingCadenceToggleHarness() {
  const [selectedCadence, setSelectedCadence] = useState<"monthly" | "annual">("monthly");

  return (
    <BillingCadenceToggle
      selectedCadence={selectedCadence}
      onChange={setSelectedCadence}
    />
  );
}

test("exposes a semantic radiogroup and supports keyboard selection", async () => {
  const user = userEvent.setup();

  render(<BillingCadenceToggleHarness />);

  const group = screen.getByRole("radiogroup", { name: "Billing cadence" });
  const monthly = screen.getByRole("radio", { name: "Monthly" });
  const annual = screen.getByRole("radio", { name: "Annual" });

  expect(group).toBeVisible();
  expect(monthly).toHaveAttribute("aria-checked", "true");
  expect(annual).toHaveAttribute("aria-checked", "false");

  monthly.focus();
  await user.keyboard("{ArrowRight}");
  expect(annual).toHaveAttribute("aria-checked", "true");

  await user.click(monthly);
  expect(monthly).toHaveAttribute("aria-checked", "true");
});
