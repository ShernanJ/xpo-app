import type { ComponentProps, ElementType, HTMLAttributes, ReactNode } from "react";

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import { ChatComposerSurface } from "./ChatComposerSurface";
import { getComposerSlashCommands } from "./composerCommands";

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
  motion: new Proxy(
    ((Component: ElementType) =>
      ({ children, ...props }: HTMLAttributes<HTMLElement>) => (
        <Component {...props}>{children}</Component>
      )) as unknown as typeof import("framer-motion").motion,
    {
      get: (_target, tagName: string) =>
        ({ children, ...props }: HTMLAttributes<HTMLElement>) => {
          const Component = tagName as ElementType;
          return <Component {...props}>{children}</Component>;
        },
    },
  ),
}));

function buildProps(
  overrides: Partial<ComponentProps<typeof ChatComposerSurface>> = {},
): ComponentProps<typeof ChatComposerSurface> {
  return {
    draftInput: "",
    composerMode: null,
    activePlaceholder: "write me a post about building in public...",
    placeholderAnimationKey: "0:write me a post about building in public...",
    shouldAnimatePlaceholder: true,
    slashCommands: getComposerSlashCommands(),
    slashCommandQuery: null,
    composerInlineNotice: null,
    composerImageAttachment: null,
    composerFileInputRef: { current: null },
    isSlashCommandPickerOpen: false,
    isComposerDisabled: false,
    isAttachmentDisabled: false,
    isSubmitDisabled: true,
    isSending: false,
    surfaceClassName: "rounded-2xl border border-white/10",
    onCancelComposerMode: vi.fn(),
    onComposerFileChange: vi.fn(),
    onComposerKeyDown: vi.fn(),
    onDraftInputChange: vi.fn(),
    onDismissSlashCommandPicker: vi.fn(),
    onInterruptReply: vi.fn(),
    onOpenComposerImagePicker: vi.fn(),
    onRemoveComposerImageAttachment: vi.fn(),
    onSelectSlashCommand: vi.fn(),
    onSubmit: vi.fn((event) => event.preventDefault()),
    ...overrides,
  };
}

test("selects slash commands from the picker with the keyboard", () => {
  const props = buildProps({
    draftInput: "/th",
    slashCommandQuery: "th",
    isSlashCommandPickerOpen: true,
  });

  render(<ChatComposerSurface {...props} />);

  fireEvent.keyDown(screen.getByRole("textbox", { name: "Chat composer" }), {
    key: "Enter",
  });

  expect(props.onSelectSlashCommand).toHaveBeenCalledWith("thread");
});

test("shows the full slash command list and descriptions for a bare slash query", () => {
  const props = buildProps({
    draftInput: "/",
    slashCommandQuery: "",
    isSlashCommandPickerOpen: true,
  });

  render(<ChatComposerSurface {...props} />);

  expect(screen.getByText("/thread")).toBeVisible();
  expect(screen.getByText("/idea")).toBeVisible();
  expect(screen.getByText("/post")).toBeVisible();
  expect(screen.getByText("/draft")).toBeVisible();
  expect(screen.getByText("/reply")).toBeVisible();
  expect(screen.getByText("Draft a multi-post X thread in your voice.")).toBeVisible();
  expect(screen.getByText("Generate niche-matched post ideas before drafting.")).toBeVisible();
  expect(screen.getByText("Paste a tweet or X link and get one grounded reply in your voice.")).toBeVisible();
});

test("backspace exits thread command mode when the composer is empty", () => {
  const props = buildProps({
    composerMode: {
      kind: "command",
      commandId: "thread",
    },
  });

  render(<ChatComposerSurface {...props} />);

  fireEvent.keyDown(screen.getByRole("textbox", { name: "Chat composer" }), {
    key: "Backspace",
  });

  expect(props.onCancelComposerMode).toHaveBeenCalledTimes(1);
});

test("renders and removes an attached image preview", async () => {
  const user = userEvent.setup();
  const props = buildProps({
    composerImageAttachment: {
      id: "attachment-1",
      file: new File(["image"], "draft.png", { type: "image/png" }),
      name: "draft.png",
      mimeType: "image/png",
      sizeBytes: 1024,
      objectUrl: "blob:preview-1",
    },
  });

  render(<ChatComposerSurface {...props} />);

  expect(screen.getByText("draft.png")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Remove attached image" }));

  expect(props.onRemoveComposerImageAttachment).toHaveBeenCalledTimes(1);
});

test("opens the image picker from the attach button", async () => {
  const user = userEvent.setup();
  const props = buildProps();

  render(<ChatComposerSurface {...props} />);

  await user.click(screen.getByRole("button", { name: "Attach image" }));

  expect(props.onOpenComposerImagePicker).toHaveBeenCalledTimes(1);
});

test("shows the thinking placeholder while the agent is sending", () => {
  const props = buildProps({
    isSending: true,
  });

  render(<ChatComposerSurface {...props} />);

  expect(screen.getByText("Agent is thinking")).toBeVisible();
  expect(
    screen.queryByText("write me a post about building in public..."),
  ).not.toBeInTheDocument();
});
