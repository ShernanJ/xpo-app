import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

const navigationMocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

const authMocks = vi.hoisted(() => ({
  signIn: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: navigationMocks.push,
    refresh: navigationMocks.refresh,
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/auth/client", () => ({
  signIn: authMocks.signIn,
}));

import { LoginForm } from "./LoginForm";

test("renders labelled auth fields and supports password reveal", async () => {
  const user = userEvent.setup();

  render(<LoginForm />);

  const emailInput = screen.getByLabelText("Email");
  const passwordInput = screen.getByLabelText("Password");

  expect(emailInput).toHaveAttribute("type", "email");
  expect(passwordInput).toHaveAttribute("type", "password");

  await user.click(screen.getByRole("button", { name: "Show password" }));

  expect(passwordInput).toHaveAttribute("type", "text");
  expect(screen.getByRole("button", { name: "Hide password" })).toBeVisible();
});
