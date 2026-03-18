import { createRef } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import { SplitDialog } from "./split-dialog";

test("renders labelled split dialog content and closes on escape and backdrop", () => {
  const onOpenChange = vi.fn();

  render(
    <SplitDialog
      open
      onOpenChange={onOpenChange}
      title="Content hub"
      description="Browse and preview posts"
      headerSlot={<div>Search header</div>}
      leftPane={<div>Browse pane</div>}
      rightPane={<div>Preview pane</div>}
      footerSlot={<div>Footer actions</div>}
    />,
  );

  const dialog = screen.getByRole("dialog", { name: "Content hub" });
  expect(dialog).toHaveAttribute("aria-describedby");
  expect(screen.getByText("Search header")).toBeVisible();
  expect(screen.getByText("Browse pane")).toBeVisible();
  expect(screen.getByText("Preview pane")).toBeVisible();
  expect(screen.getByText("Footer actions")).toBeVisible();

  fireEvent.keyDown(document, { key: "Escape" });
  expect(onOpenChange).toHaveBeenCalledWith(false);

  onOpenChange.mockClear();
  fireEvent.mouseDown(dialog.parentElement as HTMLElement);
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

test("keeps focus trapped inside the split dialog", async () => {
  const user = userEvent.setup();
  const firstActionRef = createRef<HTMLInputElement>();

  render(
    <SplitDialog
      open
      onOpenChange={vi.fn()}
      title="Content hub"
      headerSlot={
        <div>
          <input ref={firstActionRef} aria-label="Search posts" />
        </div>
      }
      leftPane={<button type="button">Browse action</button>}
      rightPane={<button type="button">Preview action</button>}
      initialFocusRef={firstActionRef}
    />,
  );

  const searchInput = screen.getByRole("textbox", { name: "Search posts" });
  const browseAction = screen.getByRole("button", { name: "Browse action" });
  const previewAction = screen.getByRole("button", { name: "Preview action" });

  await waitFor(() => {
    expect(searchInput).toHaveFocus();
  });

  await user.tab();
  expect(browseAction).toHaveFocus();

  await user.tab();
  expect(previewAction).toHaveFocus();

  await user.tab();
  expect(searchInput).toHaveFocus();
});

test("renders a resize handle when the split dialog is resizable", () => {
  render(
    <SplitDialog
      open
      onOpenChange={vi.fn()}
      title="Resizable dialog"
      leftPane={<div>Browse pane</div>}
      rightPane={<div>Preview pane</div>}
      resizable
      defaultLeftPaneWidth={54}
    />,
  );

  expect(screen.getByTestId("split-dialog-resize-handle")).toBeInTheDocument();
});

test("uses viewport insets on mobile so header and footer controls stay inside the panel", () => {
  render(
    <SplitDialog
      open
      onOpenChange={vi.fn()}
      title="Mobile sizing"
      headerSlot={<div>Header</div>}
      leftPane={<div>Browse pane</div>}
      rightPane={<div>Preview pane</div>}
      footerSlot={<div>Footer</div>}
    />,
  );

  const dialog = screen.getByRole("dialog", { name: "Mobile sizing" });
  const browsePane = screen.getByText("Browse pane");
  const paneGrid = browsePane.closest("section")?.parentElement;

  expect(dialog.className).toContain("top-2");
  expect(dialog.className).toContain("bottom-2");
  expect(paneGrid?.className).toContain("flex-1");
});

test("uses desktop viewport insets instead of centering a fixed-height body", () => {
  render(
    <SplitDialog
      open
      onOpenChange={vi.fn()}
      title="Desktop sizing"
      headerSlot={<div>Header</div>}
      leftPane={<div>Browse pane</div>}
      rightPane={<div>Preview pane</div>}
    />,
  );

  const dialog = screen.getByRole("dialog", { name: "Desktop sizing" });
  const browsePane = screen.getByText("Browse pane");
  const paneGrid = browsePane.closest("section")?.parentElement;

  expect(dialog.className).toContain("md:top-4");
  expect(dialog.className).toContain("md:bottom-4");
  expect(dialog.className).toContain("md:inset-x-auto");
  expect(paneGrid?.className).not.toContain("md:h-[min(80dvh,820px)]");
});
