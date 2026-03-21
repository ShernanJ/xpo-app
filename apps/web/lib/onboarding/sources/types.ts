import type { OnboardingResult } from "../types";

export interface OnboardingDataSource {
  source: OnboardingResult["source"];
  profile: OnboardingResult["profile"];
  pinnedPost: OnboardingResult["pinnedPost"];
  posts: OnboardingResult["recentPosts"];
  replyPosts: OnboardingResult["recentReplyPosts"];
  quotePosts: OnboardingResult["recentQuotePosts"];
  capturedPostCount: number;
  capturedReplyPostCount: number;
  capturedQuotePostCount: number;
  warnings: string[];
  syncState?: OnboardingResult["syncState"];
}

export type OnboardingMode = "auto" | "x_api" | "scrape" | "mock";
