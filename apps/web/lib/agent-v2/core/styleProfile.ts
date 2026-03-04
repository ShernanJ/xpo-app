import { prisma } from "../../db";
import { Prisma } from "../../generated/prisma/client";
import { z } from "zod";

export const UserPreferencesSchema = z.object({
  casing: z.enum(["auto", "normal", "lowercase", "uppercase"]).default("auto"),
  bulletStyle: z.enum(["auto", "dash", "angle"]).default("auto"),
  emojiUsage: z.enum(["auto", "on", "off"]).default("auto"),
  profanity: z.enum(["auto", "on", "off"]).default("auto"),
  blacklist: z.array(z.string()).default([]),
  writingGoal: z.enum(["voice_first", "balanced", "growth_first"]).default("balanced"),
  verifiedMaxChars: z.number().int().min(250).max(25000).nullable().optional(),
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
});

export type VoiceStyleCard = z.infer<typeof StyleCardSchema>;
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

export async function generateStyleProfile(userId: string, xHandle: string, limit: number = 50): Promise<VoiceStyleCard | null> {
  try {
    // 1. Check if profile already exists in DB to prevent wiping customGuidelines
    const existing = await prisma.voiceProfile.findFirst({
      where: { userId, xHandle }
    });

    if (existing && existing.styleCard) {
      try {
        const parsed = StyleCardSchema.parse(existing.styleCard);
        return parsed;
      } catch (e) {
        console.warn("Existing styleCard failed schema validation, regenerating...", e);
      }
    }

    // 2. Otherwise generate from scratch
    const recentPosts = await prisma.post.findMany({
      where: { userId, xHandle },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { text: true },
    });

    if (recentPosts.length === 0) {
      console.log(`No posts found to generate style profile for user ${userId}`);
      return null;
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
      return null;
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      return null;
    }

    const parsedJson = JSON.parse(content);
    const validatedCard = StyleCardSchema.parse(parsedJson);

    // Save or update the profile in the DB
    await saveStyleProfile(userId, xHandle, validatedCard);

    return validatedCard;
  } catch (error) {
    console.error("Failed to generate style profile:", error);
    return null;
  }
}

// Safer database upsert wrapper specifically for the schema structure
export async function saveStyleProfile(userId: string, xHandle: string, styleCard: VoiceStyleCard) {
  const existing = await prisma.voiceProfile.findFirst({
    where: { userId, xHandle }
  });

  if (existing) {
    return prisma.voiceProfile.update({
      where: { id: existing.id },
      data: { styleCard: styleCard as unknown as Prisma.InputJsonObject }
    });
  }

  return prisma.voiceProfile.create({
    data: {
      userId,
      xHandle,
      styleCard: styleCard as unknown as Prisma.InputJsonObject
    }
  });
}
