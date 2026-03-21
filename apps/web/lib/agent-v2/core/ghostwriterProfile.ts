import { prisma } from "../../db";
import type { Persona } from "../../generated/prisma/client";
import type { GhostwriterStyleCard } from "../contracts/types";
import {
  createEmptyStyleCard,
  saveStyleProfile,
  StyleCardSchema,
  type VoiceStyleCard,
} from "./styleProfile";
import type { CreatorProfile, CreatorRepresentativePost } from "../../onboarding/types";

const PERSONA_ORDER: Persona[] = [
  "EDUCATOR",
  "CURATOR",
  "ENTERTAINER",
  "DOCUMENTARIAN",
  "PROVOCATEUR",
  "CASUAL",
];

const DESCRIPTOR_VOCAB = new Set([
  "actionable",
  "bold",
  "calm",
  "clear",
  "concise",
  "contrarian",
  "curious",
  "direct",
  "funny",
  "helpful",
  "honest",
  "insightful",
  "playful",
  "practical",
  "sharp",
  "specific",
  "supportive",
  "tactical",
  "thoughtful",
  "useful",
  "warm",
]);

function normalizeHandle(value: string): string {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function humanizeLabel(value: string): string {
  return value.replace(/_/g, " ").trim();
}

function dedupeStrings(values: string[], limit?: number): string[] {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const value of values) {
    const normalized = normalizeWhitespace(value);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }

    seen.add(key);
    next.push(normalized);

    if (limit && next.length >= limit) {
      break;
    }
  }

  return next;
}

function extractEmojis(values: string[]): string[] {
  const matches = values.flatMap((value) => value.match(/\p{Extended_Pictographic}/gu) || []);
  return dedupeStrings(matches, 5);
}

function scoreQuestionFrequency(rate: number): "high" | "medium" | "low" {
  if (rate >= 35) {
    return "high";
  }

  if (rate >= 15) {
    return "medium";
  }

  return "low";
}

function scoreLineBreakFrequency(rate: number): "high" | "medium" | "low" {
  if (rate >= 50) {
    return "high";
  }

  if (rate >= 20) {
    return "medium";
  }

  return "low";
}

function mapAverageLengthBand(value: CreatorProfile["voice"]["averageLengthBand"]): number {
  if (value === "short") {
    return 12;
  }

  if (value === "long") {
    return 55;
  }

  return 28;
}

function buildGhostwriterStyleCard(profile: CreatorProfile): GhostwriterStyleCard {
  const descriptorPool = [
    ...profile.voice.styleNotes,
    ...profile.playbook.toneGuidelines,
    ...profile.strategy.currentStrengths,
  ]
    .flatMap((entry) =>
      entry
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, " ")
        .split(/\s+/),
    )
    .filter((token) => DESCRIPTOR_VOCAB.has(token));

  const openerPool = dedupeStrings(profile.styleCard.preferredOpeners, 6);
  const closerPool = dedupeStrings(profile.styleCard.preferredClosers, 4);
  const signaturePool = dedupeStrings(profile.styleCard.signaturePhrases, 6);
  const punctuationPool = [
    ...profile.styleCard.punctuationGuidelines,
    ...profile.voice.styleNotes,
    ...profile.playbook.toneGuidelines,
  ];

  return {
    lexicon: {
      topAdjectives: dedupeStrings(descriptorPool, 6),
      transitionPhrases: dedupeStrings([...openerPool, ...closerPool], 6),
      greetings: openerPool.filter((entry) =>
        /^(gm|good morning|good afternoon|good evening|hey|hi|hello|yo)\b/i.test(entry),
      ),
    },
    formatting: {
      casingPreference:
        profile.voice.primaryCasing === "lowercase"
          ? "lowercase"
          : profile.voice.primaryCasing === "normal"
            ? "sentence"
            : "mixed",
      avgParagraphLengthWords: mapAverageLengthBand(profile.voice.averageLengthBand),
      lineBreakFrequency: scoreLineBreakFrequency(profile.voice.multiLinePostRate),
    },
    punctuationAndSyntax: {
      usesEmDashes: punctuationPool.some((entry) => /em dash|—|\s-\s|dash/i.test(entry)),
      usesEllipses: punctuationPool.some((entry) => /ellipsis|\.{3}/i.test(entry)),
      rhetoricalQuestionFrequency: scoreQuestionFrequency(profile.voice.questionPostRate),
      topEmojis: extractEmojis([
        ...signaturePool,
        ...openerPool,
        ...closerPool,
        profile.styleCard.emojiPolicy,
      ]),
    },
  };
}

function applyArchetypeScores(
  scores: Record<Persona, number>,
  archetype: CreatorProfile["archetype"] | null,
  weight: number,
) {
  if (!archetype) {
    return;
  }

  switch (archetype) {
    case "educator":
      scores.EDUCATOR += 5 * weight;
      break;
    case "curator":
      scores.CURATOR += 5 * weight;
      break;
    case "social_operator":
      scores.ENTERTAINER += 4 * weight;
      scores.CASUAL += 1 * weight;
      break;
    case "builder":
      scores.DOCUMENTARIAN += 3 * weight;
      scores.EDUCATOR += 2 * weight;
      break;
    case "founder_operator":
      scores.DOCUMENTARIAN += 3 * weight;
      scores.PROVOCATEUR += 2 * weight;
      break;
    case "job_seeker":
      scores.CURATOR += 2 * weight;
      scores.CASUAL += 2 * weight;
      break;
    case "hybrid":
      scores.EDUCATOR += 2 * weight;
      scores.CURATOR += 2 * weight;
      scores.DOCUMENTARIAN += 2 * weight;
      break;
  }
}

function rankPersonas(profile: CreatorProfile): Persona[] {
  const scores: Record<Persona, number> = {
    EDUCATOR: 0,
    CURATOR: 0,
    ENTERTAINER: 0,
    DOCUMENTARIAN: 0,
    PROVOCATEUR: 0,
    CASUAL: 1,
  };

  applyArchetypeScores(scores, profile.archetype, 1);
  applyArchetypeScores(scores, profile.secondaryArchetype, 0.65);

  switch (profile.distribution.primaryLoop) {
    case "authority_building":
      scores.EDUCATOR += 2;
      scores.DOCUMENTARIAN += 1;
      break;
    case "quote_commentary":
      scores.CURATOR += 3;
      break;
    case "standalone_discovery":
      scores.ENTERTAINER += 1;
      scores.PROVOCATEUR += 1;
      break;
    case "reply_driven":
      scores.CASUAL += 1;
      break;
    case "profile_conversion":
      scores.EDUCATOR += 1;
      scores.CURATOR += 1;
      break;
  }

  switch (profile.performance.bestHookPattern) {
    case "hot_take_open":
      scores.PROVOCATEUR += 3;
      break;
    case "story_open":
      scores.DOCUMENTARIAN += 2;
      break;
    case "question_open":
      scores.EDUCATOR += 2;
      break;
  }

  switch (profile.reply.dominantReplyTone) {
    case "playful":
      scores.ENTERTAINER += 2;
      break;
    case "insightful":
      scores.EDUCATOR += 2;
      break;
    case "direct":
      scores.PROVOCATEUR += 1;
      break;
    case "supportive":
      scores.CASUAL += 1;
      break;
    case "inquisitive":
      scores.EDUCATOR += 1;
      break;
  }

  if (profile.voice.emojiPostRate >= 25) {
    scores.ENTERTAINER += 1;
  }

  return PERSONA_ORDER
    .slice()
    .sort((left, right) => {
      const delta = scores[right] - scores[left];
      return delta !== 0 ? delta : PERSONA_ORDER.indexOf(left) - PERSONA_ORDER.indexOf(right);
    });
}

function buildSemanticClusters(profile: CreatorProfile): Array<{ name: string; weight: number }> {
  const entries = new Map<string, { name: string; weight: number }>();
  const topTopicScore = profile.topics.dominantTopics[0]?.score ?? 1;

  profile.topics.contentPillars.slice(0, 5).forEach((pillar, index) => {
    const name = normalizeWhitespace(pillar);
    if (!name) {
      return;
    }

    entries.set(name.toLowerCase(), {
      name,
      weight: Number(Math.max(0.7, 1 - index * 0.08).toFixed(2)),
    });
  });

  profile.topics.dominantTopics.slice(0, 6).forEach((topic) => {
    const name = normalizeWhitespace(topic.label);
    if (!name) {
      return;
    }

    const weight = Number(Math.max(0.4, Math.min(1.25, topic.score / topTopicScore)).toFixed(2));
    const key = name.toLowerCase();
    const existing = entries.get(key);

    entries.set(key, {
      name,
      weight: existing ? Math.max(existing.weight, weight) : weight,
    });
  });

  const primaryNiche = humanizeLabel(profile.niche.primaryNiche);
  if (primaryNiche && primaryNiche !== "generalist") {
    const key = primaryNiche.toLowerCase();
    const existing = entries.get(key);
    entries.set(key, {
      name: primaryNiche,
      weight: existing ? Math.max(existing.weight, 0.85) : 0.85,
    });
  }

  return Array.from(entries.values()).slice(0, 8);
}

function buildGoldenExampleIntent(post: CreatorRepresentativePost): string {
  return dedupeStrings([
    post.selectionReason,
    `${humanizeLabel(post.lane)} post`,
    humanizeLabel(post.hookPattern),
    humanizeLabel(post.contentType),
  ]).join(" • ");
}

function buildGoldenExamples(profile: CreatorProfile): Array<{ content: string; intent: string }> {
  const seen = new Set<string>();
  const selected: Array<{ content: string; intent: string }> = [];
  const pools = [
    ...profile.examples.bestPerforming,
    ...profile.examples.voiceAnchors,
    ...profile.examples.strategyAnchors,
    ...profile.examples.goalAnchors,
  ];

  for (const post of pools) {
    const content = normalizeWhitespace(post.text);
    const key = content.toLowerCase();
    if (!content || seen.has(key)) {
      continue;
    }

    seen.add(key);
    selected.push({
      content,
      intent: buildGoldenExampleIntent(post),
    });

    if (selected.length >= 10) {
      break;
    }
  }

  return selected;
}

export async function syncGhostwriterProfileFromCreatorProfile(args: {
  userId: string;
  xHandle: string;
  creatorProfile: CreatorProfile;
  styleCard?: VoiceStyleCard | null;
}): Promise<VoiceStyleCard> {
  const normalizedHandle = normalizeHandle(args.xHandle);
  const baseStyleCard = StyleCardSchema.parse(args.styleCard ?? createEmptyStyleCard());
  const nextStyleCard = StyleCardSchema.parse({
    ...baseStyleCard,
    ghostwriterStyleCard: buildGhostwriterStyleCard(args.creatorProfile),
  });
  const savedProfile = await saveStyleProfile(args.userId, normalizedHandle, nextStyleCard);
  const rankedPersonas = rankPersonas(args.creatorProfile);
  const semanticClusters = buildSemanticClusters(args.creatorProfile);
  const goldenExamples = buildGoldenExamples(args.creatorProfile);

  const operations = [
    prisma.voiceProfile.update({
      where: { id: savedProfile.id },
      data: {
        primaryPersona: rankedPersonas[0] ?? null,
        secondaryPersona: rankedPersonas[1] ?? null,
      },
    }),
    prisma.semanticCluster.deleteMany({
      where: { profileId: savedProfile.id },
    }),
    prisma.goldenExample.deleteMany({
      where: { profileId: savedProfile.id },
    }),
  ];

  if (semanticClusters.length > 0) {
    operations.push(
      prisma.semanticCluster.createMany({
        data: semanticClusters.map((cluster) => ({
          profileId: savedProfile.id,
          name: cluster.name,
          weight: cluster.weight,
        })),
      }),
    );
  }

  if (goldenExamples.length > 0) {
    operations.push(
      prisma.goldenExample.createMany({
        data: goldenExamples.map((example) => ({
          profileId: savedProfile.id,
          content: example.content,
          intent: example.intent,
        })),
      }),
    );
  }

  await prisma.$transaction(operations);

  return nextStyleCard;
}
