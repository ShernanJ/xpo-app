import { resolveFreshOnboardingProfilePreview } from "../profilePreview";
import { readLatestScrapeCaptureByAccount } from "../scrapeStore";
import type { OnboardingInput } from "../types";
import { bootstrapScrapeCapture } from "./scrapeBootstrap";
import type { OnboardingDataSource } from "./types";

const MIN_ONBOARDING_SCRAPE_POSTS = 40;
const MAX_ONBOARDING_ANALYSIS_POSTS = 100;
const MAX_ONBOARDING_REPLY_ANALYSIS_POSTS = 120;
const MAX_ONBOARDING_QUOTE_ANALYSIS_POSTS = 80;

export async function resolveScrapeDataSource(
  input: OnboardingInput,
): Promise<OnboardingDataSource> {
  let latestCapture = await readLatestScrapeCaptureByAccount(input.account);
  const warnings: string[] = [];
  const hadExistingCapture = Boolean(latestCapture);
  const initialPostCount = latestCapture?.posts.length ?? 0;
  const shouldForceRefresh = input.forceFreshScrape === true;

  const shouldBootstrap =
    shouldForceRefresh ||
    !latestCapture ||
    latestCapture.posts.length < MIN_ONBOARDING_SCRAPE_POSTS;

  if (shouldBootstrap) {
    const priorCapture = latestCapture;
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
    } else if (latestCapture.posts.length < MIN_ONBOARDING_SCRAPE_POSTS) {
      warnings.push(
        hadExistingCapture
          ? `Cached scrape had only ${initialPostCount} posts. Re-ran bootstrap, but only ${latestCapture.posts.length} usable posts are currently available.`
          : `No cached scrape found. Ran live onboarding bootstrap, but only ${latestCapture.posts.length} usable posts are currently available.`,
      );
    } else if (hadExistingCapture) {
      warnings.push(
        `Cached scrape had only ${initialPostCount} posts. Re-ran live onboarding bootstrap for a deeper sample.`,
      );
    } else {
      warnings.push("No cached scrape found. Ran live onboarding bootstrap scrape.");
    }
  }

  if (!latestCapture) {
    throw new Error(`No scrape capture found for @${input.account} after bootstrap.`);
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
    warnings,
  };
}
