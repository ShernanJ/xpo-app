import { resolveFreshOnboardingProfilePreview } from "../profilePreview";
import { readLatestScrapeCaptureByAccount } from "../scrapeStore";
import type { OnboardingInput } from "../types";
import { bootstrapScrapeCapture } from "./scrapeBootstrap";
import type { OnboardingDataSource } from "./types";

const MIN_ONBOARDING_SCRAPE_POSTS = 40;
const MAX_ONBOARDING_ANALYSIS_POSTS = 100;

export async function resolveScrapeDataSource(
  input: OnboardingInput,
): Promise<OnboardingDataSource> {
  let latestCapture = await readLatestScrapeCaptureByAccount(input.account);
  const warnings: string[] = [];
  const hadExistingCapture = Boolean(latestCapture);
  const initialPostCount = latestCapture?.posts.length ?? 0;

  const shouldBootstrap =
    !latestCapture || latestCapture.posts.length < MIN_ONBOARDING_SCRAPE_POSTS;

  if (shouldBootstrap) {
    await bootstrapScrapeCapture(input.account);
    const refreshedCapture = await readLatestScrapeCaptureByAccount(input.account);

    if (refreshedCapture) {
      latestCapture = refreshedCapture;
    }

    if (!latestCapture) {
      warnings.push("No cached scrape found. Ran live onboarding bootstrap scrape.");
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
    warnings,
  };
}
