import assert from "node:assert/strict";
import test from "node:test";

import { parseUserTweetsGraphqlPayload } from "./scrapeUserTweetsParser.ts";

function createTweetNode(args: {
  id: string;
  text: string;
  createdAt?: string;
  bannerUrl?: string | null;
  pinnedTweetIds?: string[];
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
