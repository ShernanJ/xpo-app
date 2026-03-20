import type { ImgHTMLAttributes } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach } from "vitest";
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

const originalScrollIntoView = Element.prototype.scrollIntoView;
const scrollIntoViewMock = vi.fn();
const originalRequestAnimationFrame = window.requestAnimationFrame;
const originalCancelAnimationFrame = window.cancelAnimationFrame;

beforeEach(() => {
  Element.prototype.scrollIntoView = scrollIntoViewMock;
  scrollIntoViewMock.mockReset();
  window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  }) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = vi.fn();
});

afterEach(() => {
  Element.prototype.scrollIntoView = originalScrollIntoView;
  window.requestAnimationFrame = originalRequestAnimationFrame;
  window.cancelAnimationFrame = originalCancelAnimationFrame;
});

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

test("scrolls the selected expanded thread post into view when focused", async () => {
  render(
    <InlineDraftPreviewCard
      identity={{
        avatarUrl: null,
        displayName: "Stanley",
        username: "stanley",
      }}
      previewState={{
        ...previewState,
        isThreadPreview: true,
        isExpandedThreadPreview: true,
        isFocusedDraftPreview: true,
        selectedThreadPreviewPostIndex: 1,
        threadPreviewPosts: [
          {
            content: "Post one",
            originalIndex: 0,
            weightedCharacterCount: 8,
            maxCharacterLimit: 280,
          },
          {
            content: "Post two",
            originalIndex: 1,
            weightedCharacterCount: 8,
            maxCharacterLimit: 280,
          },
        ],
      }}
      isVerifiedAccount={false}
      isMainChatLocked={false}
      hasCopiedDraft={false}
      revealClassName=""
      shouldAnimateLines={false}
      onOpenDraftEditor={vi.fn()}
      onRequestRevision={vi.fn()}
      onToggleExpanded={vi.fn()}
      onCopy={vi.fn()}
      onShare={vi.fn()}
    />,
  );

  expect(scrollIntoViewMock).toHaveBeenCalled();
});

test("renders the attached image under the draft preview text", () => {
  render(
    <InlineDraftPreviewCard
      identity={{
        avatarUrl: null,
        displayName: "Stanley",
        username: "stanley",
      }}
      previewState={{
        ...previewState,
        previewMediaAttachments: [
          {
            assetId: "chat-media-1",
            kind: "image",
            src: "/api/creator/v2/chat/media/chat-media-1",
            previewSrc: "/api/creator/v2/chat/media/chat-media-1?variant=preview",
            mimeType: "image/png",
            width: 1280,
            height: 720,
            name: "draft.png",
          },
        ],
      }}
      isVerifiedAccount={false}
      isMainChatLocked={false}
      hasCopiedDraft={false}
      revealClassName=""
      shouldAnimateLines={false}
      onOpenDraftEditor={vi.fn()}
      onRequestRevision={vi.fn()}
      onToggleExpanded={vi.fn()}
      onCopy={vi.fn()}
      onShare={vi.fn()}
    />,
  );

  expect(screen.getByRole("button", { name: "Expand draft image 1" })).toHaveClass("max-w-[400px]");
  expect(screen.getByAltText("draft.png")).toBeVisible();
});

test("keeps the inline draft preview constrained to the X-style card width", () => {
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
      onOpenDraftEditor={vi.fn()}
      onRequestRevision={vi.fn()}
      onToggleExpanded={vi.fn()}
      onCopy={vi.fn()}
      onShare={vi.fn()}
    />,
  );

  expect(screen.getByText("Hello world").closest("article")).toHaveClass("max-w-[600px]");
});
