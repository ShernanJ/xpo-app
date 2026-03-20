import type { ImgHTMLAttributes } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import { ReplySourcePreviewCard } from "./ReplySourcePreviewCard";

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: (props: ImgHTMLAttributes<HTMLImageElement>) => <img {...props} />,
}));

const preview = {
  postId: "2034751673290350617",
  sourceUrl: "https://x.com/elkelk/status/2034751673290350617",
  author: {
    displayName: "Elk Elk",
    username: "elkelk",
    avatarUrl: "https://pbs.twimg.com/profile_images/elkelk_400x400.jpg",
    isVerified: true,
  },
  text: "Perfect algo pull",
  media: [
    {
      type: "image" as const,
      url: "https://pbs.twimg.com/media/post-image.jpg?format=jpg&name=large",
      altText: "Main dashboard screenshot",
    },
  ],
  quotedPost: null,
  conversation: null,
};

const multilinePreview = {
  ...preview,
  text: "Perfect algo pull\nwith a second line that should stay hidden while collapsed",
};

test("renders the author profile photo and verification badge", () => {
  render(<ReplySourcePreviewCard preview={preview} showExternalCta />);

  expect(screen.getByLabelText("Elk Elk profile photo")).toBeVisible();
  expect(screen.getByAltText("Verified account")).toBeVisible();
});

test("uses the reply cta label for the source link when enabled", () => {
  render(<ReplySourcePreviewCard preview={preview} showExternalCta />);

  expect(screen.getByRole("link", { name: "Reply" })).toHaveAttribute(
    "href",
    "https://x.com/elkelk/status/2034751673290350617",
  );
});

test("renders reply-tone cards with the X-style source post wrapper", () => {
  const { container } = render(<ReplySourcePreviewCard preview={preview} tone="reply" />);

  expect(container.querySelector("article")).toHaveClass("border-white/12", "bg-[#050505]");
});

test("renders compact image thumbnails that expand into a modal", async () => {
  const user = userEvent.setup();

  render(<ReplySourcePreviewCard preview={preview} size="compact" />);

  const expandButton = screen.getByRole("button", { name: "Expand source image 1" });
  const thumbnailImage = screen.getByAltText("Main dashboard screenshot");

  expect(expandButton).toBeVisible();
  expect(expandButton.className).toContain("max-w-[400px]");
  expect(thumbnailImage).toHaveClass("aspect-square");
  expect(screen.queryByText("Tap to expand")).toBeNull();
  expect(screen.queryByRole("dialog", { name: "Expanded source image" })).toBeNull();

  await user.click(expandButton);

  expect(screen.getByRole("dialog", { name: "Expanded source image" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Close expanded image" })).toBeVisible();
  expect(document.body.style.overflow).toBe("hidden");

  await user.click(screen.getByRole("button", { name: "Close expanded image" }));

  expect(screen.queryByRole("dialog", { name: "Expanded source image" })).toBeNull();
  expect(document.body.style.overflow).toBe("");
});

test("closes the expanded image modal when clicking the backdrop", async () => {
  const user = userEvent.setup();

  render(<ReplySourcePreviewCard preview={preview} size="compact" />);

  await user.click(screen.getByRole("button", { name: "Expand source image 1" }));

  const dialog = screen.getByRole("dialog", { name: "Expanded source image" });
  await user.click(dialog);

  expect(screen.queryByRole("dialog", { name: "Expanded source image" })).toBeNull();
});

test("renders only the first source line when collapsed", () => {
  render(<ReplySourcePreviewCard preview={multilinePreview} size="compact" collapsed />);

  expect(screen.getByText("Perfect algo pull")).toBeVisible();
  expect(
    screen.queryByText("with a second line that should stay hidden while collapsed"),
  ).toBeNull();
});
