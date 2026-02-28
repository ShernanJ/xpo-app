import { buildMockAccountData } from "../mockData";
import type { OnboardingInput } from "../types";
import type { OnboardingDataSource } from "./types";

export function buildMockDataSource(
  input: OnboardingInput,
  warning: string,
): OnboardingDataSource {
  const fallback = buildMockAccountData(input.account);

  return {
    source: "mock",
    profile: fallback.profile,
    posts: fallback.posts,
    replyPosts: [],
    quotePosts: [],
    capturedPostCount: fallback.posts.length,
    capturedReplyPostCount: 0,
    capturedQuotePostCount: 0,
    warnings: [warning],
  };
}
