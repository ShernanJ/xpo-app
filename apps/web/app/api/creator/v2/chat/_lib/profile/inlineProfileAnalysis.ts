import type { V2ConversationMemory } from "@/lib/agent-v2/contracts/chat";
import type { ProfileReplyContext } from "@/lib/agent-v2/grounding/profileReplyContext";
import type { RawOrchestratorResponse } from "@/lib/agent-v2/runtime/types";
import { fetchJsonFromGroq } from "@/lib/agent-v2/agents/llm";
import type { ProfileAnalysisArtifact } from "@/lib/chat/profileAnalysisArtifact";
import {
  analyzeBannerUrlForGrowth,
  type BannerAnalysisResult,
} from "@/lib/creator/bannerAnalysis";
import type { ProfileConversionAudit } from "@/lib/onboarding/profile/profileConversionAudit";
import type { OnboardingResult } from "@/lib/onboarding/types";
import { buildProfileAnalysisQuickReplies } from "@/lib/agent-v2/responses/profileAnalysisQuickReplies";
import { z } from "zod";

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

const ProfileAnalysisNarrativeSchema = z.object({
  response: z.string(),
});

function formatCompactNumber(value: number): string {
  if (value >= 1_000_000) {
    return `${Number((value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1))}M`;
  }

  if (value >= 1_000) {
    return `${Number((value / 1_000).toFixed(value >= 10_000 ? 0 : 1))}K`;
  }

  return String(value);
}

function truncateSnippet(value: string, maxLength: number): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "";
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function formatMetricParts(metrics: {
  likeCount?: number;
  replyCount?: number;
  repostCount?: number;
  quoteCount?: number;
}): string[] {
  const parts: string[] = [];

  if ((metrics.likeCount ?? 0) > 0) {
    parts.push(`**${formatCompactNumber(metrics.likeCount ?? 0)}** likes`);
  }

  if ((metrics.replyCount ?? 0) > 0) {
    parts.push(`**${formatCompactNumber(metrics.replyCount ?? 0)}** replies`);
  }

  if ((metrics.repostCount ?? 0) > 0) {
    parts.push(`**${formatCompactNumber(metrics.repostCount ?? 0)}** reposts`);
  }

  if ((metrics.quoteCount ?? 0) > 0) {
    parts.push(`**${formatCompactNumber(metrics.quoteCount ?? 0)}** quotes`);
  }

  return parts;
}

function buildPriorityActions(artifact: ProfileAnalysisArtifact): string[] {
  const stepActions = artifact.audit.steps
    .filter((step) => step.status !== "pass")
    .map((step) => `${step.actionLabel}: ${step.summary}`);
  const gapActions = artifact.audit.gaps.map((gap) => gap.replace(/\s+/g, " ").trim());

  return [...new Set([...stepActions, ...gapActions].filter(Boolean))].slice(0, 3);
}

function buildProfileAnalysisFallback(args: {
  artifact: ProfileAnalysisArtifact;
  profileReplyContext?: ProfileReplyContext | null;
}): string {
  const { artifact, profileReplyContext } = args;
  const strongestPost = profileReplyContext?.strongestPost ?? null;
  const strongestPostMetrics = strongestPost
    ? formatMetricParts(strongestPost.metrics)
    : [];
  const strongestPostDetail = strongestPost
    ? strongestPostMetrics.length > 0
      ? `${strongestPostMetrics.join(", ")}`
      : `**${formatCompactNumber(strongestPost.engagementTotal)}** total engagements`
    : null;
  const contentPatterns = profileReplyContext?.topicBullets?.length
    ? profileReplyContext.topicBullets.slice(0, 3)
    : profileReplyContext?.recentPostSnippets?.length
      ? profileReplyContext.recentPostSnippets.slice(0, 3).map((snippet) => truncateSnippet(snippet, 90))
      : [];
  const bannerLine = artifact.bannerAnalysis
    ? `- **Banner:** ${artifact.bannerAnalysis.vision.overall_vibe}, with ${
        artifact.bannerAnalysis.vision.readable_text.trim()
          ? `readable text saying "${artifact.bannerAnalysis.vision.readable_text.trim()}".`
          : "no clear readable headline."
      }`
    : `- **Banner:** ${artifact.audit.visualRealEstateCheck.summary}`;
  const strengths = artifact.audit.strengths.length > 0
    ? artifact.audit.strengths
    : ["The profile already has a recognizable personal identity and a clear surface to improve."];
  const gaps = artifact.audit.gaps.length > 0
    ? artifact.audit.gaps
    : artifact.audit.steps
        .filter((step) => step.status !== "pass")
        .map((step) => step.summary);
  const priorities = buildPriorityActions(artifact);

  const lines = [
    `**Verdict:** ${artifact.audit.headline}`,
    "",
    "## Profile Snapshot",
    `- **Bio:** "${artifact.profile.bio || "No bio set yet."}"`,
    `- **Audience signal:** ${formatCompactNumber(artifact.profile.followersCount)} followers, ${formatCompactNumber(artifact.profile.followingCount)} following.`,
    bannerLine,
    `- **Pinned post:** ${
      artifact.pinnedPost?.text?.trim()
        ? `"${truncateSnippet(artifact.pinnedPost.text, 120)}"`
        : "No pinned post is visible in the current snapshot."
    }`,
    "",
    "## Content Patterns",
  ];

  if (contentPatterns.length > 0) {
    lines.push(
      ...contentPatterns.map((pattern) => `- **Inference:** recent posts are clustering around ${pattern}.`),
    );
  } else {
    lines.push(
      "- **Inference:** the current recent-post sample is thin, so the content-pattern read is lower confidence.",
    );
  }

  if (strongestPost && strongestPostDetail) {
    lines.push(
      `- **Strongest recent post:** "${truncateSnippet(strongestPost.text, 110)}" with ${strongestPostDetail}.`,
    );
  }

  lines.push("", "## What's Working");
  lines.push(...strengths.slice(0, 3).map((strength) => `- ${strength}`));

  lines.push("", "## Gaps / Risks");
  lines.push(...gaps.slice(0, 4).map((gap) => `- ${gap}`));

  if (artifact.audit.unknowns.length > 0) {
    lines.push(
      ...artifact.audit.unknowns.slice(0, 2).map((unknown) => `- **Open question:** ${unknown}`),
    );
  }

  lines.push("", "## Priority Order");
  if (priorities.length > 0) {
    lines.push(...priorities.map((priority, index) => `${index + 1}. ${priority}`));
  } else {
    lines.push(
      "1. Tighten the bio so the audience, outcome, and proof are explicit.",
      "2. Sharpen the banner so the promise is obvious at a glance.",
      "3. Replace the pinned post with a clearer authority or origin-story asset.",
    );
  }

  return lines.join("\n");
}

export async function generateProfileAnalysisNarrative(args: {
  artifact: ProfileAnalysisArtifact;
  profileReplyContext?: ProfileReplyContext | null;
}): Promise<string | null> {
  const strongestPost = args.profileReplyContext?.strongestPost ?? null;
  const prompt = `
You are an X profile strategist. Write a crisp, evidence-based profile audit in tasteful markdown.

VOICE:
- Professional, direct, analytical.
- No slang, no hype, no filler, no cheerleading.
- Use standard casing unless the supplied evidence clearly requires otherwise.

FORMAT:
- Start with one bold thesis line.
- Then use these exact sections:
  ## Profile Snapshot
  ## Content Patterns
  ## What's Working
  ## Gaps / Risks
  ## Priority Order
- Use bullets inside sections when helpful.
- If a point is inferential, label it as "Inference:" instead of stating it as certain fact.

GROUNDING RULES:
- Use only the evidence in this prompt.
- Do not invent counts, timelines, engagement, audience, or post topics.
- If recent-post evidence is thin, say so.
- Keep the response scannable and under roughly 350 words.

PROFILE DATA:
- Name: ${args.artifact.profile.name}
- Handle: @${args.artifact.profile.username}
- Bio: ${args.artifact.profile.bio || "None"}
- Followers: ${args.artifact.profile.followersCount}
- Following: ${args.artifact.profile.followingCount}
- Headline: ${args.artifact.audit.headline}
- Audit score: ${args.artifact.audit.score}/100
- Audit strengths: ${args.artifact.audit.strengths.join(" | ") || "None"}
- Audit gaps: ${args.artifact.audit.gaps.join(" | ") || "None"}
- Unknowns: ${args.artifact.audit.unknowns.join(" | ") || "None"}
- Bio summary: ${args.artifact.audit.bioFormulaCheck.summary}
- Banner summary: ${args.artifact.audit.visualRealEstateCheck.summary}
- Pinned summary: ${args.artifact.audit.pinnedTweetCheck.summary}
- Recommended bio direction: ${args.artifact.audit.bioFormulaCheck.alternatives[0]?.text || "None"}
- Pinned preview: ${args.artifact.pinnedPost?.text || "None"}
- Recent themes: ${args.profileReplyContext?.topicBullets.join(" | ") || "None"}
- Recent snippets: ${args.profileReplyContext?.recentPostSnippets.join(" | ") || "None"}
- Strongest post: ${strongestPost?.text || "None"}
- Strongest post engagement total: ${strongestPost?.engagementTotal ?? "None"}
- Strongest post reasons: ${strongestPost?.reasons.join(" | ") || "None"}
- Banner visual vibe: ${args.artifact.bannerAnalysis?.vision.overall_vibe || "None"}
- Banner readable text: ${args.artifact.bannerAnalysis?.vision.readable_text.trim() || "None"}
- Banner improvement: ${
    args.artifact.bannerAnalysis?.feedback.actionable_improvements[0] ||
    "None"
  }

Return valid JSON:
{
  "response": "..."
}
  `.trim();

  const data = await fetchJsonFromGroq<unknown>({
    model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    reasoning_effort: "low",
    temperature: 0.35,
    max_tokens: 700,
    messages: [{ role: "system", content: prompt }],
  });

  if (!data) {
    return null;
  }

  try {
    return ProfileAnalysisNarrativeSchema.parse(data).response.trim() || null;
  } catch (error) {
    console.error("Profile analysis narrative validation failed", error);
    return null;
  }
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
  profileReplyContext?: ProfileReplyContext | null;
  generateNarrative?: (args: {
    artifact: ProfileAnalysisArtifact;
    profileReplyContext?: ProfileReplyContext | null;
  }) => Promise<string | null>;
}): Promise<RawOrchestratorResponse> {
  const artifact = await buildProfileAnalysisArtifact(args);
  const response =
    (await args.generateNarrative?.({
      artifact,
      profileReplyContext: args.profileReplyContext,
    })) ||
    buildProfileAnalysisFallback({
      artifact,
      profileReplyContext: args.profileReplyContext,
    });

  return {
    mode: "coach",
    outputShape: "profile_analysis",
    response,
    data: {
      quickReplies: buildProfileAnalysisQuickReplies(artifact),
      profileAnalysisArtifact: artifact,
    },
    memory: {
      ...args.memory,
      assistantTurnCount: (args.memory.assistantTurnCount ?? 0) + 1,
      unresolvedQuestion: null,
      preferredSurfaceMode: "structured",
    },
    presentationStyle: "preserve_authored_structure",
  };
}
