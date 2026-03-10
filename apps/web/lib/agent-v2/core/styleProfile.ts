import { prisma } from "../../db";
import { Prisma } from "../../generated/prisma/client";
import { z } from "zod";

export const FactLedgerSourceMaterialSchema = z.object({
  type: z.enum(["story", "playbook", "framework", "case_study"]).default("story"),
  title: z.string(),
  tags: z.array(z.string()).default([]),
  verified: z.boolean().default(false),
  claims: z.array(z.string()).default([]),
  snippets: z.array(z.string()).default([]),
  doNotClaim: z.array(z.string()).default([]),
});

export const FactLedgerSchema = z.object({
  durableFacts: z.array(z.string()).default([]),
  allowedFirstPersonClaims: z.array(z.string()).default([]),
  allowedNumbers: z.array(z.string()).default([]),
  forbiddenClaims: z.array(z.string()).default([]),
  sourceMaterials: z.array(FactLedgerSourceMaterialSchema).default([]),
});

export const UserPreferencesSchema = z.object({
  casing: z.enum(["auto", "normal", "lowercase", "uppercase"]).default("auto"),
  bulletStyle: z.enum(["auto", "dash", "angle"]).default("auto"),
  emojiUsage: z.enum(["auto", "on", "off"]).default("auto"),
  profanity: z.enum(["auto", "on", "off"]).default("auto"),
  blacklist: z.array(z.string()).default([]),
  writingGoal: z.enum(["voice_first", "balanced", "growth_first"]).default("balanced"),
  verifiedMaxChars: z.number().int().min(250).max(25000).nullable().optional(),
});

export const FeedbackCategorySchema = z.enum([
  "feature_request",
  "feedback",
  "bug_report",
]);

export const FeedbackAttachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  status: z.literal("pending_upload"),
  signatureHex: z
    .string()
    .regex(/^[0-9a-f]+$/i)
    .max(64)
    .nullable()
    .optional(),
  thumbnailDataUrl: z.string().nullable().optional(),
});

export const FeedbackSubmissionStatusSchema = z.enum([
  "open",
  "resolved",
  "cancelled",
]);

export const FeedbackSubmissionSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  category: FeedbackCategorySchema,
  status: FeedbackSubmissionStatusSchema.default("open"),
  statusUpdatedAt: z.string().optional(),
  statusUpdatedByUserId: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  message: z.string(),
  fields: z.record(z.string(), z.string()).default({}),
  submittedBy: z.object({
    userId: z.string(),
    userHandle: z.string().nullable().optional(),
    xHandle: z.string().nullable().optional(),
  }),
  context: z.object({
    pagePath: z.string().default("/chat"),
    threadId: z.string().nullable().optional(),
    activeModal: z.string().nullable().optional(),
    draftMessageId: z.string().nullable().optional(),
    viewportWidth: z.number().int().positive().optional(),
    viewportHeight: z.number().int().positive().optional(),
    userAgent: z.string().optional(),
    appSurface: z.string().default("chat"),
  }),
  attachments: z.array(FeedbackAttachmentSchema).default([]),
});

export const StyleCardSchema = z.object({
  sentenceOpenings: z.array(z.string()).describe("Typical ways the user starts sentences or posts (e.g. 'Hot take:', 'Unpopular opinion:', 'Here is why...')"),
  sentenceClosers: z.array(z.string()).describe("Typical ways the user ends sentences or posts (e.g. 'Thoughts?', 'Let that sink in.', 'Do you agree?')"),
  pacing: z.string().describe("How the user paces their text (e.g. 'short, punchy single-line sentences', 'long flowing paragraphs', 'bullet heavy')"),
  emojiPatterns: z.array(z.string()).describe("Specific emojis the user frequently uses and in what context"),
  slangAndVocabulary: z.array(z.string()).describe("Specific jargon, slang, or unique vocabulary words explicitly used by the user"),
  formattingRules: z.array(z.string()).describe("Rules around capitalization, punctuation, line breaks, and list markers (e.g. 'never uses capitalization', 'double line breaks between sentences', 'uses - for bullets', 'uses > for bullets')"),
  customGuidelines: z.array(z.string()).default([]).describe("Explicit stylistic feedback or rules the user dictates (e.g. 'Never use emojis', 'Make it less cringe')"),
  contextAnchors: z.array(z.string()).default([]).describe("Explicit facts the user has told the bot about themselves or their project"),
  factLedger: FactLedgerSchema.default({
    durableFacts: [],
    allowedFirstPersonClaims: [],
    allowedNumbers: [],
    forbiddenClaims: [],
    sourceMaterials: [],
  }).describe("Authoritative durable grounding used for factual claims in drafts"),
  antiExamples: z
    .array(
      z.object({
        badSnippet: z.string(),
        reason: z.string(),
        guidance: z.string(),
        createdAt: z.string(),
      }),
    )
    .default([])
    .describe("Recent rejected style patterns to avoid repeating"),
  userPreferences: UserPreferencesSchema.optional().describe("Durable profile-level writing preferences set by the user"),
  feedbackSubmissions: z
    .array(FeedbackSubmissionSchema)
    .optional()
    .describe("Recent product feedback submissions from this profile"),
});

export type VoiceStyleCard = z.infer<typeof StyleCardSchema>;
export type FactLedger = z.infer<typeof FactLedgerSchema>;
export type FactLedgerSourceMaterial = z.infer<typeof FactLedgerSourceMaterialSchema>;
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;
export type FeedbackCategory = z.infer<typeof FeedbackCategorySchema>;
export type FeedbackAttachment = z.infer<typeof FeedbackAttachmentSchema>;
export type FeedbackSubmissionStatus = z.infer<typeof FeedbackSubmissionStatusSchema>;
export type FeedbackSubmission = z.infer<typeof FeedbackSubmissionSchema>;

function normalizeMemoryLine(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function dedupeStringList(values: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const value of values) {
    const normalized = normalizeMemoryLine(value);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }

    seen.add(key);
    next.push(normalized);
  }

  return next;
}

function buildNormalizedFactLedger(card: Pick<VoiceStyleCard, "contextAnchors" | "factLedger">): FactLedger {
  const factLedger = FactLedgerSchema.parse(card.factLedger || {});

  return {
    ...factLedger,
    durableFacts: dedupeStringList([
      ...(factLedger.durableFacts || []),
      ...(card.contextAnchors || []),
    ]),
    allowedFirstPersonClaims: dedupeStringList(factLedger.allowedFirstPersonClaims || []),
    allowedNumbers: dedupeStringList(factLedger.allowedNumbers || []),
    forbiddenClaims: dedupeStringList(factLedger.forbiddenClaims || []),
    sourceMaterials: (factLedger.sourceMaterials || []).map((entry) => ({
      ...entry,
      title: normalizeMemoryLine(entry.title),
      tags: dedupeStringList(entry.tags || []),
      claims: dedupeStringList(entry.claims || []),
      snippets: dedupeStringList(entry.snippets || []),
      doNotClaim: dedupeStringList(entry.doNotClaim || []),
    })),
  };
}

export function getDurableFactsFromStyleCard(styleCard: VoiceStyleCard | null | undefined): string[] {
  if (!styleCard) {
    return [];
  }

  return buildNormalizedFactLedger(styleCard).durableFacts;
}

export function rememberFactsOnStyleCard(
  styleCard: VoiceStyleCard,
  facts: string[],
): VoiceStyleCard {
  const normalizedFacts = dedupeStringList(facts);
  if (normalizedFacts.length === 0) {
    return {
      ...styleCard,
      factLedger: buildNormalizedFactLedger(styleCard),
    };
  }

  const nextFactLedger = buildNormalizedFactLedger(styleCard);
  nextFactLedger.durableFacts = dedupeStringList([
    ...nextFactLedger.durableFacts,
    ...normalizedFacts,
  ]);

  return {
    ...styleCard,
    contextAnchors: dedupeStringList([
      ...(styleCard.contextAnchors || []),
      ...normalizedFacts,
    ]),
    factLedger: nextFactLedger,
  };
}

export async function generateStyleProfile(
  userId: string,
  xHandle: string,
  limit: number = 50,
  options?: {
    forceRegenerate?: boolean;
  },
): Promise<VoiceStyleCard | null> {
  try {
    const normalizedHandle = xHandle.trim().replace(/^@+/, "").toLowerCase();
    const forceRegenerate = options?.forceRegenerate === true;

    // 1. Read existing style card (if valid) so we can preserve durable memory.
    const existing = await prisma.voiceProfile.findFirst({
      where: { userId, xHandle: normalizedHandle }
    });

    let existingParsed: VoiceStyleCard | null = null;
    if (existing && existing.styleCard) {
      try {
        existingParsed = StyleCardSchema.parse(existing.styleCard);
      } catch (e) {
        console.warn("Existing styleCard failed schema validation, regenerating...", e);
      }
    }

    // 2. Read latest posts for this handle.
    const recentPosts = await prisma.post.findMany({
      where: { userId, xHandle: normalizedHandle },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { text: true, createdAt: true },
    });

    // If no posts are available, keep existing profile when possible.
    if (recentPosts.length === 0) {
      if (existingParsed) {
        return existingParsed;
      }

      console.log(`No posts found to generate style profile for user ${userId} (${normalizedHandle})`);
      return null;
    }

    // Fast path: existing profile is newer than latest ingested post, so no refresh needed.
    const latestPostCreatedAt = recentPosts[0]?.createdAt?.getTime() ?? 0;
    const styleUpdatedAt = existing?.updatedAt?.getTime() ?? 0;
    if (!forceRegenerate && existingParsed && styleUpdatedAt >= latestPostCreatedAt) {
      return existingParsed;
    }

    const postsText = recentPosts.map((p, i) => `[Post ${i + 1}]:\n${p.text}`).join("\n\n");

    const instruction = `
You are an expert copywriter and forensic linguist analyzing a creator's specific writing style on X (Twitter).
Analyze the provided batch of posts to extract the creator's exact "Voice Style Card".
This card will be used to generate future content that sounds exactly like them.

Focus exclusively on STRUCTURE, CADENCE, VOCABULARY, and FORMATTING.
Do NOT analyze the topics they talk about, focus only on HOW they write.
Explicitly capture:
- whether they write in all lowercase vs normal capitalization
- whether they prefer bullet markers like "-" or ">"
- their line break rhythm and punctuation habits

Creator's Posts to analyze:
${postsText}

Respond ONLY with a valid JSON object matching this schema:
{
  "sentenceOpenings": ["..."],
  "sentenceClosers": ["..."],
  "pacing": "...",
  "emojiPatterns": ["..."],
  "slangAndVocabulary": ["..."],
  "formattingRules": ["..."],
  "customGuidelines": [],
  "contextAnchors": [],
  "factLedger": {
    "durableFacts": [],
    "allowedFirstPersonClaims": [],
    "allowedNumbers": [],
    "forbiddenClaims": [],
    "sourceMaterials": []
  },
  "antiExamples": []
}
`;

    const apiKey = process.env.GROQ_API_KEY;
    const model = process.env.GROQ_MODEL || "llama3-8b-8192";
    const baseUrl = "https://api.groq.com/openai/v1/chat/completions";

    if (!apiKey) {
      throw new Error("GROQ_API_KEY is not set");
    }

    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: instruction }],
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("LLM API Error:", response.status, errorText);
      return existingParsed;
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      return existingParsed;
    }

    const parsedJson = JSON.parse(content);
    const validatedCard = StyleCardSchema.parse(parsedJson);
    const mergedFactLedger = buildNormalizedFactLedger({
      contextAnchors: dedupeStringList([
        ...(existingParsed?.contextAnchors || []),
        ...(validatedCard.contextAnchors || []),
      ]),
      factLedger: {
        ...(existingParsed?.factLedger || {}),
        ...(validatedCard.factLedger || {}),
        durableFacts: dedupeStringList([
          ...(existingParsed?.factLedger?.durableFacts || []),
          ...(validatedCard.factLedger?.durableFacts || []),
          ...(existingParsed?.contextAnchors || []),
          ...(validatedCard.contextAnchors || []),
        ]),
        allowedFirstPersonClaims: dedupeStringList([
          ...(existingParsed?.factLedger?.allowedFirstPersonClaims || []),
          ...(validatedCard.factLedger?.allowedFirstPersonClaims || []),
        ]),
        allowedNumbers: dedupeStringList([
          ...(existingParsed?.factLedger?.allowedNumbers || []),
          ...(validatedCard.factLedger?.allowedNumbers || []),
        ]),
        forbiddenClaims: dedupeStringList([
          ...(existingParsed?.factLedger?.forbiddenClaims || []),
          ...(validatedCard.factLedger?.forbiddenClaims || []),
        ]),
        sourceMaterials: [
          ...(existingParsed?.factLedger?.sourceMaterials || []),
          ...(validatedCard.factLedger?.sourceMaterials || []),
        ],
      },
    });
    const mergedCard: VoiceStyleCard = existingParsed
      ? {
          ...validatedCard,
          customGuidelines: dedupeStringList([
            ...(existingParsed.customGuidelines || []),
            ...(validatedCard.customGuidelines || []),
          ]),
          contextAnchors: mergedFactLedger.durableFacts,
          factLedger: mergedFactLedger,
          antiExamples: (existingParsed.antiExamples || []).slice(-5),
          userPreferences: existingParsed.userPreferences,
          feedbackSubmissions: existingParsed.feedbackSubmissions,
        }
      : {
          ...validatedCard,
          contextAnchors: mergedFactLedger.durableFacts,
          factLedger: mergedFactLedger,
        };

    // Save or update the profile in the DB
    await saveStyleProfile(userId, normalizedHandle, mergedCard);

    return mergedCard;
  } catch (error) {
    console.error("Failed to generate style profile:", error);
    return null;
  }
}

// Safer database upsert wrapper specifically for the schema structure
export async function saveStyleProfile(userId: string, xHandle: string, styleCard: VoiceStyleCard) {
  const normalizedHandle = xHandle.trim().replace(/^@+/, "").toLowerCase();
  const normalizedStyleCard: VoiceStyleCard = {
    ...styleCard,
    contextAnchors: getDurableFactsFromStyleCard(styleCard),
    factLedger: buildNormalizedFactLedger(styleCard),
  };
  const existing = await prisma.voiceProfile.findFirst({
    where: { userId, xHandle: normalizedHandle }
  });

  if (existing) {
    return prisma.voiceProfile.update({
      where: { id: existing.id },
      data: { styleCard: normalizedStyleCard as unknown as Prisma.InputJsonObject }
    });
  }

  return prisma.voiceProfile.create({
    data: {
      userId,
      xHandle: normalizedHandle,
      styleCard: normalizedStyleCard as unknown as Prisma.InputJsonObject
    }
  });
}
