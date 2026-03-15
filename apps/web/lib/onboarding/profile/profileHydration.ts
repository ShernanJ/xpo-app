import type { OnboardingResult, XPublicProfile } from "../types.ts";

async function resolveDefaultFreshProfile(accountInput: string) {
  const { resolveFreshOnboardingProfilePreview } = await import("./profilePreview.ts");
  return resolveFreshOnboardingProfilePreview(accountInput);
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
