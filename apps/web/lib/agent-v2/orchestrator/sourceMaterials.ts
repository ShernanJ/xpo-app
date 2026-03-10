import { z } from "zod";

import type { GroundingPacket } from "./groundingPacket.ts";

export const SourceMaterialTypeSchema = z.enum([
  "story",
  "playbook",
  "framework",
  "case_study",
]);

export const SourceMaterialAssetInputSchema = z.object({
  type: SourceMaterialTypeSchema,
  title: z.string().trim().min(3).max(160),
  tags: z.array(z.string()).default([]),
  verified: z.boolean().default(false),
  claims: z.array(z.string()).default([]),
  snippets: z.array(z.string()).default([]),
  doNotClaim: z.array(z.string()).default([]),
});

export const SourceMaterialAssetPatchSchema = z.object({
  type: SourceMaterialTypeSchema.optional(),
  title: z.string().trim().min(3).max(160).optional(),
  tags: z.array(z.string()).optional(),
  verified: z.boolean().optional(),
  claims: z.array(z.string()).optional(),
  snippets: z.array(z.string()).optional(),
  doNotClaim: z.array(z.string()).optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one field must be provided.",
});

export type SourceMaterialType = z.infer<typeof SourceMaterialTypeSchema>;
export type SourceMaterialAssetInput = z.infer<typeof SourceMaterialAssetInputSchema>;
export type SourceMaterialAssetPatch = z.infer<typeof SourceMaterialAssetPatchSchema>;

export interface SourceMaterialAssetRecord extends SourceMaterialAssetInput {
  id: string;
  userId: string;
  xHandle: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const TOPIC_STOPWORDS = new Set([
  "about",
  "after",
  "again",
  "because",
  "best",
  "build",
  "building",
  "case",
  "draft",
  "faster",
  "for",
  "framework",
  "grow",
  "growth",
  "help",
  "idea",
  "make",
  "more",
  "playbook",
  "post",
  "posts",
  "ship",
  "shipping",
  "story",
  "thread",
  "threads",
  "tweet",
  "tweets",
  "with",
  "write",
  "writing",
  "x",
]);

function normalizeLine(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function dedupeList(values: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const value of values) {
    const normalized = normalizeLine(value);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }

    seen.add(key);
    next.push(normalized);
  }

  return next;
}

function normalizeTag(value: string): string {
  return normalizeLine(value).toLowerCase();
}

function tokenize(value: string): string[] {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3 && !TOPIC_STOPWORDS.has(token)),
    ),
  );
}

function looksAutobiographical(value: string): boolean {
  return /\b(?:i|we|my|our|me|us)\b/i.test(value);
}

export function normalizeSourceMaterialInput(
  value: SourceMaterialAssetInput,
): SourceMaterialAssetInput {
  return {
    type: value.type,
    title: normalizeLine(value.title),
    tags: dedupeList(value.tags || []).map(normalizeTag),
    verified: value.verified === true,
    claims: dedupeList(value.claims || []),
    snippets: dedupeList(value.snippets || []),
    doNotClaim: dedupeList(value.doNotClaim || []),
  };
}

export function normalizeSourceMaterialPatch(
  value: SourceMaterialAssetPatch,
): SourceMaterialAssetPatch {
  const next: SourceMaterialAssetPatch = {};

  if (value.type) {
    next.type = value.type;
  }
  if (typeof value.title === "string") {
    next.title = normalizeLine(value.title);
  }
  if (value.tags) {
    next.tags = dedupeList(value.tags).map(normalizeTag);
  }
  if (typeof value.verified === "boolean") {
    next.verified = value.verified;
  }
  if (value.claims) {
    next.claims = dedupeList(value.claims);
  }
  if (value.snippets) {
    next.snippets = dedupeList(value.snippets);
  }
  if (value.doNotClaim) {
    next.doNotClaim = dedupeList(value.doNotClaim);
  }

  return next;
}

export function serializeSourceMaterialAsset(asset: {
  id: string;
  userId: string;
  xHandle: string | null;
  type: SourceMaterialType;
  title: string;
  tags: unknown;
  verified: boolean;
  claims: unknown;
  snippets: unknown;
  doNotClaim: unknown;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): SourceMaterialAssetRecord {
  const parsed = normalizeSourceMaterialInput(
    SourceMaterialAssetInputSchema.parse({
      type: asset.type,
      title: asset.title,
      tags: asset.tags,
      verified: asset.verified,
      claims: asset.claims,
      snippets: asset.snippets,
      doNotClaim: asset.doNotClaim,
    }),
  );

  return {
    id: asset.id,
    userId: asset.userId,
    xHandle: asset.xHandle || null,
    type: parsed.type,
    title: parsed.title,
    tags: parsed.tags,
    verified: parsed.verified,
    claims: parsed.claims,
    snippets: parsed.snippets,
    doNotClaim: parsed.doNotClaim,
    lastUsedAt: asset.lastUsedAt?.toISOString() || null,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
  };
}

function scoreSourceMaterial(args: {
  asset: SourceMaterialAssetRecord;
  keywords: string[];
}): number {
  const corpus = [
    args.asset.title,
    args.asset.tags.join(" "),
    args.asset.claims.join(" "),
    args.asset.snippets.join(" "),
  ]
    .join(" ")
    .toLowerCase();

  const hits = args.keywords.filter((keyword) => corpus.includes(keyword)).length;
  const verifiedBoost = args.asset.verified ? 30 : 0;
  const recencyBoost = args.asset.lastUsedAt ? 8 : 0;

  return verifiedBoost + recencyBoost + hits * 12;
}

export function selectRelevantSourceMaterials(args: {
  assets: SourceMaterialAssetRecord[];
  userMessage: string;
  topicSummary?: string | null;
  limit?: number;
}): SourceMaterialAssetRecord[] {
  const limit = Math.max(1, Math.min(args.limit ?? 2, 2));
  const keywords = tokenize(`${args.userMessage} ${args.topicSummary || ""}`);

  return args.assets
    .filter((asset) => asset.verified)
    .map((asset) => ({
      asset,
      score: scoreSourceMaterial({ asset, keywords }),
    }))
    .filter(({ score }) => score > 0 || keywords.length === 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ asset }) => asset);
}

export function mergeSourceMaterialsIntoGroundingPacket(args: {
  groundingPacket: GroundingPacket;
  sourceMaterials: SourceMaterialAssetRecord[];
}): GroundingPacket {
  if (args.sourceMaterials.length === 0) {
    return args.groundingPacket;
  }

  const addedClaims = dedupeList(
    args.sourceMaterials.flatMap((asset) => asset.claims),
  );
  const addedAutobiographicalClaims = addedClaims.filter(looksAutobiographical);
  const addedNumbers = dedupeList(
    addedClaims.flatMap((claim) => claim.match(/\b\d[\d,./%]*\b/g) || []),
  );
  const addedForbiddenClaims = dedupeList(
    args.sourceMaterials.flatMap((asset) => asset.doNotClaim),
  );
  const existingSourceMaterialKeys = new Set(
    args.groundingPacket.sourceMaterials.map((asset) => `${asset.type}:${asset.title}`.toLowerCase()),
  );
  const mergedSourceMaterials = args.sourceMaterials
    .filter((asset) => {
      const key = `${asset.type}:${asset.title}`.toLowerCase();
      if (existingSourceMaterialKeys.has(key)) {
        return false;
      }

      existingSourceMaterialKeys.add(key);
      return true;
    })
    .map((asset) => ({
      type: asset.type,
      title: asset.title,
      claims: asset.claims,
      snippets: asset.snippets,
    }));

  return {
    ...args.groundingPacket,
    durableFacts: dedupeList([
      ...args.groundingPacket.durableFacts,
      ...addedClaims,
    ]),
    allowedFirstPersonClaims: dedupeList([
      ...args.groundingPacket.allowedFirstPersonClaims,
      ...addedAutobiographicalClaims,
    ]),
    allowedNumbers: dedupeList([
      ...args.groundingPacket.allowedNumbers,
      ...addedNumbers,
    ]),
    forbiddenClaims: dedupeList([
      ...args.groundingPacket.forbiddenClaims,
      ...addedForbiddenClaims,
    ]),
    sourceMaterials: [
      ...args.groundingPacket.sourceMaterials,
      ...mergedSourceMaterials,
    ],
  };
}
