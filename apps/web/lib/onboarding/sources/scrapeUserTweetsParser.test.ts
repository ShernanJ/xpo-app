import assert from "node:assert/strict";
import test from "node:test";

import { parseUserTweetsGraphqlPayload } from "./scrapeUserTweetsParser.ts";

function createTweetNode(args: {
  id: string;
  text: string;
  createdAt?: string;
  bannerUrl?: string | null;
  pinnedTweetIds?: string[];
  imageUrls?: string[];
  expandedUrls?: string[];
}) {
  return {
    __typename: "Tweet",
    rest_id: args.id,
    legacy: {
      id_str: args.id,
      full_text: args.text,
      created_at: args.createdAt ?? "2026-03-10T12:00:00.000Z",
      favorite_count: 12,
      reply_count: 3,
      retweet_count: 2,
      quote_count: 1,
      ...(args.imageUrls?.length
        ? {
            extended_entities: {
              media: args.imageUrls.map((imageUrl, index) => ({
                id_str: `${args.id}-media-${index}`,
                type: "photo",
                media_url_https: imageUrl,
              })),
            },
          }
        : {}),
      ...(args.expandedUrls?.length
        ? {
            entities: {
              urls: args.expandedUrls.map((expandedUrl, index) => ({
                url: `https://t.co/link-${index}`,
                expanded_url: expandedUrl,
              })),
            },
          }
        : {}),
    },
    core: {
      user_results: {
        result: {
          core: {
            screen_name: "stan",
            name: "Stan",
            created_at: "2020-01-01T00:00:00.000Z",
          },
          legacy: {
            screen_name: "stan",
            name: "Stan",
            description: "builder",
            followers_count: 1200,
            friends_count: 200,
            created_at: "2020-01-01T00:00:00.000Z",
            profile_image_url_https:
              "https://pbs.twimg.com/profile_images/stan_normal.jpg",
            profile_banner_url: args.bannerUrl ?? null,
            pinned_tweet_ids_str: args.pinnedTweetIds ?? [],
            verified: false,
          },
          verification: {
            verified: false,
          },
        },
      },
    },
  };
}

function createPayload(nodes: unknown[]) {
  return {
    data: {
      user: {
        result: {
          core: {
            screen_name: "stan",
            name: "Stan",
            created_at: "2020-01-01T00:00:00.000Z",
          },
          legacy: {
            screen_name: "stan",
            name: "Stan",
            description: "builder",
            followers_count: 1200,
            friends_count: 200,
            created_at: "2020-01-01T00:00:00.000Z",
            profile_image_url_https:
              "https://pbs.twimg.com/profile_images/stan_normal.jpg",
            profile_banner_url: null,
            pinned_tweet_ids_str: [],
            verified: false,
          },
          verification: {
            verified: false,
          },
          timeline_v2: {
            timeline: {
              instructions: [
                {
                  entries: nodes.map((node, index) => ({
                    entryId: `tweet-${index}`,
                    content: {
                      itemContent: {
                        tweet_results: {
                          result: node,
                        },
                      },
                    },
                  })),
                },
              ],
            },
          },
        },
      },
    },
  };
}

test("parseUserTweetsGraphqlPayload extracts banner and pinned tweet metadata", () => {
  const payload = createPayload([
    createTweetNode({
      id: "111",
      text: "regular post",
      bannerUrl: "https://pbs.twimg.com/profile_banners/123456",
      pinnedTweetIds: ["222"],
    }),
    createTweetNode({
      id: "222",
      text: "Pinned authority thread about profile conversion and AI growth systems.",
      bannerUrl: "https://pbs.twimg.com/profile_banners/123456",
      imageUrls: ["https://pbs.twimg.com/media/pinned-photo.jpg"],
    }),
  ]);

  const parsed = parseUserTweetsGraphqlPayload({
    payload,
    account: "stan",
  });

  assert.equal(
    parsed.profile.headerImageUrl,
    "https://pbs.twimg.com/profile_banners/123456/1500x500",
  );
  assert.equal(parsed.pinnedPost?.id, "222");
  assert.equal(
    parsed.pinnedPost?.url,
    "https://x.com/stan/status/222",
  );
  assert.deepEqual(parsed.pinnedPost?.imageUrls, [
    "https://pbs.twimg.com/media/pinned-photo.jpg",
  ]);
});

test("parseUserTweetsGraphqlPayload preserves image metadata on recent posts and distinguishes media from external links", () => {
  const payload = createPayload([
    createTweetNode({
      id: "111",
      text: "proof post https://t.co/media-1",
      imageUrls: ["https://pbs.twimg.com/media/proof-photo.jpg"],
    }),
    createTweetNode({
      id: "112",
      text: "read the write-up https://t.co/link-1",
      expandedUrls: ["https://example.com/write-up"],
    }),
  ]);

  const parsed = parseUserTweetsGraphqlPayload({
    payload,
    account: "stan",
  });
  const posts = parsed.posts || [];
  const mediaPost = posts.find((post) => post.id === "111") ?? null;
  const externalLinkPost = posts.find((post) => post.id === "112") ?? null;

  assert.deepEqual(mediaPost?.imageUrls, [
    "https://pbs.twimg.com/media/proof-photo.jpg",
  ]);
  assert.equal(mediaPost?.linkSignal, "media_only");
  assert.deepEqual(externalLinkPost?.expandedUrls, [
    "https://example.com/write-up",
  ]);
  assert.equal(externalLinkPost?.linkSignal, "external");
});

test("parseUserTweetsGraphqlPayload prefers top-level user banner metadata when tweet nodes omit it", () => {
  const payload = createPayload([
    createTweetNode({
      id: "111",
      text: "regular post",
      bannerUrl: null,
      pinnedTweetIds: [],
    }),
  ]);

  (
    payload.data.user.result.legacy as {
      profile_banner_url?: string | null;
      pinned_tweet_ids_str?: string[];
    }
  ).profile_banner_url =
    "https://pbs.twimg.com/profile_banners/905463172076900352/1770758190";

  const parsed = parseUserTweetsGraphqlPayload({
    payload,
    account: "stan",
  });

  assert.equal(
    parsed.profile.headerImageUrl,
    "https://pbs.twimg.com/profile_banners/905463172076900352/1770758190/1500x500",
  );
});

test("parseUserTweetsGraphqlPayload can resolve the pinned tweet by pinned_tweet_ids_str even when it sits outside timeline entries", () => {
  const pinnedNode = createTweetNode({
    id: "2010284331479249364",
    text: "Pinned thread about AI systems and profile conversion.",
    bannerUrl: null,
  });
  const payload = createPayload([
    createTweetNode({
      id: "111",
      text: "regular post",
      bannerUrl: null,
      pinnedTweetIds: [],
    }),
  ]);

  (
    payload.data.user.result.legacy as {
      pinned_tweet_ids_str?: string[];
    }
  ).pinned_tweet_ids_str = ["2010284331479249364"];
  (payload as Record<string, unknown>).extraPinnedTweet = {
    result: pinnedNode,
  };

  const parsed = parseUserTweetsGraphqlPayload({
    payload,
    account: "stan",
  });

  assert.equal(parsed.pinnedPost?.id, "2010284331479249364");
  assert.equal(
    parsed.pinnedPost?.text,
    "Pinned thread about AI systems and profile conversion.",
  );
});

test("parseUserTweetsGraphqlPayload prefers the explicit pinned_tweets timeline entry", () => {
  const pinnedNode = createTweetNode({
    id: "2010284331479249364",
    text: "I’m planning to be more intentional on Twitter in 2026.",
    bannerUrl: null,
  });
  const payload = {
    data: {
      user: {
        result: {
          core: {
            screen_name: "stan",
            name: "Stan",
            created_at: "2020-01-01T00:00:00.000Z",
          },
          legacy: {
            screen_name: "stan",
            name: "Stan",
            description: "builder",
            followers_count: 1200,
            friends_count: 200,
            created_at: "2020-01-01T00:00:00.000Z",
            profile_image_url_https:
              "https://pbs.twimg.com/profile_images/stan_normal.jpg",
            profile_banner_url: null,
            pinned_tweet_ids_str: ["2010284331479249364"],
            verified: false,
          },
          timeline: {
            timeline: {
              instructions: [
                {
                  type: "TimelineClearCache",
                },
                {
                  entry: {
                    content: {
                      clientEventInfo: {
                        component: "pinned_tweets",
                        element: "tweet",
                      },
                      itemContent: {
                        socialContext: {
                          contextType: "Pin",
                          text: "Pinned",
                        },
                        tweet_results: {
                          result: pinnedNode,
                        },
                      },
                    },
                  },
                },
                {
                  entries: [
                    {
                      entryId: "tweet-1",
                      content: {
                        itemContent: {
                          tweet_results: {
                            result: createTweetNode({
                              id: "111",
                              text: "regular post",
                              bannerUrl: null,
                            }),
                          },
                        },
                      },
                    },
                  ],
                },
              ],
            },
          },
        },
      },
    },
  };

  const parsed = parseUserTweetsGraphqlPayload({
    payload,
    account: "stan",
  });

  assert.equal(parsed.pinnedPost?.id, "2010284331479249364");
  assert.equal(
    parsed.pinnedPost?.text,
    "I’m planning to be more intentional on Twitter in 2026.",
  );
});

test("parseUserTweetsGraphqlPayload falls back to null banner and pinned post when absent", () => {
  const payload = createPayload([
    createTweetNode({
      id: "333",
      text: "single post without banner or pinned metadata",
      bannerUrl: null,
      pinnedTweetIds: [],
    }),
  ]);

  const parsed = parseUserTweetsGraphqlPayload({
    payload,
    account: "stan",
  });

  assert.equal(parsed.profile.headerImageUrl, null);
  assert.equal(parsed.pinnedPost, null);
});

test("parseUserTweetsGraphqlPayload dedupes duplicate timeline tweet ids across entries", () => {
  const duplicatedNode = createTweetNode({
    id: "444",
    text: "same post repeated across multiple timeline entries",
  });
  const payload = createPayload([
    duplicatedNode,
    duplicatedNode,
    createTweetNode({
      id: "555",
      text: "distinct second post",
    }),
  ]);

  const parsed = parseUserTweetsGraphqlPayload({
    payload,
    account: "stan",
  });

  assert.deepEqual(
    parsed.posts.map((post) => post.id),
    ["444", "555"],
  );
});

test("parseUserTweetsGraphqlPayload returns a real zero-post result for accounts with no tweets", () => {
  const payload = createPayload([]);

  const parsed = parseUserTweetsGraphqlPayload({
    payload,
    account: "stan",
  });

  assert.equal(parsed.profile.username, "stan");
  assert.equal(parsed.profile.name, "Stan");
  assert.equal(parsed.posts.length, 0);
  assert.equal(parsed.replyPosts.length, 0);
  assert.equal(parsed.quotePosts.length, 0);
  assert.equal(parsed.pinnedPost, null);
});
