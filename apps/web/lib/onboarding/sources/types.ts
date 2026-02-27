import type { OnboardingResult } from "../types";

export interface OnboardingDataSource {
  source: OnboardingResult["source"];
  profile: OnboardingResult["profile"];
  posts: OnboardingResult["recentPosts"];
  warnings: string[];
}

export type OnboardingMode = "auto" | "x_api" | "scrape" | "mock";
