import { createRef } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { Dialog } from "./dialog";

test("renders a labelled dialog and closes on escape and backdrop", () => {
  const onOpenChange = vi.fn();

  render(
    <Dialog
      open
      onOpenChange={onOpenChange}
      title="Manage billing"
      description="Adjust billing details"
    >
      <button type="button">First action</button>
    </Dialog>,
  );

  const dialog = screen.getByRole("dialog", { name: "Manage billing" });
  expect(dialog).toHaveAttribute("aria-describedby");
  expect(screen.getByText("Adjust billing details")).toBeVisible();

  fireEvent.keyDown(document, { key: "Escape" });
  expect(onOpenChange).toHaveBeenCalledWith(false);

  onOpenChange.mockClear();
  fireEvent.mouseDown(dialog.parentElement as HTMLElement);
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

test("keeps keyboard focus inside the dialog", async () => {
  const user = userEvent.setup();
  const firstActionRef = createRef<HTMLButtonElement>();

  render(
    <Dialog
      open
      onOpenChange={vi.fn()}
      title="Compose reply"
      initialFocusRef={firstActionRef}
    >
      <div className="space-y-2">
        <button ref={firstActionRef} type="button">
          First action
        </button>
        <button type="button">Second action</button>
      </div>
    </Dialog>,
  );

  const firstAction = screen.getByRole("button", { name: "First action" });
  const secondAction = screen.getByRole("button", { name: "Second action" });

  await waitFor(() => {
    expect(firstAction).toHaveFocus();
  });

  await user.tab();
  expect(secondAction).toHaveFocus();

  await user.tab();
  expect(firstAction).toHaveFocus();

  await user.tab({ shift: true });
  expect(secondAction).toHaveFocus();
});
