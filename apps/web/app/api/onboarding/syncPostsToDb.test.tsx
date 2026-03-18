import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  postUpsert: vi.fn(),
  transaction: vi.fn(),
  checkNewTweetsAgainstDrafts: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    post: {
      upsert: mocks.postUpsert,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/content/autoPublishMatcher", () => ({
  checkNewTweetsAgainstDrafts: mocks.checkNewTweetsAgainstDrafts,
}));

import { syncPostsToDb } from "@/lib/onboarding/store/onboardingRunStore";

function createPost(id: string, text: string) {
  return {
    id,
    text,
    createdAt: "2026-03-18T12:00:00.000Z",
    metrics: {
      likeCount: 1,
      replyCount: 0,
      repostCount: 0,
      quoteCount: 0,
    },
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("syncPostsToDb", () => {
  test("invokes draft matching after a successful sync using the normalized original timeline posts", async () => {
    const originalPost = createPost("post_1", "shipping the content hub today");
    const replyPost = createPost("reply_1", "replying to a founder");
    const quotePost = createPost("quote_1", "quoting a launch post");

    mocks.postUpsert.mockImplementation((args) => Promise.resolve(args));
    mocks.transaction.mockResolvedValue([]);
    mocks.checkNewTweetsAgainstDrafts.mockResolvedValue([]);

    await syncPostsToDb({
      userId: "user_1",
      xHandle: "@StanDev",
      posts: [originalPost],
      replyPosts: [replyPost],
      quotePosts: [quotePost],
    });

    expect(mocks.postUpsert).toHaveBeenCalledTimes(3);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.checkNewTweetsAgainstDrafts).toHaveBeenCalledTimes(1);
    expect(mocks.checkNewTweetsAgainstDrafts).toHaveBeenCalledWith({
      userId: "user_1",
      activeXHandle: "standev",
      newTweets: [originalPost],
    });
    expect(mocks.transaction.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.checkNewTweetsAgainstDrafts.mock.invocationCallOrder[0],
    );
  });

  test("does not fail the sync when the matcher throws", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mocks.postUpsert.mockImplementation((args) => Promise.resolve(args));
    mocks.transaction.mockResolvedValue([]);
    mocks.checkNewTweetsAgainstDrafts.mockRejectedValue(
      new Error("matcher exploded"),
    );

    await expect(
      syncPostsToDb({
        userId: "user_1",
        xHandle: "@StanDev",
        posts: [createPost("post_1", "shipping the content hub today")],
      }),
    ).resolves.toBeUndefined();

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.checkNewTweetsAgainstDrafts).toHaveBeenCalledTimes(1);

    consoleErrorSpy.mockRestore();
  });
});
