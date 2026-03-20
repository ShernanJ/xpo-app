import type { V2ConversationMemory } from "@/lib/agent-v2/contracts/chat";
import type { ProfileReplyContext } from "@/lib/agent-v2/grounding/profileReplyContext";
import type { RawOrchestratorResponse } from "@/lib/agent-v2/runtime/types";
import { fetchStructuredJsonFromGroq } from "@/lib/agent-v2/agents/llm";
import type { ProfileAnalysisArtifact } from "@/lib/chat/profileAnalysisArtifact";
import {
  analyzeBannerUrlForGrowth,
  type BannerAnalysisResult,
} from "@/lib/creator/bannerAnalysis";
import type { CreatorAgentContext } from "@/lib/onboarding/strategy/agentContext";
import {
  buildProfileConversionAudit,
  type ProfileConversionAudit,
} from "@/lib/onboarding/profile/profileConversionAudit";
import type { ProfileAnalysisPinnedPostImageAnalysis } from "@/lib/onboarding/profile/pinnedPostImageAnalysis";
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

const PINNED_POST_IMAGE_ANALYSIS_MODEL =
  process.env.PINNED_POST_IMAGE_ANALYSIS_VISION_MODEL?.trim() ||
  process.env.GROQ_REPLY_IMAGE_VISION_MODEL?.trim() ||
  "meta-llama/llama-4-scout-17b-16e-instruct";

const PinnedPostImageAnalysisSchema = z.object({
  imageRole: z.enum(["proof", "product", "personal_brand", "meme", "context", "unknown"]),
  readableText: z.string(),
  primarySubject: z.string(),
  sceneSummary: z.string(),
  strategicSignal: z.string(),
  keyDetails: z.array(z.string()).max(8),
});

type ResolvePinnedPostImageAnalysisFn = (args: {
  imageUrl: string;
  onboarding: OnboardingResult;
}) => Promise<ProfileAnalysisPinnedPostImageAnalysis | null>;

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

type ContentPatternSignal = {
  kind: "proof" | "positioning" | "theme" | "engagement";
  summary: string;
  evidence: string[];
  priority: number;
};

type StructuredSectionItem = {
  lead: string;
  details?: string[];
};

const LOW_LEVERAGE_SNIPPET_PATTERNS = [
  /\b(sf|nyc|toronto|la|london|vancouver)\b.{0,24}\b(one week|weekend|week)\b/i,
  /^holy fucking cinema\b/i,
  /\bplease\b.*\bneed this\b/i,
  /🥹|😭|😂|🤣|lol|lmao/i,
];

function normalizeSentence(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function ensureSentence(value: string): string {
  const normalized = normalizeSentence(value);
  if (!normalized) {
    return "";
  }

  return /[.?!]$/.test(normalized) ? normalized : `${normalized}.`;
}

function stripTerminalPunctuation(value: string): string {
  return normalizeSentence(value).replace(/[.?!:;]+$/g, "").trim();
}

function sentenceCase(value: string): string {
  const normalized = stripTerminalPunctuation(value);
  if (!normalized) {
    return "";
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function isLowLeverageSnippet(value: string | null | undefined): boolean {
  const normalized = normalizeSentence(value || "").replace(/https?:\/\/\S+/gi, "").trim();
  if (!normalized) {
    return true;
  }

  if (LOW_LEVERAGE_SNIPPET_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  if (/^(please|anyone|someone)\b/i.test(normalized)) {
    return true;
  }

  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  if (
    wordCount <= 6 &&
    !/\b(gpu|infra|inference|engineer|builders?|growth|distribution|proof|revenue|mrr|arr|award|winner|prize|trophy|founder|startup|ai|product)\b/i.test(
      normalized,
    )
  ) {
    return true;
  }

  return false;
}

function formatQuotedSnippet(value: string, maxLength = 96): string {
  return `"${truncateSnippet(value, maxLength)}"`;
}

function buildBulletLines(items: StructuredSectionItem[]): string[] {
  const lines: string[] = [];

  for (const item of items) {
    lines.push(`- ${ensureSentence(item.lead)}`);

    for (const detail of item.details || []) {
      lines.push(`  - ${ensureSentence(detail)}`);
    }
  }

  return lines;
}

function buildPriorityActions(artifact: ProfileAnalysisArtifact): StructuredSectionItem[] {
  const items: StructuredSectionItem[] = [];
  const bioAlternative = artifact.audit.bioFormulaCheck.alternatives[0]?.text?.trim() || null;
  const pinnedProof = artifact.audit.pinnedTweetCheck.visualEvidenceSummary?.trim() || null;

  if (artifact.audit.bioFormulaCheck.status !== "pass") {
    items.push({
      lead: "Tighten the bio so a new visitor instantly understands who the profile is for and why this account is worth following",
      details: bioAlternative
        ? [`A stronger direction would sound closer to ${formatQuotedSnippet(bioAlternative, 110)}`]
        : ["Spell out the audience, the topic lane, and a proof point or call to action in one line"],
    });
  }

  if (artifact.audit.visualRealEstateCheck.status !== "pass") {
    items.push({
      lead: "Turn the banner into a clear promise instead of background atmosphere",
      details: [artifact.audit.visualRealEstateCheck.summary],
    });
  }

  if (artifact.audit.pinnedTweetCheck.status !== "pass") {
    items.push({
      lead:
        artifact.audit.pinnedTweetCheck.proofStrength === "high"
          ? "Turn the pinned proof into a short story that explains the win and why it matters to the next follower"
          : "Replace the pinned post with a clearer proof-led or thesis-led asset",
      details: [
        pinnedProof
          ? `${pinnedProof} Let the copy explain the result instead of making the image do all the work`
          : artifact.audit.pinnedTweetCheck.summary,
      ],
    });
  }

  const gapItems = artifact.audit.gaps
    .map((gap) => normalizeSentence(gap))
    .filter(Boolean)
    .slice(0, 2)
    .map((gap) => ({
      lead: gap,
    }));

  return [...items, ...gapItems].slice(0, 3);
}

function canRunVisionEnrichment(): boolean {
  return Boolean(process.env.GROQ_API_KEY?.trim()) &&
    !process.argv.includes("--test") &&
    !process.execArgv.includes("--test") &&
    process.env.NODE_ENV !== "test";
}

function formatPinnedPostImageContext(
  analysis: ProfileAnalysisPinnedPostImageAnalysis | null | undefined,
): string | null {
  if (!analysis) {
    return null;
  }

  const parts = [
    truncateSnippet(analysis.sceneSummary, 160),
    analysis.readableText.trim()
      ? `Readable text: "${truncateSnippet(analysis.readableText, 120)}".`
      : null,
    truncateSnippet(analysis.strategicSignal, 160),
  ].filter((value): value is string => Boolean(value));

  if (parts.length === 0) {
    return null;
  }

  return [...new Set(parts)].join(" ");
}

function formatTopicInsightsForPrompt(
  profileReplyContext: ProfileReplyContext | null | undefined,
): string {
  const insights = profileReplyContext?.topicInsights?.slice(0, 3) || [];
  if (insights.length === 0) {
    return "None";
  }

  return insights
    .map((insight) => {
      const evidence = insight.evidenceSnippets
        .slice(0, 2)
        .map((snippet) => `"${truncateSnippet(snippet, 80)}"`)
        .join(" / ");
      return `${insight.label} [${insight.confidence}; ${insight.source}; evidence: ${evidence}]`;
    })
    .join(" | ");
}

function buildContentPatternSignals(args: {
  artifact: ProfileAnalysisArtifact;
  profileReplyContext?: ProfileReplyContext | null;
}): ContentPatternSignal[] {
  const { artifact, profileReplyContext } = args;
  const signals: ContentPatternSignal[] = [];
  const pinnedProof = artifact.audit.pinnedTweetCheck.visualEvidenceSummary?.trim() ||
    formatPinnedPostImageContext(artifact.pinnedPostImageAnalysis);
  const pinnedReadableText = artifact.pinnedPostImageAnalysis?.readableText?.trim() || "";
  const proofStrength = artifact.audit.pinnedTweetCheck.proofStrength || "none";

  if (proofStrength !== "none" && pinnedProof) {
    signals.push({
      kind: "proof",
      summary:
        proofStrength === "high"
          ? "The strongest signal on the profile is visible proof of a real win"
          : "The pinned post carries proof, even if the packaging still needs work",
      evidence: [
        pinnedProof,
        pinnedReadableText ? `Visible text reinforces it with ${formatQuotedSnippet(pinnedReadableText, 90)}` : "",
        artifact.pinnedPost?.text?.trim()
          ? `The caption itself is still brief: ${formatQuotedSnippet(artifact.pinnedPost.text, 90)}`
          : "",
      ].filter(Boolean),
      priority: proofStrength === "high" ? 100 : proofStrength === "medium" ? 84 : 70,
    });
  }

  const positioningLabel =
    profileReplyContext?.knownFor?.trim() ||
    profileReplyContext?.contentPillars.find((value) => value.trim().includes(" ")) ||
    "";
  const bio = artifact.profile.bio?.trim() || "";

  if (positioningLabel || bio) {
    signals.push({
      kind: "positioning",
      summary: positioningLabel
        ? `The profile is pointing toward ${stripTerminalPunctuation(positioningLabel).toLowerCase()}, but the follower payoff is still implied more than stated`
        : "The profile hints at a real lane, but a new visitor still has to guess the payoff",
      evidence: [
        bio ? `Bio: ${formatQuotedSnippet(bio, 100)}` : "",
        profileReplyContext?.targetAudience?.trim()
          ? `The likely audience looks like ${stripTerminalPunctuation(profileReplyContext.targetAudience).toLowerCase()}`
          : "",
      ].filter(Boolean),
      priority: 76,
    });
  }

  for (const insight of profileReplyContext?.topicInsights || []) {
    if (insight.kind !== "theme" || isLowLeverageSnippet(insight.label)) {
      continue;
    }

    signals.push({
      kind: "theme",
      summary:
        insight.confidence === "low"
          ? `There may be an opening around ${stripTerminalPunctuation(insight.label).toLowerCase()}, but it is not fully reinforced yet`
          : `The most believable repeatable lane looks like ${stripTerminalPunctuation(insight.label).toLowerCase()}`,
      evidence: insight.evidenceSnippets
        .slice(0, 2)
        .filter((snippet) => !isLowLeverageSnippet(snippet))
        .map((snippet) => `Post evidence: ${formatQuotedSnippet(snippet, 92)}`),
      priority:
        insight.confidence === "high" ? 66 : insight.confidence === "medium" ? 58 : 48,
    });
  }

  const strongestPost = profileReplyContext?.strongestPost ?? null;
  if (strongestPost && !isLowLeverageSnippet(strongestPost.text)) {
    const metricParts = formatMetricParts(strongestPost.metrics);
    const performanceDetail = metricParts.length > 0
      ? metricParts.join(", ")
      : `**${formatCompactNumber(strongestPost.engagementTotal)}** total engagements`;

    signals.push({
      kind: "engagement",
      summary: "One recent post shows there is already a usable attention hook here",
      evidence: [
        `${formatQuotedSnippet(strongestPost.text, 95)} performed best with ${performanceDetail}`,
        ...strongestPost.reasons.slice(0, 1),
      ],
      priority: 42,
    });
  }

  const deduped = new Map<string, ContentPatternSignal>();
  for (const signal of signals) {
    const key = signal.summary.toLowerCase();
    if (!deduped.has(key) || (deduped.get(key)?.priority || 0) < signal.priority) {
      deduped.set(key, signal);
    }
  }

  return Array.from(deduped.values())
    .sort((left, right) => right.priority - left.priority)
    .slice(0, 3);
}

function summarizeLeadSignal(signal: ContentPatternSignal | undefined): string {
  if (!signal) {
    return "The content read is still directional because the current sample is thin.";
  }

  if (signal.kind === "proof") {
    return "Your clearest signal right now is real proof of achievement.";
  }

  if (signal.kind === "positioning") {
    return "Your clearest signal right now is a believable technical lane, but the payoff still needs to be spelled out.";
  }

  if (signal.kind === "theme") {
    return "Your clearest signal right now is a repeatable content lane that could be sharpened.";
  }

  return "Your clearest signal right now is that at least one recent post can already hold attention.";
}

function buildProfileAnalysisFallback(args: {
  artifact: ProfileAnalysisArtifact;
  profileReplyContext?: ProfileReplyContext | null;
}): string {
  const { artifact, profileReplyContext } = args;
  const strongestPost = profileReplyContext?.strongestPost ?? null;
  const contentSignals = buildContentPatternSignals({
    artifact,
    profileReplyContext,
  });
  const strengths = artifact.audit.strengths.length > 0
    ? artifact.audit.strengths
    : ["The profile already has a recognizable personal identity and a clear surface to improve."];
  const gaps = artifact.audit.gaps.length > 0
    ? artifact.audit.gaps
    : artifact.audit.steps
        .filter((step) => step.status !== "pass")
        .map((step) => step.summary);
  const priorities = buildPriorityActions(artifact);
  const pinnedImageContext =
    artifact.audit.pinnedTweetCheck.visualEvidenceSummary ||
    formatPinnedPostImageContext(artifact.pinnedPostImageAnalysis);
  const bio = artifact.profile.bio?.trim() || "No bio set yet.";
  const pinnedText = artifact.pinnedPost?.text?.trim() || "";
  const profileSnapshotItems: StructuredSectionItem[] = [
    {
      lead: `The bio currently reads ${formatQuotedSnippet(bio, 110)}`,
      details: [
        profileReplyContext?.knownFor?.trim()
          ? `It points toward ${stripTerminalPunctuation(profileReplyContext.knownFor).toLowerCase()}`
          : "The lane is still more implied than explicit",
        profileReplyContext?.targetAudience?.trim()
          ? `A likely audience is ${stripTerminalPunctuation(profileReplyContext.targetAudience).toLowerCase()}`
          : "The target audience is not obvious yet",
      ],
    },
    {
      lead: artifact.bannerAnalysis
        ? `The banner reads as ${stripTerminalPunctuation(artifact.bannerAnalysis.vision.overall_vibe).toLowerCase()}`
        : artifact.audit.visualRealEstateCheck.summary,
      details: [
        artifact.bannerAnalysis?.vision.readable_text.trim()
          ? `Readable text: ${formatQuotedSnippet(artifact.bannerAnalysis.vision.readable_text.trim(), 90)}`
          : "There is no clear readable headline doing conversion work yet",
      ],
    },
    {
      lead: pinnedText
        ? `The pinned post caption is ${formatQuotedSnippet(pinnedText, 110)}`
        : "There is no pinned post visible in the current snapshot",
      details: pinnedImageContext
        ? [pinnedImageContext]
        : ["The pinned asset is not carrying a strong proof signal yet"],
    },
  ];
  const contentPatternItems: StructuredSectionItem[] = contentSignals.length > 0
    ? contentSignals.map((signal) => ({
        lead: sentenceCase(signal.summary),
        details: signal.evidence,
      }))
    : profileReplyContext?.recentPostSnippets?.length
      ? [
          {
            lead: "The recent-post sample is still thin, so this read is mostly directional",
            details: [
              `The clearest snippet available right now is ${formatQuotedSnippet(profileReplyContext.recentPostSnippets[0], 90)}`,
            ],
          },
        ]
      : [
          {
            lead: "The current snapshot is too thin to make a confident content-pattern read",
          },
        ];
  const workingItems = strengths.slice(0, 3).map((strength) => ({ lead: strength }));
  if (strongestPost && !isLowLeverageSnippet(strongestPost.text)) {
    const strongestPostMetrics = formatMetricParts(strongestPost.metrics);
    workingItems.push({
      lead: "There is already at least one post that can hold attention",
      details: [
        `${formatQuotedSnippet(strongestPost.text, 100)} performed best${
          strongestPostMetrics.length > 0 ? ` with ${strongestPostMetrics.join(", ")}` : ""
        }`,
      ],
    });
  }
  const gapItems = gaps.slice(0, 4).map((gap) => ({ lead: gap }));

  const lines = [
    `**Verdict:** ${artifact.audit.headline}`,
    "",
    "## Profile Snapshot",
    "Here is what a first-time visitor is picking up in the first few seconds.",
    ...buildBulletLines(profileSnapshotItems),
    "",
    "## Content Patterns",
    summarizeLeadSignal(contentSignals[0]),
    ...buildBulletLines(contentPatternItems),
    "",
    "## What's Working",
    "There is already enough signal here to build a much stronger profile story.",
    ...buildBulletLines(workingItems.slice(0, 3)),
    "",
    "## Gaps / Risks",
    "The main leaks are about packaging and clarity, not a lack of real signal.",
    ...buildBulletLines(gapItems),
  ];

  if (artifact.audit.unknowns.length > 0) {
    lines.push(
      ...buildBulletLines(
        artifact.audit.unknowns.slice(0, 2).map((unknown) => ({
          lead: `Open question: ${unknown}`,
        })),
      ),
    );
  }

  lines.push("", "## Priority Order");
  if (priorities.length > 0) {
    lines.push("If you only change three things next, change them in this order.");
    priorities.forEach((priority, index) => {
      lines.push(`${index + 1}. ${ensureSentence(priority.lead)}`);
      for (const detail of priority.details || []) {
        lines.push(`   - ${ensureSentence(detail)}`);
      }
    });
  } else {
    lines.push(
      "If you only change three things next, change them in this order.",
      "1. Tighten the bio so the audience, outcome, and proof are explicit.",
      "   - Give a new visitor a reason to follow without making them infer the value.",
      "2. Sharpen the banner so the promise is obvious at a glance.",
      "   - Use the header as readable positioning, not just mood.",
      "3. Replace the pinned post with a clearer authority or origin-story asset.",
      "   - Lead with proof and explain why the proof matters.",
    );
  }

  return lines.join("\n");
}

export async function generateProfileAnalysisNarrative(args: {
  artifact: ProfileAnalysisArtifact;
  profileReplyContext?: ProfileReplyContext | null;
}): Promise<string | null> {
  const strongestPost = args.profileReplyContext?.strongestPost ?? null;
  const pinnedImageContext = formatPinnedPostImageContext(args.artifact.pinnedPostImageAnalysis);
  const prompt = `
You are a friendly but sharp X profile coach. Write a crisp, evidence-based profile audit in tasteful markdown.

VOICE:
- Sound like a thoughtful coach giving practical advice.
- Be warm, specific, and plainspoken.
- No corporate jargon, no robotic diagnostics, no hype.
- Use standard casing unless the supplied evidence clearly requires otherwise.

FORMAT:
- Start with one bold thesis line.
- Then use these exact sections:
  ## Profile Snapshot
  ## Content Patterns
  ## What's Working
  ## Gaps / Risks
  ## Priority Order
- Each section should open with one short summary sentence.
- Then use 2-3 bullets.
- Use one level of nested bullets for evidence or examples.
- Do not write labels like "Recent theme:" or confidence parentheticals like "(medium-confidence signal)".
- If a point is inferential, soften the wording naturally instead of printing a confidence score.

GROUNDING RULES:
- Use only the evidence in this prompt.
- Do not invent counts, timelines, engagement, audience, or post topics.
- Never turn filler words, common verbs, or low-signal repeated words into "themes."
- Single reactive posts, meme-y one-offs, asks, or location chatter should not become main themes unless they clearly repeat and connect to a broader profile signal.
- Every Content Patterns point must be backed by at least one supplied snippet or explicit topic insight.
- Treat pinned-image proof as first-class evidence when judging the pinned post.
- Let pinned proof outrank weak recent-post noise when it is the strongest thing a new visitor would notice.
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
- Pinned proof strength: ${args.artifact.audit.pinnedTweetCheck.proofStrength || "none"}
- Pinned visual evidence: ${args.artifact.audit.pinnedTweetCheck.visualEvidenceSummary || "None"}
- Recommended bio direction: ${args.artifact.audit.bioFormulaCheck.alternatives[0]?.text || "None"}
- Pinned preview: ${args.artifact.pinnedPost?.text || "None"}
- Pinned image context: ${pinnedImageContext || "None"}
- Pinned image role: ${args.artifact.pinnedPostImageAnalysis?.imageRole || "None"}
- Pinned image readable text: ${args.artifact.pinnedPostImageAnalysis?.readableText || "None"}
- Pinned image key details: ${args.artifact.pinnedPostImageAnalysis?.keyDetails.join(" | ") || "None"}
- Topic insights: ${formatTopicInsightsForPrompt(args.profileReplyContext)}
- Recent themes (legacy): ${args.profileReplyContext?.topicBullets.join(" | ") || "None"}
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

  const data = await fetchStructuredJsonFromGroq({
    schema: ProfileAnalysisNarrativeSchema,
    modelTier: "extraction",
    fallbackModel: "openai/gpt-oss-120b",
    reasoning_effort: "low",
    temperature: 0.35,
    max_tokens: 700,
    messages: [{ role: "system", content: prompt }],
  });

  return data?.response.trim() || null;
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

async function resolvePinnedPostImageAnalysis(args: {
  onboarding: OnboardingResult;
  analyzePinnedPostImage?: ResolvePinnedPostImageAnalysisFn;
}): Promise<ProfileAnalysisPinnedPostImageAnalysis | null> {
  const imageUrl = args.onboarding.pinnedPost?.imageUrls?.find(
    (value) => typeof value === "string" && value.trim().length > 0,
  )?.trim();
  if (!imageUrl) {
    return null;
  }

  try {
    if (args.analyzePinnedPostImage) {
      return await args.analyzePinnedPostImage({
        imageUrl,
        onboarding: args.onboarding,
      });
    }

    if (!canRunVisionEnrichment()) {
      return null;
    }

    return await fetchStructuredJsonFromGroq({
      schema: PinnedPostImageAnalysisSchema,
      model: PINNED_POST_IMAGE_ANALYSIS_MODEL,
      temperature: 0,
      max_tokens: 600,
      reasoning_effort: "low",
      messages: [
        {
          role: "system",
          content: [
            "You analyze images attached to pinned X posts for profile audits.",
            "Return only strict JSON with keys imageRole, readableText, primarySubject, sceneSummary, strategicSignal, keyDetails.",
            "imageRole must be one of proof, product, personal_brand, meme, context, unknown.",
            "Focus on what a first-time profile visitor would infer from the image.",
            "sceneSummary should describe what is visibly shown in one short sentence.",
            "strategicSignal should explain what the image communicates for authority, proof, positioning, or tone in one short sentence.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                `Pinned post text: ${args.onboarding.pinnedPost?.text?.trim() || "None"}`,
                `Account: @${args.onboarding.profile.username}`,
                "Analyze the pinned-post image for profile-conversion context now.",
              ].join("\n"),
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl,
              },
            },
          ],
        },
      ],
    });
  } catch (error) {
    console.error("Inline profile analysis pinned-image enrichment failed", error);
    return null;
  }
}

export async function buildProfileAnalysisArtifact(args: {
  onboarding: OnboardingResult;
  audit: ProfileConversionAudit;
  creatorAgentContext?: CreatorAgentContext | null;
  analyzeBannerUrl?: (bannerUrl: string) => Promise<BannerAnalysisResult>;
  analyzePinnedPostImage?: ResolvePinnedPostImageAnalysisFn;
}): Promise<ProfileAnalysisArtifact> {
  const [bannerAnalysis, pinnedPostImageAnalysis] = await Promise.all([
    resolveProfileBannerAnalysis({
      onboarding: args.onboarding,
      analyzeBannerUrl: args.analyzeBannerUrl,
    }),
    resolvePinnedPostImageAnalysis({
      onboarding: args.onboarding,
      analyzePinnedPostImage: args.analyzePinnedPostImage,
    }),
  ]);
  const audit = args.creatorAgentContext
    ? buildProfileConversionAudit({
        onboarding: args.onboarding,
        context: args.creatorAgentContext,
        profileAuditState: args.creatorAgentContext.profileAuditState ?? null,
        pinnedPostImageAnalysis,
      })
    : args.audit;

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
      score: audit.score,
      headline: audit.headline,
      fingerprint: audit.fingerprint,
      shouldAutoOpen: audit.shouldAutoOpen,
      steps: audit.steps,
      strengths: audit.strengths,
      gaps: audit.gaps,
      unknowns: audit.unknowns,
      bioFormulaCheck: audit.bioFormulaCheck,
      visualRealEstateCheck: audit.visualRealEstateCheck,
      pinnedTweetCheck: audit.pinnedTweetCheck,
    },
    bannerAnalysis,
    pinnedPostImageAnalysis,
  };
}

export async function buildInlineProfileAnalysisResponse(args: {
  onboarding: OnboardingResult;
  audit: ProfileConversionAudit;
  memory: V2ConversationMemory;
  creatorAgentContext?: CreatorAgentContext | null;
  analyzeBannerUrl?: (bannerUrl: string) => Promise<BannerAnalysisResult>;
  analyzePinnedPostImage?: ResolvePinnedPostImageAnalysisFn;
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
