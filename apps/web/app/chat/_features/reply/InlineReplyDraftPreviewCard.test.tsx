import type { ImgHTMLAttributes } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import { InlineReplyDraftPreviewCard } from "./InlineReplyDraftPreviewCard";

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: (props: ImgHTMLAttributes<HTMLImageElement>) => <img {...props} />,
}));

const sourcePreview = {
  postId: "post-1",
  sourceUrl: "https://x.com/elkelk/status/1",
  author: {
    displayName: "Elk Elk",
    username: "elkelk",
    avatarUrl: "https://pbs.twimg.com/profile_images/elkelk_400x400.jpg",
    isVerified: true,
  },
  text: "Perfect algo pull\nwith a second line that should stay hidden while collapsed",
  media: [],
  quotedPost: null,
  conversation: null,
} as const;

const baseProps = {
  identity: {
    avatarUrl: null,
    displayName: "Stan",
    username: "stan",
  },
  isVerifiedAccount: false,
  isMainChatLocked: false,
  draftText: "That framing is directionally right, but I'd make the reps more deliberate.",
  sourcePreview,
  isFocused: false,
  hasCopiedDraft: false,
  revealClassName: "",
  shouldAnimateLines: false,
  onOpenDraftEditor: vi.fn(),
  onRequestRevision: vi.fn(),
  onCopy: vi.fn(),
};

test("renders the inline source preview expanded by default when requested", () => {
  render(<InlineReplyDraftPreviewCard {...baseProps} defaultSourceExpanded />);

  const toggle = screen.getByRole("button", { name: "Collapse source post preview" });

  expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText(/Perfect algo pull/i)).toBeVisible();
  expect(screen.getAllByText("Elk Elk")).toHaveLength(1);
});

test("renders the inline source preview collapsed by default and expands on click", async () => {
  const user = userEvent.setup();

  render(<InlineReplyDraftPreviewCard {...baseProps} defaultSourceExpanded={false} />);

  const toggle = screen.getByRole("button", { name: "Expand source post preview" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByText(/Perfect algo pull/i)).toBeVisible();
  expect(screen.queryByText("with a second line that should stay hidden while collapsed")).toBeNull();

  await user.click(toggle);

  expect(
    screen.getByRole("button", { name: "Collapse source post preview" }),
  ).toHaveAttribute("aria-expanded", "true");
  expect(
    screen.getByText(/with a second line that should stay hidden while collapsed/i),
  ).toBeVisible();
  expect(screen.getAllByText("Elk Elk")).toHaveLength(1);
});
