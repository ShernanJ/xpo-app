import type { OnboardingResult, XPinnedPost, XPublicProfile } from "../types.ts";
import { resolvePinnedPostImageUrls } from "./pinnedPostMedia.ts";
import { selectCuratedOnboardingPosts } from "../shared/postSampling.ts";

type HydratableProfileFields = Partial<
  Pick<
    XPublicProfile,
    | "name"
    | "avatarUrl"
    | "bio"
    | "headerImageUrl"
    | "isVerified"
    | "followersCount"
    | "followingCount"
    | "createdAt"
    | "statusesCount"
  >
>;

type LatestScrapeHydrationInput = {
  profile: HydratableProfileFields;
  pinnedPost: XPinnedPost | null;
  posts?: OnboardingResult["recentPosts"];
  replyPosts?: OnboardingResult["recentReplyPosts"];
  quotePosts?: OnboardingResult["recentQuotePosts"];
};

async function resolveDefaultFreshProfile(accountInput: string) {
  const { resolveFreshOnboardingProfilePreview } = await import("./profilePreview.ts");
  return resolveFreshOnboardingProfilePreview(accountInput);
}

async function resolveDefaultLatestScrapeCapture(accountInput: string) {
  const { readLatestScrapeCaptureByAccount } = await import("../store/scrapeCaptureStore.ts");
  return readLatestScrapeCaptureByAccount(accountInput);
}

async function resolveLatestScrapeCaptureWithPinnedRefresh(accountInput: string) {
  const { readLatestScrapeCaptureByAccount } = await import("../store/scrapeCaptureStore.ts");
  const { bootstrapScrapeCaptureWithOptions } = await import("../sources/scrapeBootstrap.ts");

  const latestCapture = await readLatestScrapeCaptureByAccount(accountInput);
  if (latestCapture?.pinnedPost) {
    return latestCapture;
  }

  try {
    await bootstrapScrapeCaptureWithOptions(accountInput, {
      pages: 2,
      count: 40,
      userAgent: "profile-analysis",
      forceRefresh: true,
    });
  } catch {
    return latestCapture;
  }

  return readLatestScrapeCaptureByAccount(accountInput);
}

function isSamePinnedPost(
  left: XPinnedPost | null | undefined,
  right: XPinnedPost | null | undefined,
): boolean {
  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return (
    left.id === right.id &&
    left.text === right.text &&
    left.createdAt === right.createdAt &&
    left.url === right.url &&
    JSON.stringify(left.imageUrls ?? null) === JSON.stringify(right.imageUrls ?? null)
  );
}

function normalizePinnedImageUrls(value: string[] | null | undefined): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = Array.from(
    new Set(value.map((entry) => entry?.trim()).filter((entry): entry is string => Boolean(entry))),
  );
  return normalized.length > 0 ? normalized : null;
}

function mergePinnedPost(
  existing: XPinnedPost | null | undefined,
  incoming: XPinnedPost | null | undefined,
): XPinnedPost | null {
  if (!existing && !incoming) {
    return null;
  }

  if (!existing) {
    return incoming ?? null;
  }

  if (!incoming) {
    return existing;
  }

  if (existing.id !== incoming.id) {
    return incoming;
  }

  return {
    ...existing,
    ...incoming,
    text: incoming.text || existing.text,
    createdAt: incoming.createdAt || existing.createdAt,
    url: incoming.url ?? existing.url ?? null,
    imageUrls:
      normalizePinnedImageUrls(incoming.imageUrls) ??
      normalizePinnedImageUrls(existing.imageUrls),
  };
}

async function hydratePinnedPostMedia(
  onboarding: OnboardingResult,
  resolveImageUrls: (
    pinnedPost: XPinnedPost | null | undefined,
  ) => Promise<string[] | null> = resolvePinnedPostImageUrls,
): Promise<OnboardingResult> {
  if (!onboarding.pinnedPost) {
    return onboarding;
  }

  if (normalizePinnedImageUrls(onboarding.pinnedPost.imageUrls)) {
    return onboarding;
  }

  try {
    const imageUrls = await resolveImageUrls(onboarding.pinnedPost);
    const normalizedImageUrls = normalizePinnedImageUrls(imageUrls);
    if (!normalizedImageUrls) {
      return onboarding;
    }

    return {
      ...onboarding,
      pinnedPost: {
        ...onboarding.pinnedPost,
        imageUrls: normalizedImageUrls,
      },
    };
  } catch {
    return onboarding;
  }
}

export function mergeFreshProfileIntoOnboarding(
  onboarding: OnboardingResult,
  freshProfile: HydratableProfileFields | null,
): OnboardingResult {
  if (!freshProfile) {
    return onboarding;
  }

  const nameChanged =
    typeof freshProfile.name === "string" &&
    freshProfile.name.trim().length > 0 &&
    freshProfile.name !== onboarding.profile.name;
  const bioChanged =
    typeof freshProfile.bio === "string" &&
    freshProfile.bio.trim().length > 0 &&
    freshProfile.bio !== onboarding.profile.bio;
  const avatarChanged =
    typeof freshProfile.avatarUrl === "string" &&
    freshProfile.avatarUrl.length > 0 &&
    freshProfile.avatarUrl !== onboarding.profile.avatarUrl;
  const headerChanged =
    typeof freshProfile.headerImageUrl === "string" &&
    freshProfile.headerImageUrl.length > 0 &&
    freshProfile.headerImageUrl !== onboarding.profile.headerImageUrl;
  const currentIsVerified = onboarding.profile.isVerified === true;
  const nextIsVerified = currentIsVerified || freshProfile.isVerified === true;
  const verifiedChanged = nextIsVerified !== currentIsVerified;
  const followersChanged =
    typeof freshProfile.followersCount === "number" &&
    Number.isFinite(freshProfile.followersCount) &&
    freshProfile.followersCount >= 0 &&
    freshProfile.followersCount !== onboarding.profile.followersCount;
  const followingChanged =
    typeof freshProfile.followingCount === "number" &&
    Number.isFinite(freshProfile.followingCount) &&
    freshProfile.followingCount >= 0 &&
    freshProfile.followingCount !== onboarding.profile.followingCount;
  const createdAtChanged =
    typeof freshProfile.createdAt === "string" &&
    freshProfile.createdAt.trim().length > 0 &&
    freshProfile.createdAt !== onboarding.profile.createdAt;
  const statusesChanged =
    typeof freshProfile.statusesCount === "number" &&
    Number.isFinite(freshProfile.statusesCount) &&
    freshProfile.statusesCount >= 0 &&
    freshProfile.statusesCount !== onboarding.profile.statusesCount;
  const nextName = nameChanged ? freshProfile.name!.trim() : null;
  const nextBio = bioChanged ? freshProfile.bio! : null;
  const nextAvatarUrl = avatarChanged ? freshProfile.avatarUrl! : null;
  const nextHeaderImageUrl = headerChanged ? freshProfile.headerImageUrl! : null;
  const nextFollowersCount = followersChanged ? freshProfile.followersCount! : null;
  const nextFollowingCount = followingChanged ? freshProfile.followingCount! : null;
  const nextCreatedAt = createdAtChanged ? freshProfile.createdAt! : null;
  const nextStatusesCount = statusesChanged ? freshProfile.statusesCount! : null;

  if (
    !nameChanged &&
    !bioChanged &&
    !avatarChanged &&
    !headerChanged &&
    !verifiedChanged &&
    !followersChanged &&
    !followingChanged &&
    !createdAtChanged &&
    !statusesChanged
  ) {
    return onboarding;
  }

  return {
    ...onboarding,
    profile: {
      ...onboarding.profile,
      ...(nextName ? { name: nextName } : {}),
      ...(nextBio ? { bio: nextBio } : {}),
      ...(nextAvatarUrl ? { avatarUrl: nextAvatarUrl } : {}),
      ...(nextHeaderImageUrl ? { headerImageUrl: nextHeaderImageUrl } : {}),
      ...(verifiedChanged ? { isVerified: nextIsVerified } : {}),
      ...(nextFollowersCount !== null ? { followersCount: nextFollowersCount } : {}),
      ...(nextFollowingCount !== null ? { followingCount: nextFollowingCount } : {}),
      ...(nextCreatedAt ? { createdAt: nextCreatedAt } : {}),
      ...(nextStatusesCount !== null ? { statusesCount: nextStatusesCount } : {}),
    },
  };
}

export function mergeLatestScrapeIntoOnboarding(
  onboarding: OnboardingResult,
  latestScrape: LatestScrapeHydrationInput | null,
): OnboardingResult {
  if (!latestScrape) {
    return onboarding;
  }

  const withFreshProfile = {
    ...onboarding,
    profile: {
      ...onboarding.profile,
      ...(!onboarding.profile.name.trim() && latestScrape.profile.name?.trim()
        ? { name: latestScrape.profile.name.trim() }
        : {}),
      ...(!onboarding.profile.bio.trim() && latestScrape.profile.bio?.trim()
        ? { bio: latestScrape.profile.bio }
        : {}),
      ...(!onboarding.profile.avatarUrl && latestScrape.profile.avatarUrl
        ? { avatarUrl: latestScrape.profile.avatarUrl }
        : {}),
      ...(!onboarding.profile.headerImageUrl && latestScrape.profile.headerImageUrl
        ? { headerImageUrl: latestScrape.profile.headerImageUrl }
        : {}),
      ...(latestScrape.profile.isVerified ? { isVerified: true } : {}),
      ...(onboarding.profile.followersCount <= 0 &&
      typeof latestScrape.profile.followersCount === "number"
        ? { followersCount: latestScrape.profile.followersCount }
        : {}),
      ...(onboarding.profile.followingCount <= 0 &&
      typeof latestScrape.profile.followingCount === "number"
        ? { followingCount: latestScrape.profile.followingCount }
        : {}),
      ...(!onboarding.profile.createdAt &&
      typeof latestScrape.profile.createdAt === "string" &&
      latestScrape.profile.createdAt.trim()
        ? { createdAt: latestScrape.profile.createdAt }
        : {}),
      ...(onboarding.profile.statusesCount == null &&
      typeof latestScrape.profile.statusesCount === "number"
        ? { statusesCount: latestScrape.profile.statusesCount }
        : {}),
    },
  };
  const latestPosts = Array.isArray(latestScrape.posts) ? latestScrape.posts : [];
  const latestReplyPosts = Array.isArray(latestScrape.replyPosts) ? latestScrape.replyPosts : [];
  const latestQuotePosts = Array.isArray(latestScrape.quotePosts) ? latestScrape.quotePosts : [];
  const mergedWithLatestPosts =
    latestPosts.length > 0
      ? {
          ...withFreshProfile,
          recentPosts: selectCuratedOnboardingPosts(latestPosts).analysisPosts,
          recentReplyPosts:
            latestReplyPosts.length > 0
              ? latestReplyPosts.slice(0, Math.max(onboarding.replyPostSampleCount, 50))
              : withFreshProfile.recentReplyPosts,
          recentQuotePosts:
            latestQuotePosts.length > 0
              ? latestQuotePosts.slice(0, Math.max(onboarding.quotePostSampleCount, 50))
              : withFreshProfile.recentQuotePosts,
          recentPostSampleCount: selectCuratedOnboardingPosts(latestPosts).analysisPosts.length,
          replyPostSampleCount:
            latestReplyPosts.length > 0
              ? Math.min(latestReplyPosts.length, Math.max(onboarding.replyPostSampleCount, 50))
              : withFreshProfile.replyPostSampleCount,
          quotePostSampleCount:
            latestQuotePosts.length > 0
              ? Math.min(latestQuotePosts.length, Math.max(onboarding.quotePostSampleCount, 50))
              : withFreshProfile.quotePostSampleCount,
          capturedPostCount: latestPosts.length,
          capturedReplyPostCount:
            latestReplyPosts.length > 0
              ? latestReplyPosts.length
              : withFreshProfile.capturedReplyPostCount,
          capturedQuotePostCount:
            latestQuotePosts.length > 0
              ? latestQuotePosts.length
              : withFreshProfile.capturedQuotePostCount,
          totalCapturedActivityCount:
            latestPosts.length +
            (latestReplyPosts.length > 0
              ? latestReplyPosts.length
              : withFreshProfile.capturedReplyPostCount) +
            (latestQuotePosts.length > 0
              ? latestQuotePosts.length
              : withFreshProfile.capturedQuotePostCount),
        }
      : withFreshProfile;
  if (isSamePinnedPost(mergedWithLatestPosts.pinnedPost, latestScrape.pinnedPost)) {
    return mergedWithLatestPosts;
  }

  return {
    ...mergedWithLatestPosts,
    pinnedPost: mergePinnedPost(mergedWithLatestPosts.pinnedPost, latestScrape.pinnedPost),
  };
}

export async function hydrateOnboardingProfile(
  onboarding: OnboardingResult,
  resolveProfile: (
    accountInput: string,
  ) => Promise<HydratableProfileFields | null> =
    resolveDefaultFreshProfile,
): Promise<OnboardingResult> {
  const account = onboarding.account || onboarding.profile.username;
  if (!account) {
    return onboarding;
  }

  try {
    const freshProfile = await resolveProfile(account);
    return mergeFreshProfileIntoOnboarding(onboarding, freshProfile);
  } catch {
    return onboarding;
  }
}

export async function hydrateOnboardingProfileForAnalysis(
  onboarding: OnboardingResult,
  resolveProfile: (
    accountInput: string,
  ) => Promise<HydratableProfileFields | null> =
    resolveDefaultFreshProfile,
  resolveLatestScrape: (
    accountInput: string,
  ) => Promise<LatestScrapeHydrationInput | null> = resolveDefaultLatestScrapeCapture,
  resolvePinnedPostMediaUrls: (
    pinnedPost: XPinnedPost | null | undefined,
  ) => Promise<string[] | null> = resolvePinnedPostImageUrls,
): Promise<OnboardingResult> {
  const withFreshProfile = await hydrateOnboardingProfile(onboarding, resolveProfile);
  const account = onboarding.account || onboarding.profile.username;
  if (!account) {
    return hydratePinnedPostMedia(withFreshProfile, resolvePinnedPostMediaUrls);
  }

  try {
    const latestScrape = await resolveLatestScrape(account);
    return hydratePinnedPostMedia(
      mergeLatestScrapeIntoOnboarding(withFreshProfile, latestScrape),
      resolvePinnedPostMediaUrls,
    );
  } catch {
    return hydratePinnedPostMedia(withFreshProfile, resolvePinnedPostMediaUrls);
  }
}

export async function hydrateOnboardingProfileForAnalysisWithPinnedRefresh(
  onboarding: OnboardingResult,
  resolveProfile: (
    accountInput: string,
  ) => Promise<Pick<XPublicProfile, "avatarUrl" | "bio" | "headerImageUrl" | "isVerified"> | null> =
    resolveDefaultFreshProfile,
): Promise<OnboardingResult> {
  return hydrateOnboardingProfileForAnalysis(
    onboarding,
    resolveProfile,
    resolveLatestScrapeCaptureWithPinnedRefresh,
  );
}
