import { expect, test } from "vitest";

import type { ContentItemSummaryRecord } from "./contentHubTypes";
import {
  formatPostedReplyCount,
  getContentTimestampDescriptor,
  groupContentItemsByDate,
} from "./contentHubViewState";

function buildReplyItem(
  overrides: Partial<ContentItemSummaryRecord> = {},
): ContentItemSummaryRecord {
  return {
    id: "reply_1",
    title: "@builder - useful layer",
    threadId: null,
    messageId: null,
    status: "DRAFT",
    folderId: null,
    folder: null,
    publishedTweetId: null,
    createdAt: "2026-03-17T10:00:00.000Z",
    updatedAt: "2026-03-17T10:00:00.000Z",
    postedAt: null,
    preview: {
      primaryText: "useful layer",
      threadPostCount: 1,
      isThread: false,
    },
    ...overrides,
  };
}

test("groupContentItemsByDate groups replies by postedAt when present and counts posted replies", () => {
  const groups = groupContentItemsByDate(
    [
      buildReplyItem({
        id: "reply_posted_today",
        createdAt: "2026-03-15T10:00:00.000Z",
        postedAt: "2026-03-20T09:30:00.000Z",
        status: "PUBLISHED",
      }),
      buildReplyItem({
        id: "reply_saved_today",
        createdAt: "2026-03-20T08:00:00.000Z",
      }),
    ],
    {
      contentType: "replies",
      now: new Date("2026-03-20T15:00:00.000Z"),
    },
  );

  expect(groups).toHaveLength(1);
  expect(groups[0]).toMatchObject({
    label: "Today",
    postedCount: 1,
  });
  expect(groups[0]?.items.map((item) => item.id)).toEqual([
    "reply_posted_today",
    "reply_saved_today",
  ]);
});

test("getContentTimestampDescriptor returns reply-specific labels", () => {
  expect(
    getContentTimestampDescriptor(
      buildReplyItem({
        postedAt: "2026-03-20T09:30:00.000Z",
      }),
      "replies",
    ),
  ).toEqual({
    label: "Posted",
    value: "2026-03-20T09:30:00.000Z",
  });

  expect(getContentTimestampDescriptor(buildReplyItem(), "replies")).toEqual({
    label: "Saved",
    value: "2026-03-17T10:00:00.000Z",
  });
});

test("formatPostedReplyCount pluralizes cleanly", () => {
  expect(formatPostedReplyCount(1)).toBe("1 posted");
  expect(formatPostedReplyCount(3)).toBe("3 posted");
});
