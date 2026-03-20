import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { useContentHubState } from "./useContentHubState";

function createJsonResponse(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response);
}

function buildSummaryItem(args: {
  id: string;
  title: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  createdAt: string;
  previewText: string;
}) {
  return {
    id: args.id,
    title: args.title,
    threadId: "thread_1",
    messageId: `message_${args.id}`,
    status: args.status,
    folderId: null,
    folder: null,
    publishedTweetId: null,
    createdAt: args.createdAt,
    updatedAt: args.createdAt,
    postedAt: null,
    preview: {
      primaryText: args.previewText,
      threadPostCount: 1,
      isThread: false,
    },
  };
}

function buildDetailItem(args: {
  id: string;
  title: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  createdAt: string;
  content: string;
}) {
  return {
    id: args.id,
    title: args.title,
    sourcePrompt: `${args.title} prompt`,
    sourcePlaybook: null,
    outputShape: "short_form_post",
    threadId: "thread_1",
    messageId: `message_${args.id}`,
    status: args.status,
    reviewStatus: args.status === "PUBLISHED" ? "posted" : "pending",
    folderId: null,
    folder: null,
    publishedTweetId: null,
    artifact: {
      id: `${args.id}-artifact`,
      title: args.title,
      kind: "short_form_post",
      content: args.content,
      posts: [
        {
          id: `${args.id}-post`,
          content: args.content,
          weightedCharacterCount: args.content.length,
          maxCharacterLimit: 280,
          isWithinXLimit: true,
        },
      ],
      characterCount: args.content.length,
      weightedCharacterCount: args.content.length,
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
    },
    createdAt: args.createdAt,
    updatedAt: args.createdAt,
    postedAt: null,
  };
}

function buildReplySummaryItem(args: {
  id: string;
  title: string;
  createdAt: string;
  replyText: string;
}) {
  return {
    id: args.id,
    title: args.title,
    threadId: null,
    messageId: null,
    status: "DRAFT" as const,
    folderId: null,
    folder: null,
    publishedTweetId: null,
    createdAt: args.createdAt,
    updatedAt: args.createdAt,
    postedAt: null,
    preview: {
      primaryText: args.replyText,
      threadPostCount: 1,
      isThread: false,
    },
  };
}

function buildReplyDetailItem(args: {
  id: string;
  title: string;
  createdAt: string;
  replyText: string;
}) {
  return {
    id: args.id,
    title: args.title,
    sourcePrompt: `${args.title} prompt`,
    sourcePlaybook: "extension_reply",
    outputShape: "reply_candidate",
    threadId: null,
    messageId: null,
    status: "DRAFT" as const,
    reviewStatus: "pending",
    folderId: null,
    folder: null,
    publishedTweetId: null,
    artifact: {
      id: `${args.id}-artifact`,
      title: args.title,
      kind: "reply_candidate",
      content: args.replyText,
      posts: [],
      characterCount: args.replyText.length,
      weightedCharacterCount: args.replyText.length,
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
      replySourcePreview: {
        postId: `${args.id}-source`,
        sourceUrl: `https://x.com/source/status/${args.id}-source`,
        author: {
          displayName: "source",
          username: "source",
          avatarUrl: null,
          isVerified: false,
        },
        text: "Source post",
        media: [],
      },
    },
    createdAt: args.createdAt,
    updatedAt: args.createdAt,
    postedAt: null,
  };
}

test("switching content types clears a stale selection before loading reply details", async () => {
  const createdAt = "2026-03-20T10:00:00.000Z";
  const staleReplyDetailPath = "/api/creator/v2/content/post_2?contentType=replies";
  const fetchWorkspace = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";

    if (method === "GET" && url === "/api/creator/v2/content") {
      return createJsonResponse({
        ok: true,
        data: {
          items: [
            buildSummaryItem({
              id: "post_1",
              title: "Post one",
              status: "DRAFT",
              createdAt,
              previewText: "Post one preview",
            }),
            buildSummaryItem({
              id: "post_2",
              title: "Post two",
              status: "DRAFT",
              createdAt,
              previewText: "Post two preview",
            }),
          ],
          hasMore: false,
          nextCursor: null,
        },
      });
    }

    if (method === "GET" && url === "/api/creator/v2/folders") {
      return createJsonResponse({
        ok: true,
        data: {
          folders: [],
        },
      });
    }

    if (method === "GET" && url === "/api/creator/v2/content/post_1") {
      return createJsonResponse({
        ok: true,
        data: {
          item: buildDetailItem({
            id: "post_1",
            title: "Post one",
            status: "DRAFT",
            createdAt,
            content: "Post one body",
          }),
        },
      });
    }

    if (method === "GET" && url === "/api/creator/v2/content?contentType=replies") {
      return createJsonResponse({
        ok: true,
        data: {
          items: [
            buildReplySummaryItem({
              id: "reply_1",
              title: "Reply one",
              createdAt,
              replyText: "Reply one preview",
            }),
          ],
          hasMore: false,
          nextCursor: null,
        },
      });
    }

    if (method === "GET" && url === "/api/creator/v2/content/reply_1?contentType=replies") {
      return createJsonResponse({
        ok: true,
        data: {
          item: buildReplyDetailItem({
            id: "reply_1",
            title: "Reply one",
            createdAt,
            replyText: "Reply one body",
          }),
        },
      });
    }

    if (method === "GET" && url === staleReplyDetailPath) {
      return createJsonResponse(
        {
          ok: false,
          errors: [{ field: "id", message: "Content item not found." }],
        },
        404,
      );
    }

    if (method === "GET" && url === "/api/creator/v2/content/post_2") {
      return createJsonResponse({
        ok: true,
        data: {
          item: buildDetailItem({
            id: "post_2",
            title: "Post two",
            status: "DRAFT",
            createdAt,
            content: "Post two body",
          }),
        },
      });
    }

    throw new Error(`Unhandled fetch ${method} ${url}`);
  });

  const { result } = renderHook(() =>
    useContentHubState({
      open: true,
      fetchWorkspace,
    }),
  );

  await waitFor(() => {
    expect(result.current.filteredItems).toHaveLength(2);
    expect(result.current.selectedItemId).toBe("post_1");
  });

  await waitFor(() => {
    expect(fetchWorkspace).toHaveBeenCalledWith(
      "/api/creator/v2/content/post_1",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  act(() => {
    result.current.selectItem("post_2");
    result.current.setContentType("replies");
  });

  await waitFor(() => {
    expect(fetchWorkspace).toHaveBeenCalledWith(
      "/api/creator/v2/content?contentType=replies",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  await waitFor(() => {
    expect(result.current.contentType).toBe("replies");
    expect(result.current.selectedItemId).toBe("reply_1");
  });

  await waitFor(() => {
    expect(fetchWorkspace).toHaveBeenCalledWith(
      "/api/creator/v2/content/reply_1?contentType=replies",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  expect(fetchWorkspace.mock.calls.map(([input]) => String(input))).not.toContain(
    staleReplyDetailPath,
  );
  expect(result.current.errorMessage).toBeNull();
});
