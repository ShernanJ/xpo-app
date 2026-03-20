import type { ImgHTMLAttributes } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import { MinimalXPostPreview } from "./MinimalXPostPreview";
import type {
  ContentHubAuthorIdentity,
  ContentItemRecord,
} from "./contentHubTypes";

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: (props: ImgHTMLAttributes<HTMLImageElement>) => <img {...props} />,
}));

function buildItem(overrides: Partial<ContentItemRecord> = {}): ContentItemRecord {
  const { artifact: artifactOverride, ...itemOverrides } = overrides;

  return {
    id: "item_1",
    title: "Thread preview",
    sourcePrompt: "prompt",
    sourcePlaybook: null,
    outputShape: "short_form_post",
    threadId: "thread_1",
    messageId: "message_1",
    status: "DRAFT",
    reviewStatus: "pending",
    folderId: "group_1",
    folder: {
      id: "group_1",
      name: "Growth",
      color: null,
      createdAt: "2026-03-17T10:00:00.000Z",
      itemCount: 4,
    },
    publishedTweetId: null,
    preview: {
      primaryText: "Opening hook for a longer thread.",
      threadPostCount: 3,
      isThread: true,
    },
    artifact: {
      id: "artifact_1",
      title: "Thread preview",
      kind: "short_form_post",
      content: "Opening hook for a longer thread.",
      posts: [
        {
          id: "post_1",
          content: "Opening hook for a longer thread.",
          weightedCharacterCount: 34,
          maxCharacterLimit: 280,
          isWithinXLimit: true,
        },
        {
          id: "post_2",
          content: "Second post with more context.",
          weightedCharacterCount: 30,
          maxCharacterLimit: 280,
          isWithinXLimit: true,
        },
        {
          id: "post_3",
          content: "Third post with the conclusion.",
          weightedCharacterCount: 31,
          maxCharacterLimit: 280,
          isWithinXLimit: true,
        },
      ],
      characterCount: 95,
      weightedCharacterCount: 95,
      maxCharacterLimit: 280,
      isWithinXLimit: true,
      supportAsset: null,
      mediaAttachments: [],
      groundingSources: [],
      groundingMode: null,
      groundingExplanation: null,
      betterClosers: [],
      replyPlan: [],
      voiceTarget: null,
      noveltyNotes: [],
      threadFramingStyle: null,
      ...(artifactOverride ?? {}),
    },
    createdAt: "2026-03-17T10:00:00.000Z",
    updatedAt: "2026-03-17T10:00:00.000Z",
    postedAt: null,
    ...itemOverrides,
  };
}

const identity: ContentHubAuthorIdentity = {
  displayName: "Vitalii Dodonov",
  username: "vitddnv",
  avatarUrl: null,
};

test("renders the compact preview as a square card with a thread callout", () => {
  const { container } = render(
    <MinimalXPostPreview
      item={buildItem()}
      identity={identity}
      isVerifiedAccount
      variant="compact"
    />,
  );

  expect(screen.getByText("@vitddnv")).toBeVisible();
  expect(screen.getByText("Growth")).toBeVisible();
  expect(screen.getByText("Thread")).toBeVisible();
  expect(screen.getByText("3-post thread")).toBeVisible();
  expect(screen.getByText("Opening hook for a longer thread.")).toBeVisible();
  expect(screen.queryByText("Vitalii Dodonov")).not.toBeInTheDocument();
  expect(screen.queryByText("3 posts")).not.toBeInTheDocument();
  expect(screen.queryByText("Single post")).not.toBeInTheDocument();
  expect(container.querySelector("article")).toHaveClass("aspect-square");
});

test("copies an individual thread post and shows a temporary checkmark state", async () => {
  const user = userEvent.setup();
  const writeText = vi.fn().mockResolvedValue(undefined);

  Object.defineProperty(window.navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });

  render(
    <MinimalXPostPreview
      item={buildItem()}
      identity={identity}
      isVerifiedAccount
      variant="full"
    />,
  );

  await user.click(screen.getByRole("button", { name: "Copy post 2" }));

  expect(writeText).toHaveBeenCalledWith("Second post with more context.");
  expect(screen.getByRole("button", { name: "Copied post 2" })).toBeVisible();

  await new Promise((resolve) => {
    window.setTimeout(resolve, 2100);
  });

  expect(screen.getByRole("button", { name: "Copy post 2" })).toBeVisible();
}, 7000);

test("renders reply drafts with the source tweet preview", () => {
  const item = buildItem({
    id: "reply_1",
    title: "Reply draft",
    status: "DRAFT",
    createdAt: "2026-03-19T10:00:00.000Z",
    preview: {
      primaryText: "reply draft body",
      threadPostCount: 1,
      isThread: false,
    },
    artifact: {
      ...buildItem().artifact!,
      content: "reply draft body",
      posts: [],
      characterCount: 16,
      weightedCharacterCount: 16,
    },
  });

  render(
    <MinimalXPostPreview
      item={{
        ...item,
        outputShape: "reply_candidate",
        artifact: {
          ...item.artifact!,
          kind: "reply_candidate",
          replySourcePreview: {
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
          },
        },
      }}
      identity={identity}
      isVerifiedAccount
      variant="full"
    />,
  );

  expect(screen.getByText("Replying to")).toBeVisible();
  expect(screen.getByRole("link", { name: "@elkelk" })).toHaveAttribute(
    "href",
    "https://x.com/elkelk/status/2034751673290350617",
  );
  expect(screen.getByText("Perfect algo pull")).toBeVisible();
  expect(screen.queryByText("Just now")).not.toBeInTheDocument();
});
