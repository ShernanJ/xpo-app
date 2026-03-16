import type { V2ConversationMemory } from "@/lib/agent-v2/contracts/chat";
import type { RawOrchestratorResponse } from "@/lib/agent-v2/runtime/types";
import type { ProfileAnalysisArtifact } from "@/lib/chat/profileAnalysisArtifact";
import {
  analyzeBannerUrlForGrowth,
  type BannerAnalysisResult,
} from "@/lib/creator/bannerAnalysis";
import type { ProfileConversionAudit } from "@/lib/onboarding/profile/profileConversionAudit";
import type { OnboardingResult } from "@/lib/onboarding/types";

function normalizePrompt(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isInlineProfileAnalysisRequest(value: string): boolean {
  const normalized = normalizePrompt(value);
  if (!normalized) {
    return false;
  }

  if (
    /\b(analy[sz]e|audit|review|check|grade|roast|inspect)\b/.test(normalized) &&
    /\b(my|our)\b/.test(normalized) &&
    /\b(?:(?:x|twitter)\s+)?(?:profile|bio|banner|header|pinned tweet|pinned post)\b/.test(
      normalized,
    )
  ) {
    return true;
  }

  return (
    normalized === "analyze my profile" ||
    normalized === "audit my profile" ||
    normalized === "review my profile" ||
    normalized === "check my profile" ||
    normalized === "roast my profile"
  );
}

async function resolveProfileBannerAnalysis(args: {
  onboarding: OnboardingResult;
  analyzeBannerUrl?: (bannerUrl: string) => Promise<BannerAnalysisResult>;
}): Promise<BannerAnalysisResult | null> {
  const bannerUrl = args.onboarding.profile.headerImageUrl?.trim() || "";
  if (!bannerUrl) {
    return null;
  }

  try {
    const analyzeBannerUrl =
      args.analyzeBannerUrl ||
      (async (value: string) =>
        analyzeBannerUrlForGrowth({
          bannerUrl: value,
        }));

    return await analyzeBannerUrl(bannerUrl);
  } catch (error) {
    console.error("Inline profile analysis banner enrichment failed", error);
    return null;
  }
}

export async function buildProfileAnalysisArtifact(args: {
  onboarding: OnboardingResult;
  audit: ProfileConversionAudit;
  analyzeBannerUrl?: (bannerUrl: string) => Promise<BannerAnalysisResult>;
}): Promise<ProfileAnalysisArtifact> {
  const bannerAnalysis = await resolveProfileBannerAnalysis({
    onboarding: args.onboarding,
    analyzeBannerUrl: args.analyzeBannerUrl,
  });

  return {
    kind: "profile_analysis",
    profile: {
      username: args.onboarding.profile.username,
      name: args.onboarding.profile.name,
      bio: args.onboarding.profile.bio,
      avatarUrl: args.onboarding.profile.avatarUrl ?? null,
      headerImageUrl: args.onboarding.profile.headerImageUrl ?? null,
      isVerified: args.onboarding.profile.isVerified ?? false,
      followersCount: args.onboarding.profile.followersCount,
      followingCount: args.onboarding.profile.followingCount,
      createdAt: args.onboarding.profile.createdAt,
    },
    pinnedPost: args.onboarding.pinnedPost,
    audit: {
      score: args.audit.score,
      headline: args.audit.headline,
      fingerprint: args.audit.fingerprint,
      shouldAutoOpen: args.audit.shouldAutoOpen,
      steps: args.audit.steps,
      strengths: args.audit.strengths,
      gaps: args.audit.gaps,
      unknowns: args.audit.unknowns,
      bioFormulaCheck: args.audit.bioFormulaCheck,
      visualRealEstateCheck: args.audit.visualRealEstateCheck,
      pinnedTweetCheck: args.audit.pinnedTweetCheck,
    },
    bannerAnalysis,
  };
}

export async function buildInlineProfileAnalysisResponse(args: {
  onboarding: OnboardingResult;
  audit: ProfileConversionAudit;
  memory: V2ConversationMemory;
  analyzeBannerUrl?: (bannerUrl: string) => Promise<BannerAnalysisResult>;
}): Promise<RawOrchestratorResponse> {
  const artifact = await buildProfileAnalysisArtifact(args);
  const bannerLine = artifact.bannerAnalysis
    ? " i also pulled a visual read on what the banner image is communicating right now."
    : "";

  return {
    mode: "coach",
    outputShape: "profile_analysis",
    response:
      `here's the current read on your x profile. i graded the bio, banner, and pinned post underneath.${bannerLine}`,
    data: {
      profileAnalysisArtifact: artifact,
    },
    memory: {
      ...args.memory,
      assistantTurnCount: (args.memory.assistantTurnCount ?? 0) + 1,
      unresolvedQuestion: null,
    },
  };
}
