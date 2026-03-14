import type { ImgHTMLAttributes } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { InlineDraftPreviewState } from "./chatDraftPreviewState";
import { InlineDraftPreviewCard } from "./chatDraftPreviewCard";

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: (props: ImgHTMLAttributes<HTMLImageElement>) => <img {...props} />,
}));

const previewState: InlineDraftPreviewState = {
  draftBundle: null,
  previewArtifact: null,
  previewDraft: "Hello world",
  threadPreviewPosts: [],
  isThreadPreview: false,
  threadFramingStyle: null,
  selectedThreadPreviewPostIndex: 0,
  threadPostCharacterLimit: 280,
  threadDeckPosts: [],
  hiddenThreadPostCount: 0,
  threadDeckHeight: 0,
  isExpandedThreadPreview: false,
  draftCounter: {
    label: "11 / 280 chars",
    toneClassName: "text-zinc-500",
  },
  isLongformPreview: false,
  canToggleDraftFormat: false,
  transformDraftPrompt: "",
  convertToThreadPrompt: "",
  isFocusedDraftPreview: false,
  previewRevealKey: "message:1",
};

test("uses a real button for opening the draft preview", async () => {
  const user = userEvent.setup();
  const onOpenDraftEditor = vi.fn();

  render(
    <InlineDraftPreviewCard
      identity={{
        avatarUrl: null,
        displayName: "Stanley",
        username: "stanley",
      }}
      previewState={previewState}
      isVerifiedAccount={false}
      isMainChatLocked={false}
      hasCopiedDraft={false}
      revealClassName=""
      shouldAnimateLines={false}
      onOpenDraftEditor={onOpenDraftEditor}
      onRequestRevision={vi.fn()}
      onToggleExpanded={vi.fn()}
      onCopy={vi.fn()}
      onShare={vi.fn()}
    />,
  );

  const article = screen.getByText("Hello world").closest("article");
  const openDraftButton = screen.getByRole("button", { pressed: false });

  expect(article).not.toHaveAttribute("role", "button");
  expect(screen.getByRole("button", { name: "Edit draft" })).toBeVisible();

  await user.click(openDraftButton);
  expect(onOpenDraftEditor).toHaveBeenCalledWith();
});
