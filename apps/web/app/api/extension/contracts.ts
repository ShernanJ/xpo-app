import { z } from "zod";

const IsoDateStringSchema = z
  .string()
  .trim()
  .refine((value) => Number.isFinite(Date.parse(value)), "Invalid ISO datetime.");

export const ExtensionOpportunitySurfaceSchema = z.enum([
  "home",
  "search",
  "thread",
  "list",
  "profile",
  "unknown",
]);

export const ExtensionOpportunityPostTypeSchema = z.enum([
  "original",
  "reply",
  "quote",
  "repost",
  "unknown",
]);

export const ExtensionOpportunityCaptureSourceSchema = z.enum(["graphql", "dom"]);

export const ExtensionOpportunityVerdictSchema = z.enum(["reply", "watch", "dont_reply"]);

export const ExtensionSuggestedAngleSchema = z.enum([
  "nuance",
  "sharpen",
  "disagree",
  "example",
  "translate",
  "known_for",
]);

export const ExtensionReplyIntentMetadataSchema = z
  .object({
    label: ExtensionSuggestedAngleSchema,
    strategyPillar: z.string().trim().min(1).max(120),
    anchor: z.string().trim().min(1).max(240),
    rationale: z.string().trim().min(1).max(240),
  })
  .strict();

export const ExtensionObservedReplyMetricsSchema = z
  .object({
    likeCount: z.number().int().min(0),
    replyCount: z.number().int().min(0),
    profileClicks: z.number().int().min(0).optional(),
    followerDelta: z.number().int().optional(),
  })
  .strict();

export const ExtensionExpectedValueLevelSchema = z.enum(["low", "medium", "high"]);

export const ExtensionOpportunityCandidateSchema = z
  .object({
    postId: z.string().trim().min(1),
    author: z
      .object({
        id: z.string().trim().min(1).nullable(),
        handle: z.string().trim().min(1),
        name: z.string().trim().min(1).nullable(),
        verified: z.boolean(),
        followerCount: z.number().int().min(0),
      })
      .strict(),
    text: z.string().trim().min(1).max(4_000),
    url: z.string().trim().url(),
    createdAtIso: IsoDateStringSchema.nullable(),
    engagement: z
      .object({
        replyCount: z.number().int().min(0),
        repostCount: z.number().int().min(0),
        likeCount: z.number().int().min(0),
        quoteCount: z.number().int().min(0),
        viewCount: z.number().int().min(0),
      })
      .strict(),
    postType: ExtensionOpportunityPostTypeSchema,
    conversation: z
      .object({
        conversationId: z.string().trim().min(1).nullable(),
        inReplyToPostId: z.string().trim().min(1).nullable(),
        inReplyToHandle: z.string().trim().min(1).nullable(),
      })
      .strict(),
    media: z
      .object({
        hasMedia: z.boolean(),
        hasImage: z.boolean(),
        hasVideo: z.boolean(),
        hasGif: z.boolean(),
        hasLink: z.boolean(),
        hasPoll: z.boolean(),
      })
      .strict(),
    surface: ExtensionOpportunitySurfaceSchema,
    captureSource: ExtensionOpportunityCaptureSourceSchema,
    capturedAtIso: IsoDateStringSchema,
  })
  .strict();

export const ExtensionOpportunityExpectedValueSchema = z
  .object({
    visibility: ExtensionExpectedValueLevelSchema,
    profileClicks: ExtensionExpectedValueLevelSchema,
    followConversion: ExtensionExpectedValueLevelSchema,
  })
  .strict();

export const ExtensionOpportunityScoringBreakdownSchema = z
  .object({
    niche_match: z.number().int().min(0).max(100),
    audience_fit: z.number().int().min(0).max(100),
    freshness: z.number().int().min(0).max(100),
    conversation_quality: z.number().int().min(0).max(100),
    profile_click_potential: z.number().int().min(0).max(100),
    follow_conversion_potential: z.number().int().min(0).max(100),
    visibility_potential: z.number().int().min(0).max(100),
    spam_risk: z.number().int().min(0).max(100),
    off_niche_risk: z.number().int().min(0).max(100),
    genericity_risk: z.number().int().min(0).max(100),
    negative_signal_risk: z.number().int().min(0).max(100),
  })
  .strict();

export const ExtensionOpportunitySchema = z
  .object({
    opportunityId: z.string().trim().min(1),
    postId: z.string().trim().min(1),
    score: z.number().int().min(0).max(100),
    verdict: ExtensionOpportunityVerdictSchema,
    why: z.array(z.string().trim().min(1)).min(1).max(4),
    riskFlags: z.array(z.string().trim().min(1).max(120)).max(4),
    suggestedAngle: ExtensionSuggestedAngleSchema,
    expectedValue: ExtensionOpportunityExpectedValueSchema,
    scoringBreakdown: ExtensionOpportunityScoringBreakdownSchema,
  })
  .strict();

export const ExtensionOpportunityBatchRequestSchema = z
  .object({
    pageUrl: z.string().trim().url(),
    surface: ExtensionOpportunitySurfaceSchema,
    candidates: z.array(ExtensionOpportunityCandidateSchema).min(1).max(50),
  })
  .strict();

export const ExtensionOpportunityBatchResponseSchema = z
  .object({
    opportunities: z.array(ExtensionOpportunitySchema).max(5),
    notes: z.array(z.string().trim().min(1)).max(6),
  })
  .strict();

export const ExtensionReplyOptionChoiceSchema = z
  .object({
    id: z.string().trim().min(1),
    label: ExtensionSuggestedAngleSchema,
    text: z.string().trim().min(1).max(500),
    intent: ExtensionReplyIntentMetadataSchema.optional(),
  })
  .strict();

export const ExtensionReplyOptionsRequestSchema = z
  .object({
    opportunityId: z.string().trim().min(1),
    post: ExtensionOpportunityCandidateSchema,
    opportunity: ExtensionOpportunitySchema,
  })
  .strict();

export const ExtensionReplyOptionsResponseSchema = z
  .object({
    options: z.array(ExtensionReplyOptionChoiceSchema).min(1).max(3),
    warnings: z.array(z.string().trim().min(1)).max(6),
    groundingNotes: z.array(z.string().trim().min(1)).max(6),
  })
  .strict();

export const ExtensionReplyLogRequestSchema = z
  .object({
    event: z.enum(["observed", "ranked", "selected", "generated", "copied", "posted", "dismissed"]),
    opportunityId: z.string().trim().min(1).nullable().optional(),
    postId: z.string().trim().min(1),
    postText: z.string().trim().min(1).max(4_000),
    postUrl: z.string().trim().url(),
    authorHandle: z.string().trim().min(1),
    surface: ExtensionOpportunitySurfaceSchema,
    verdict: ExtensionOpportunityVerdictSchema.nullable().optional(),
    angle: ExtensionSuggestedAngleSchema.nullable().optional(),
    expectedValue: ExtensionOpportunityExpectedValueSchema.nullable().optional(),
    riskFlags: z.array(z.string().trim().min(1).max(120)).max(8).nullable().optional(),
    source: z.string().trim().min(1).max(80).nullable().optional(),
    generatedReplyIds: z.array(z.string().trim().min(1)).max(3).nullable().optional(),
    generatedReplyLabels: z.array(ExtensionSuggestedAngleSchema).max(3).nullable().optional(),
    generatedReplyIntents: z.array(ExtensionReplyIntentMetadataSchema).max(3).nullable().optional(),
    copiedReplyId: z.string().trim().min(1).nullable().optional(),
    copiedReplyLabel: ExtensionSuggestedAngleSchema.nullable().optional(),
    copiedReplyText: z.string().trim().min(1).max(500).nullable().optional(),
    copiedReplyIntent: ExtensionReplyIntentMetadataSchema.nullable().optional(),
    observedMetrics: ExtensionObservedReplyMetricsSchema.nullable().optional(),
  })
  .strict();

export const ExtensionDraftFolderSchema = z
  .object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    color: z.string().trim().min(1).nullable(),
    createdAt: IsoDateStringSchema,
  })
  .strict();

export const ExtensionDraftArtifactPostSchema = z
  .object({
    id: z.string().trim().min(1),
    content: z.string().trim().min(1),
    weightedCharacterCount: z.number().finite().min(0),
    maxCharacterLimit: z.number().finite().min(1),
    isWithinXLimit: z.boolean(),
  })
  .strict();

export const ExtensionDraftArtifactSchema = z
  .object({
    id: z.string().trim().min(1),
    title: z.string().trim().min(1),
    kind: z.string().trim().min(1),
    content: z.string().trim().min(1),
    posts: z.array(ExtensionDraftArtifactPostSchema).max(12),
  })
  .strict();

export const ExtensionDraftSchema = z
  .object({
    id: z.string().trim().min(1),
    title: z.string().trim().min(1),
    sourcePrompt: z.string().trim().min(1),
    sourcePlaybook: z.string().trim().min(1).nullable(),
    outputShape: z.string().trim().min(1),
    status: z.literal("DRAFT"),
    reviewStatus: z.string().trim().min(1),
    folder: ExtensionDraftFolderSchema.nullable(),
    artifact: ExtensionDraftArtifactSchema,
    createdAt: IsoDateStringSchema,
    updatedAt: IsoDateStringSchema,
  })
  .strict();

export const ExtensionDraftsResponseSchema = z
  .object({
    drafts: z.array(ExtensionDraftSchema).max(100),
  })
  .strict();

export const ExtensionDraftPublishRequestSchema = z
  .object({
    publishedTweetId: z.string().trim().min(1).nullable().optional(),
  })
  .strict();
