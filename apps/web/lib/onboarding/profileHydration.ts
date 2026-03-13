import type { OnboardingResult, XPublicProfile } from "./types.ts";

async function resolveDefaultFreshProfile(accountInput: string) {
  const { resolveFreshOnboardingProfilePreview } = await import("./profilePreview.ts");
  return resolveFreshOnboardingProfilePreview(accountInput);
}

export function mergeFreshProfileIntoOnboarding(
  onboarding: OnboardingResult,
  freshProfile: Pick<XPublicProfile, "avatarUrl" | "isVerified"> | null,
): OnboardingResult {
  if (!freshProfile) {
    return onboarding;
  }

  const avatarChanged =
    typeof freshProfile.avatarUrl === "string" &&
    freshProfile.avatarUrl.length > 0 &&
    freshProfile.avatarUrl !== onboarding.profile.avatarUrl;
  const currentIsVerified = onboarding.profile.isVerified === true;
  const nextIsVerified = currentIsVerified || freshProfile.isVerified === true;
  const verifiedChanged = nextIsVerified !== currentIsVerified;

  if (!avatarChanged && !verifiedChanged) {
    return onboarding;
  }

  return {
    ...onboarding,
    profile: {
      ...onboarding.profile,
      ...(avatarChanged ? { avatarUrl: freshProfile.avatarUrl } : {}),
      ...(verifiedChanged ? { isVerified: nextIsVerified } : {}),
    },
  };
}

export async function hydrateOnboardingProfile(
  onboarding: OnboardingResult,
  resolveProfile: (
    accountInput: string,
  ) => Promise<Pick<XPublicProfile, "avatarUrl" | "isVerified"> | null> =
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
