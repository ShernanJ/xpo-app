import { resolveFreshOnboardingProfilePreview } from "../profile/profilePreview";
import {
  isScrapeCaptureExpired,
  readLatestScrapeCaptureByAccount,
} from "../store/scrapeCaptureStore";
import type { OnboardingInput } from "../types";
import { bootstrapScrapeCapture } from "./scrapeBootstrap";
import type { OnboardingDataSource } from "./types";

const MAX_ONBOARDING_ANALYSIS_POSTS = 100;
const MAX_ONBOARDING_REPLY_ANALYSIS_POSTS = 120;
const MAX_ONBOARDING_QUOTE_ANALYSIS_POSTS = 80;

function getScrapeFreshnessMode(input: OnboardingInput) {
  if (input.scrapeFreshness) {
    return input.scrapeFreshness;
  }

  return "if_stale" as const;
}

function isCaptureStale(capturedAt: string): boolean {
  return isScrapeCaptureExpired(capturedAt);
}

export async function resolveScrapeDataSource(
  input: OnboardingInput,
): Promise<OnboardingDataSource> {
  let latestCapture = await readLatestScrapeCaptureByAccount(input.account);
  const warnings: string[] = [];
  const freshnessMode = getScrapeFreshnessMode(input);
  const existingCaptureExpired = latestCapture
    ? isCaptureStale(latestCapture.capturedAt)
    : false;
  const shouldRefreshIfStale =
    freshnessMode === "if_stale" && (!latestCapture || existingCaptureExpired);
  const shouldBootstrap = shouldRefreshIfStale;

  if (shouldBootstrap) {
    const priorCapture = latestCapture;
    const hadExpiredPriorCapture = priorCapture
      ? isCaptureStale(priorCapture.capturedAt)
      : false;
    await bootstrapScrapeCapture(input.account);
    const refreshedCapture = await readLatestScrapeCaptureByAccount(input.account);

    if (refreshedCapture) {
      latestCapture = refreshedCapture;
    } else if (priorCapture) {
      latestCapture = priorCapture;
    }

    if (!latestCapture) {
      warnings.push("No cached scrape found. Ran live onboarding bootstrap scrape.");
    } else if (refreshedCapture && refreshedCapture.captureId !== priorCapture?.captureId) {
      warnings.push(
        hadExpiredPriorCapture
          ? "Refreshed an expired scrape capture before analysis."
          : "No cached scrape found. Ran live onboarding bootstrap scrape.",
      );
    } else if (priorCapture) {
      warnings.push(
        hadExpiredPriorCapture
          ? "Detected an expired scrape capture and attempted refresh, but kept the cached capture when no newer result was available."
          : "Attempted to bootstrap a missing scrape capture, but kept the cached capture when no newer result was available.",
      );
    } else {
      warnings.push("No cached scrape found. Ran live onboarding bootstrap scrape.");
    }
  }

  if (!latestCapture) {
    if (freshnessMode === "cache_only") {
      throw new Error(
        `No cached scrape capture found for @${input.account}, and scrapeFreshness=cache_only prevented a refresh.`,
      );
    }

    throw new Error(`No scrape capture found for @${input.account} after refresh.`);
  }

  const freshPreview = await resolveFreshOnboardingProfilePreview(input.account);
  const profile = {
    ...latestCapture.profile,
    ...(typeof freshPreview?.bio === "string" &&
    freshPreview.bio.trim() &&
    freshPreview.bio !== latestCapture.profile.bio
      ? { bio: freshPreview.bio }
      : {}),
    ...(freshPreview?.avatarUrl &&
    freshPreview.avatarUrl !== latestCapture.profile.avatarUrl
      ? { avatarUrl: freshPreview.avatarUrl }
      : {}),
    ...(freshPreview?.headerImageUrl &&
    freshPreview.headerImageUrl !== latestCapture.profile.headerImageUrl
      ? { headerImageUrl: freshPreview.headerImageUrl }
      : {}),
    isVerified: latestCapture.profile.isVerified || freshPreview?.isVerified || false,
  };

  return {
    source: "scrape",
    profile,
    pinnedPost: latestCapture.pinnedPost ?? null,
    posts: latestCapture.posts.slice(0, MAX_ONBOARDING_ANALYSIS_POSTS),
    replyPosts: (latestCapture.replyPosts ?? []).slice(
      0,
      MAX_ONBOARDING_REPLY_ANALYSIS_POSTS,
    ),
    quotePosts: (latestCapture.quotePosts ?? []).slice(
      0,
      MAX_ONBOARDING_QUOTE_ANALYSIS_POSTS,
    ),
    capturedPostCount: latestCapture.posts.length,
    capturedReplyPostCount: (latestCapture.replyPosts ?? []).length,
    capturedQuotePostCount: (latestCapture.quotePosts ?? []).length,
    warnings,
  };
}
