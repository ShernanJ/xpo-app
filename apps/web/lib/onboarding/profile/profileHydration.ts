import type { OnboardingResult, XPinnedPost, XPublicProfile } from "../types.ts";

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
    left.createdAt === right.createdAt
  );
}

export function mergeFreshProfileIntoOnboarding(
  onboarding: OnboardingResult,
  freshProfile: Pick<XPublicProfile, "avatarUrl" | "bio" | "headerImageUrl" | "isVerified"> | null,
): OnboardingResult {
  if (!freshProfile) {
    return onboarding;
  }

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

  if (!bioChanged && !avatarChanged && !headerChanged && !verifiedChanged) {
    return onboarding;
  }

  return {
    ...onboarding,
    profile: {
      ...onboarding.profile,
      ...(bioChanged ? { bio: freshProfile.bio } : {}),
      ...(avatarChanged ? { avatarUrl: freshProfile.avatarUrl } : {}),
      ...(headerChanged ? { headerImageUrl: freshProfile.headerImageUrl } : {}),
      ...(verifiedChanged ? { isVerified: nextIsVerified } : {}),
    },
  };
}

export function mergeLatestScrapeIntoOnboarding(
  onboarding: OnboardingResult,
  latestScrape:
    | {
        profile: Pick<
          XPublicProfile,
          "avatarUrl" | "bio" | "headerImageUrl" | "isVerified"
        >;
        pinnedPost: XPinnedPost | null;
      }
    | null,
): OnboardingResult {
  if (!latestScrape) {
    return onboarding;
  }

  const withFreshProfile = {
    ...onboarding,
    profile: {
      ...onboarding.profile,
      ...(!onboarding.profile.bio.trim() && latestScrape.profile.bio
        ? { bio: latestScrape.profile.bio }
        : {}),
      ...(!onboarding.profile.avatarUrl && latestScrape.profile.avatarUrl
        ? { avatarUrl: latestScrape.profile.avatarUrl }
        : {}),
      ...(!onboarding.profile.headerImageUrl && latestScrape.profile.headerImageUrl
        ? { headerImageUrl: latestScrape.profile.headerImageUrl }
        : {}),
      ...(latestScrape.profile.isVerified && !onboarding.profile.isVerified
        ? { isVerified: true }
        : {}),
    },
  };
  if (isSamePinnedPost(withFreshProfile.pinnedPost, latestScrape.pinnedPost)) {
    return withFreshProfile;
  }

  return {
    ...withFreshProfile,
    pinnedPost: latestScrape.pinnedPost ?? null,
  };
}

export async function hydrateOnboardingProfile(
  onboarding: OnboardingResult,
  resolveProfile: (
    accountInput: string,
  ) => Promise<Pick<XPublicProfile, "avatarUrl" | "bio" | "headerImageUrl" | "isVerified"> | null> =
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
  ) => Promise<Pick<XPublicProfile, "avatarUrl" | "bio" | "headerImageUrl" | "isVerified"> | null> =
    resolveDefaultFreshProfile,
  resolveLatestScrape: (
    accountInput: string,
  ) => Promise<
    | {
        profile: Pick<
          XPublicProfile,
          "avatarUrl" | "bio" | "headerImageUrl" | "isVerified"
        >;
        pinnedPost: XPinnedPost | null;
      }
    | null
  > = resolveDefaultLatestScrapeCapture,
): Promise<OnboardingResult> {
  const withFreshProfile = await hydrateOnboardingProfile(onboarding, resolveProfile);
  const account = onboarding.account || onboarding.profile.username;
  if (!account) {
    return withFreshProfile;
  }

  try {
    const latestScrape = await resolveLatestScrape(account);
    return mergeLatestScrapeIntoOnboarding(withFreshProfile, latestScrape);
  } catch {
    return withFreshProfile;
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
