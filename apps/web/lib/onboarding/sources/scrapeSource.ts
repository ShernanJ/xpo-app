import { resolveFreshOnboardingProfilePreview } from "../profilePreview";
import {
  isScrapeCaptureExpired,
  readLatestScrapeCaptureByAccount,
} from "../scrapeStore";
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

  if (input.forceFreshScrape) {
    return "always" as const;
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
  const shouldForceRefresh = freshnessMode === "always";
  const existingCaptureExpired = latestCapture
    ? isCaptureStale(latestCapture.capturedAt)
    : false;
  const shouldRefreshIfStale =
    freshnessMode === "if_stale" && (!latestCapture || existingCaptureExpired);
  const shouldBootstrap =
    shouldForceRefresh ||
    shouldRefreshIfStale ||
    (!latestCapture && freshnessMode !== "cache_only");

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
    } else if (
      shouldForceRefresh &&
      refreshedCapture &&
      refreshedCapture.captureId !== priorCapture?.captureId
    ) {
      warnings.push("Ran a fresh onboarding scrape before analysis.");
    } else if (shouldForceRefresh && priorCapture) {
      warnings.push(
        "Attempted a fresh onboarding scrape, but kept the cached capture when no newer result was available.",
      );
    } else if (
      freshnessMode === "if_stale" &&
      refreshedCapture &&
      refreshedCapture.captureId !== priorCapture?.captureId
    ) {
      warnings.push(
        hadExpiredPriorCapture
          ? "Refreshed an expired scrape capture before analysis."
          : "Refreshed the scrape capture before analysis.",
      );
    } else if (freshnessMode === "if_stale" && priorCapture) {
      warnings.push(
        hadExpiredPriorCapture
          ? "Detected an expired scrape capture and attempted refresh, but kept the cached capture when no newer result was available."
          : "Attempted to refresh the scrape capture, but kept the cached capture when no newer result was available.",
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
    ...(freshPreview?.avatarUrl &&
    freshPreview.avatarUrl !== latestCapture.profile.avatarUrl
      ? { avatarUrl: freshPreview.avatarUrl }
      : {}),
    isVerified: latestCapture.profile.isVerified || freshPreview?.isVerified || false,
  };

  return {
    source: "scrape",
    profile,
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
