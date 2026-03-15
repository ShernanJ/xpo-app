import { buildMockAccountData } from "../shared/mockData";
import type { OnboardingInput } from "../contracts/types";
import type { OnboardingDataSource } from "./types";

export function buildMockDataSource(
  input: OnboardingInput,
  warning: string,
): OnboardingDataSource {
  const fallback = buildMockAccountData(input.account);

  return {
    source: "mock",
    profile: fallback.profile,
    pinnedPost: null,
    posts: fallback.posts,
    replyPosts: [],
    quotePosts: [],
    capturedPostCount: fallback.posts.length,
    capturedReplyPostCount: 0,
    capturedQuotePostCount: 0,
    warnings: [warning],
  };
}
