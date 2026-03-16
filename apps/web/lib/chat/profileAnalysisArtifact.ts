import type { ProfileConversionAudit } from "../onboarding/profile/profileConversionAudit.ts";
import type { XPinnedPost, XPublicProfile } from "../onboarding/types.ts";
import type { BannerAnalysisResult } from "../creator/bannerAnalysis.ts";

export interface ProfileAnalysisArtifact {
  kind: "profile_analysis";
  profile: Pick<
    XPublicProfile,
    | "username"
    | "name"
    | "bio"
    | "avatarUrl"
    | "headerImageUrl"
    | "isVerified"
    | "followersCount"
    | "followingCount"
    | "createdAt"
  >;
  pinnedPost: XPinnedPost | null;
  audit: Pick<
    ProfileConversionAudit,
    | "score"
    | "headline"
    | "fingerprint"
    | "shouldAutoOpen"
    | "steps"
    | "strengths"
    | "gaps"
    | "unknowns"
    | "bioFormulaCheck"
    | "visualRealEstateCheck"
    | "pinnedTweetCheck"
  >;
  bannerAnalysis?: BannerAnalysisResult | null;
}
