import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { MessageContent } from "./MessageContent";

const imageAttachment = [
  {
    assetId: "chat-media-1",
    kind: "image" as const,
    src: "/api/creator/v2/chat/media/chat-media-1",
    previewSrc: "/api/creator/v2/chat/media/chat-media-1?variant=preview",
    mimeType: "image/png",
    width: 1280,
    height: 720,
    name: "draft.png",
  },
];

test("renders media-only user messages without an empty text block", () => {
  const { container } = render(
    <MessageContent
      role="user"
      content=""
      isStreaming={false}
      isLatestAssistantMessage={false}
      typedLength={0}
      assistantTypingBubble={null}
      mediaAttachments={imageAttachment}
    />,
  );

  expect(screen.getByAltText("draft.png")).toBeVisible();
  expect(container.querySelector("p")).toBeNull();
});

test("renders user text followed by the attached image", () => {
  render(
    <MessageContent
      role="user"
      content="here's the image"
      isStreaming={false}
      isLatestAssistantMessage={false}
      typedLength={0}
      assistantTypingBubble={null}
      mediaAttachments={imageAttachment}
    />,
  );

  expect(screen.getByText("here's the image")).toBeVisible();
  expect(screen.getByAltText("draft.png")).toBeVisible();
});

test("renders a source tweet card instead of the raw user link when reply source preview is present", () => {
  render(
    <MessageContent
      role="user"
      content="https://x.com/elkelk/status/2034751673290350617"
      isStreaming={false}
      isLatestAssistantMessage={false}
      typedLength={0}
      assistantTypingBubble={null}
      replySourcePreview={{
        postId: "2034751673290350617",
        sourceUrl: "https://x.com/elkelk/status/2034751673290350617",
        author: {
          displayName: "elkelk",
          username: "elkelk",
          avatarUrl: null,
          isVerified: false,
        },
        text: "Perfect algo pull",
        media: [],
        quotedPost: {
          postId: "quoted-1",
          sourceUrl: "https://x.com/thejustinguo/status/1",
          author: {
            displayName: "Justin Guo",
            username: "thejustinguo",
            avatarUrl: null,
            isVerified: false,
          },
          text: "founder mode but the screenshot is doing half the work",
          media: [],
        },
      }}
    />,
  );

  expect(screen.getByText("Source Post")).toBeVisible();
  expect(screen.getByText("Perfect algo pull")).toBeVisible();
  expect(
    screen.queryByText("https://x.com/elkelk/status/2034751673290350617"),
  ).toBeNull();
});
