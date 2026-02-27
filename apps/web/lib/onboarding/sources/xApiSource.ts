import {
  fetchXPublicProfile,
  fetchXRecentPosts,
  hasXApiCredentials,
} from "../xApi";
import type { OnboardingInput } from "../types";
import type { OnboardingDataSource } from "./types";

export function hasXApiSourceCredentials(): boolean {
  return hasXApiCredentials();
}

export async function resolveXApiDataSource(
  input: OnboardingInput,
): Promise<OnboardingDataSource> {
  if (!hasXApiCredentials()) {
    throw new Error("X_API_BEARER_TOKEN is missing.");
  }

  const { profile, userId } = await fetchXPublicProfile(input.account);
  const posts = await fetchXRecentPosts(userId, 50);

  return {
    source: "x_api",
    profile,
    posts,
    warnings:
      posts.length === 0 ? ["No recent posts found from X API for this account."] : [],
  };
}
