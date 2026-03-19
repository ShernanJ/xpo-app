import type { VoiceStyleCard } from "../agent-v2/core/styleProfile.ts";
import type { GrowthStrategySnapshot } from "../onboarding/strategy/growthStrategy.ts";
import type { ReplyDraftPreflightResult } from "./types.ts";
import { buildReplyGroundingPacket } from "./replyDraft.ts";
import {
  buildReplyIntentPlansFromOpportunity,
  buildReplyLearningNotes,
} from "./replyIntent.ts";
import { buildCasualReplyText, buildRecruitingReplyText } from "./casualReply.ts";
import {
  collectKeywords,
  normalizeComparable,
  normalizeWhitespace,
  sanitizeReplyText,
} from "./replyQuality.ts";
import type {
  ExtensionOpportunity,
  ExtensionOpportunityCandidate,
  ExtensionReplyOptionsResponse,
  ExtensionSuggestedAngle,
} from "./types.ts";
import type { ReplyInsights } from "./replyOpportunities.ts";
import type { ReplyConstraintPolicy } from "../reply-engine/index.ts";
import {
  analyzeReplySourceVisualContext,
  buildReplySourceContextFromOpportunityCandidate,
  classifyReplyDraftMode,
  resolveReplyConstraintPolicy,
  resolveSourceInterpretation,
  verifyReplyClaims,
} from "../reply-engine/index.ts";
import type {
  ClaimVerificationResult,
  ReplySourceContext,
  ReplyVisualContextSummary,
} from "../reply-engine/types.ts";

function inferLowercasePreference(styleCard: VoiceStyleCard | null): boolean {
  if (!styleCard) {
    return false;
  }

  const explicitCasing = styleCard.userPreferences?.casing;
  if (explicitCasing === "lowercase") {
    return true;
  }
  if (explicitCasing === "normal" || explicitCasing === "uppercase") {
    return false;
  }

  const signals = [
    ...(styleCard.formattingRules || []),
    ...(styleCard.customGuidelines || []),
  ]
    .join(" ")
    .toLowerCase();

  return (
    signals.includes("all lowercase") ||
    signals.includes("always lowercase") ||
    signals.includes("never uses capitalization") ||
    signals.includes("no uppercase")
  );
}

function inferConcisePreference(styleCard: VoiceStyleCard | null) {
  const pacing = styleCard?.pacing?.toLowerCase() || "";
  const guidance = (styleCard?.customGuidelines || []).join(" ").toLowerCase();
  const writingGoal = styleCard?.userPreferences?.writingGoal;

  return (
    writingGoal === "growth_first" ||
    pacing.includes("short") ||
    pacing.includes("punchy") ||
    pacing.includes("scan") ||
    guidance.includes("tight") ||
    guidance.includes("direct")
  );
}

function applyVoiceCase(value: string, lowercase: boolean) {
  const normalized = normalizeWhitespace(value);
  return lowercase ? normalized.toLowerCase() : normalized;
}

function buildPillarLens(pillar: string) {
  const normalized = pillar.toLowerCase();
  if (/\b(position|niche|brand|coherence)\b/.test(normalized)) {
    return "the positioning clarity";
  }
  if (/\b(reply|conversation|question)\b/.test(normalized)) {
    return "the follow-through in the reply";
  }
  if (/\b(system|workflow|process|loop|operating|framework)\b/.test(normalized)) {
    return "the operating system behind it";
  }
  if (/\b(proof|example|result|case|lesson)\b/.test(normalized)) {
    return "the proof layer";
  }
  return pillar;
}

function pickFocusPhrase(text: string) {
  const keywords = collectKeywords(text);
  if (keywords.length === 0) {
    return "the headline";
  }

  return keywords.slice(0, 2).join(" ");
}

function compactAudience(targetAudience: string) {
  const cleaned = normalizeWhitespace(targetAudience);
  if (!cleaned) {
    return "your audience";
  }

  const words = cleaned.split(" ");
  return words.length > 6 ? words.slice(0, 6).join(" ") : cleaned;
}

function buildTemplate(args: {
  label: ExtensionSuggestedAngle;
  candidate: ExtensionOpportunityCandidate;
  strategy: GrowthStrategySnapshot;
  strategyPillar: string;
  concise: boolean;
}) {
  const focus = pickFocusPhrase(args.candidate.text);
  const lens = buildPillarLens(args.strategyPillar);
  const audience = compactAudience(args.strategy.targetAudience);

  switch (args.label) {
    case "nuance":
      return args.concise
        ? `the useful nuance is ${lens}. that's what turns ${focus} into something people can actually use.`
        : `the useful nuance is ${lens}. that's usually what turns ${focus} from an agreeable point into something someone can actually use.`;
    case "sharpen":
      return args.concise
        ? `sharper take: ${focus} is not the real hinge. ${lens} is. that's the part that changes what someone does next.`
        : `sharper version: ${focus} is not the real hinge here. ${lens} is. that's the part that actually changes what someone does next.`;
    case "disagree":
      return args.concise
        ? `one pushback: ${focus} is not the hard part. ${lens} is. otherwise this sounds right without becoming usable.`
        : `one pushback: ${focus} is not the hard part. ${lens} is. otherwise the take sounds right without giving someone a usable next move.`;
    case "example":
      return args.concise
        ? `the concrete example is ${lens}. that's where ${focus} stops sounding smart and starts feeling usable.`
        : `a better example lands on ${lens}. that's where ${focus} stops sounding smart and starts feeling usable in practice.`;
    case "translate":
      return args.concise
        ? `translated for ${audience}: this is really about ${lens}, not just ${focus}. that's the part worth carrying into a workflow.`
        : `translated for ${audience}: this is really about ${lens}, not just ${focus}. that's the part people should carry into their actual workflow.`;
    case "known_for":
      return args.concise
        ? `the layer worth reinforcing is ${args.strategy.knownFor}. replies like this work best when they ladder back to ${args.strategyPillar}.`
        : `the layer worth reinforcing is ${args.strategy.knownFor}. replies like this work best when they ladder back to ${args.strategyPillar} instead of stopping at agreement.`;
    default:
      return `the useful nuance is ${lens}. that's what turns ${focus} into something people can actually use.`;
  }
}

function sourceInvitesPlayfulPushback(text: string) {
  const normalized = normalizeComparable(text);
  return /\b(always|never|worst|best|illegal|overrated|underrated|shouldn'?t)\b/.test(normalized);
}

function buildCasualTemplate(args: {
  label: ExtensionSuggestedAngle;
  candidate: ExtensionOpportunityCandidate;
  concise: boolean;
  visualContext?: ReplyVisualContextSummary | null;
  isRecruitingCall?: boolean;
}) {
  const anchorText = args.visualContext?.imageReplyAnchor || args.visualContext?.readableText || null;
  if (args.isRecruitingCall) {
    switch (args.label) {
      case "sharpen":
        return buildRecruitingReplyText({
          sourceText: args.candidate.text,
          variant: "pile_on",
          concise: args.concise,
          anchorText,
        });
      case "disagree":
        return buildRecruitingReplyText({
          sourceText: args.candidate.text,
          variant: "deadpan",
          concise: args.concise,
          anchorText,
        });
      case "example":
      case "translate":
      case "known_for":
      case "nuance":
      default:
        return buildRecruitingReplyText({
          sourceText: args.candidate.text,
          variant: "relatable",
          concise: args.concise,
          anchorText,
        });
    }
  }
  switch (args.label) {
    case "sharpen":
      return buildCasualReplyText({
        sourceText: args.candidate.text,
        variant: "pile_on",
        concise: args.concise,
        anchorText,
      });
    case "disagree":
      return sourceInvitesPlayfulPushback(args.candidate.text)
        ? `counterpoint: ${buildCasualReplyText({
            sourceText: args.candidate.text,
            variant: "deadpan",
            concise: true,
            anchorText,
          })}`
        : buildCasualReplyText({
            sourceText: args.candidate.text,
            variant: "deadpan",
            concise: args.concise,
            anchorText,
          });
    case "example":
    case "translate":
    case "known_for":
    case "nuance":
    default:
      return buildCasualReplyText({
        sourceText: args.candidate.text,
        variant: "relatable",
        concise: args.concise,
        anchorText,
      });
  }
}

function buildCasualLabels(base: ExtensionSuggestedAngle): ExtensionSuggestedAngle[] {
  const next: ExtensionSuggestedAngle[] = [base, "sharpen", "nuance", "disagree"];
  return next.filter((label, index) => next.indexOf(label) === index).slice(0, 3);
}

export async function prepareExtensionReplyOptionsPolicy(args: {
  post: ExtensionOpportunityCandidate;
  strategy: GrowthStrategySnapshot;
  sourceContext?: ReplySourceContext | null;
  visualContext?: ReplyVisualContextSummary | null;
}) {
  const sourceContext = args.sourceContext || buildReplySourceContextFromOpportunityCandidate(args.post);
  const visualContext =
    args.visualContext === undefined
      ? await analyzeReplySourceVisualContext(sourceContext)
      : args.visualContext;
  const preflightResult = await classifyReplyDraftMode({
    sourceText: args.post.text,
    imageSummaryLines: visualContext?.summaryLines || [],
    visualContext,
  });
  const policy = resolveReplyConstraintPolicy({
    sourceContext,
    strategy: args.strategy,
    preflightResult,
    visualContext: visualContext || null,
  });

  return {
    sourceContext,
    visualContext: visualContext || null,
    preflightResult,
    policy,
  };
}

export function buildExtensionReplyOptions(args: {
  post: ExtensionOpportunityCandidate;
  opportunity: ExtensionOpportunity;
  strategy: GrowthStrategySnapshot;
  strategyPillar: string;
  styleCard: VoiceStyleCard | null;
  stage: string;
  tone: string;
  goal: string;
  replyInsights?: ReplyInsights | null;
  preflightResult?: ReplyDraftPreflightResult | null;
  policy?: ReplyConstraintPolicy | null;
  sourceContext?: ReplySourceContext | null;
  visualContext?: ReplyVisualContextSummary | null;
}): ExtensionReplyOptionsResponse {
  const lowercase = inferLowercasePreference(args.styleCard);
  const concise = inferConcisePreference(args.styleCard);
  const sourceContext = args.sourceContext || buildReplySourceContextFromOpportunityCandidate(args.post);
  const policy =
    args.policy ||
    resolveReplyConstraintPolicy({
      sourceContext,
      strategy: args.strategy,
      preflightResult: args.preflightResult || null,
      visualContext: args.visualContext || null,
    });
  const intents = buildReplyIntentPlansFromOpportunity({
    post: args.post,
    opportunity: args.opportunity,
    strategy: args.strategy,
    strategyPillar: args.strategyPillar,
    replyInsights: args.replyInsights,
  });
  const warnings = [
    ...(args.styleCard ? [] : ["No parsed voice profile was found, so replies are using onboarding context only."]),
    ...args.strategy.ambiguities.slice(0, 1),
  ];
  const groundingNotes = [
    ...(policy.allowStrategyLens ? [`Anchored to ${args.strategyPillar}.`] : ["Staying literal to the visible post only."]),
    ...(args.visualContext?.imageRole && args.visualContext.imageRole !== "none"
      ? [`Image role: ${args.visualContext.imageRole}.`]
      : []),
    ...(args.visualContext?.imageReplyAnchor
      ? [`Image anchor: ${args.visualContext.imageReplyAnchor}.`]
      : []),
    `Known for ${args.strategy.knownFor}.`,
    ...args.strategy.truthBoundary.verifiedFacts.slice(0, 1),
    ...buildReplyLearningNotes(args.replyInsights),
  ].map((entry) => applyVoiceCase(entry, lowercase));
  const groundingPacket = buildReplyGroundingPacket({
    request: {
      tweetId: args.post.postId,
      tweetText: args.post.text,
      authorHandle: args.post.author.handle,
      tweetUrl: args.post.url,
      stage: "0_to_1k",
      tone:
        args.tone === "dry" ||
        args.tone === "bold" ||
        args.tone === "warm" ||
        args.tone === "playful"
          ? args.tone
          : "builder",
      goal: args.goal,
    },
    strategy: args.strategy,
    strategyPillar: args.strategyPillar,
    angleLabel: args.opportunity.suggestedAngle,
    sourceContext,
    visualContext: args.visualContext || null,
    preflightResult: args.preflightResult || null,
  });
  const interpretation = resolveSourceInterpretation({
    sourceContext,
    preflightResult: args.preflightResult || null,
    visualContext: args.visualContext || null,
  });
  const useLiteralReactionMode =
    policy.treatAsLowSignalCasual ||
    interpretation.literality !== "literal" ||
    interpretation.post_frame === "mockup" ||
    interpretation.post_frame === "recruiting_call";

  const fallback = useLiteralReactionMode
    ? interpretation.post_frame === "recruiting_call"
      ? buildRecruitingReplyText({
          sourceText: args.post.text,
          variant: "relatable",
          anchorText: args.visualContext?.imageReplyAnchor || args.visualContext?.readableText || null,
        })
      : buildCasualReplyText({
          sourceText: args.post.text,
          variant: "relatable",
          anchorText: args.visualContext?.imageReplyAnchor || args.visualContext?.readableText || null,
        })
    : `the useful nuance is ${buildPillarLens(args.strategyPillar)}. that's the part that makes the point usable instead of just agreeable.`;
  const casualSeen = new Set<string>();
  const casualOptions = buildCasualLabels(args.opportunity.suggestedAngle)
    .map((label, index) => {
      const sanitized = sanitizeReplyText({
        candidate: buildCasualTemplate({
          label,
          candidate: args.post,
          concise,
          visualContext: args.visualContext || null,
          isRecruitingCall: interpretation.post_frame === "recruiting_call",
        }),
        fallbackText: fallback,
        sourceText: args.post.text,
        strategyPillar: args.strategyPillar,
        strategy: args.strategy,
        groundingPacket,
        styleCard: args.styleCard,
        preflightResult: args.preflightResult || null,
        policy,
        visualContext: args.visualContext || null,
      });
      const nextText = applyVoiceCase(sanitized, lowercase);
      const dedupeKey = normalizeComparable(nextText);
      if (!dedupeKey || casualSeen.has(dedupeKey)) {
        return null;
      }

      casualSeen.add(dedupeKey);
      return {
        id: `${label}-${index + 1}`,
        label,
        text: nextText,
      };
    })
    .filter((option): option is NonNullable<typeof option> => Boolean(option));
  const strategicSeen = new Set<string>();
  const strategicOptions = intents
    .map((intent) => {
      const template = buildTemplate({
        label: intent.angleLabel,
        candidate: args.post,
        strategy: args.strategy,
        strategyPillar: intent.strategyPillar,
        concise,
      });
      const sanitized = sanitizeReplyText({
        candidate: template,
        fallbackText: fallback,
        sourceText: args.post.text,
        strategyPillar: intent.strategyPillar,
        strategy: args.strategy,
        groundingPacket,
        styleCard: args.styleCard,
        preflightResult: args.preflightResult || null,
        policy,
        visualContext: args.visualContext || null,
      });
      const nextText = applyVoiceCase(sanitized, lowercase);
      const dedupeKey = normalizeComparable(nextText);
      if (!dedupeKey || strategicSeen.has(dedupeKey)) {
        return null;
      }

      strategicSeen.add(dedupeKey);
      return {
        id: `${intent.angleLabel}-${strategicSeen.size}`,
        label: intent.angleLabel,
        text: nextText,
        intent: {
          label: intent.label,
          strategyPillar: intent.strategyPillar,
          anchor: intent.anchor,
          rationale: intent.rationale,
        },
      };
    })
    .filter((option): option is NonNullable<typeof option> => Boolean(option))
    .slice(0, 3);
  const options = useLiteralReactionMode ? casualOptions : strategicOptions;
  const fallbackOption = applyVoiceCase(
    sanitizeReplyText({
      candidate: fallback,
      fallbackText: fallback,
      sourceText: args.post.text,
      strategyPillar: args.strategyPillar,
      strategy: args.strategy,
      groundingPacket,
      styleCard: args.styleCard,
      preflightResult: args.preflightResult || null,
      policy,
      visualContext: args.visualContext || null,
    }),
    lowercase,
  );

  return {
    options: options.length > 0 ? options : [{ id: "nuance-1", label: "nuance", text: fallbackOption }],
    warnings: [
      ...warnings,
      ...(useLiteralReactionMode
        ? [
            interpretation.post_frame === "recruiting_call"
              ? "Source reads as a recruiting pitch, so options stay in public-reply reaction mode."
              : "Source reads as a casual/off-niche observation, so options stay literal on purpose.",
          ]
        : []),
      ...(interpretation.humor_mode === "satire" || interpretation.humor_mode === "parody"
        ? [`Source reads as ${interpretation.humor_mode}; options should react to ${interpretation.target}.`]
        : []),
      ...(args.visualContext?.imageRole === "punchline"
        ? ["Image is carrying the punchline, so options are anchored to the visual bit."]
        : []),
    ],
    groundingNotes: [
      ...groundingNotes,
      ...(useLiteralReactionMode
        ? [
            interpretation.post_frame === "recruiting_call"
              ? "Public recruiting-reply mode is active; no self-application or business overlay was applied."
              : "Literal casual riff mode is active; no strategy or business overlay was applied.",
          ]
        : []),
      ...(!policy.allowAdjacentIdeation
        ? ["Adjacent feature ideation is blocked for this source interpretation."]
        : []),
      ...(policy.shouldReferenceImageText
        ? ["Readable image text can be used as source grounding when it sharpens the reply."]
        : []),
    ],
  };
}

export async function verifyExtensionReplyOptionsResponse(args: {
  response: ExtensionReplyOptionsResponse;
  sourceContext: ReplySourceContext;
  visualContext?: ReplyVisualContextSummary | null;
  preflightResult?: ReplyDraftPreflightResult | null;
}): Promise<{
  response: ExtensionReplyOptionsResponse;
  claimVerification: ClaimVerificationResult[];
}> {
  const claimVerification = await Promise.all(
    args.response.options.map((option) =>
      verifyReplyClaims({
        draft: option.text,
        sourceContext: args.sourceContext,
        visualContext: args.visualContext || null,
        preflightResult: args.preflightResult || null,
      }),
    ),
  );
  const seen = new Set<string>();
  const options = args.response.options
    .map((option, index) => ({
      ...option,
      text: normalizeWhitespace(claimVerification[index]?.draft || option.text),
    }))
    .filter((option) => {
      const key = normalizeComparable(option.text);
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, 3);

  return {
    response: {
      ...args.response,
      options: options.length > 0 ? options : args.response.options.slice(0, 1),
    },
    claimVerification,
  };
}
