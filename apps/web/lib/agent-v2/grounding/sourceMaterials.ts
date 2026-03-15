import { z } from "zod";

import {
  collectGroundingFactualAuthority,
  sanitizeGroundingSourceMaterials,
  type GroundingPacket,
} from "./groundingPacket.ts";
import {
  dedupeList,
  looksAutobiographical,
  normalizeLine,
  normalizeTag,
  tokenize,
  SourceMaterialTypeSchema,
  type SourceMaterialType,
} from "./sourceMaterialShared.ts";

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

const APPROVED_SOURCE_TAGS = new Set([
  "accepted_output",
  "approved_draft",
]);

export function buildSourceMaterialIdentityKey(
  asset: Pick<SourceMaterialAssetInput, "type" | "title" | "claims" | "snippets">,
): string {
  const normalized = normalizeSourceMaterialInput({
    type: asset.type,
    title: asset.title,
    tags: [],
    verified: true,
    claims: asset.claims,
    snippets: asset.snippets,
    doNotClaim: [],
  });

  return [
    normalized.type,
    normalized.title.toLowerCase(),
    (normalized.claims[0] || normalized.snippets[0] || "").toLowerCase(),
  ].join("::");
}

export function filterNewSourceMaterialInputs(args: {
  existing: Array<Pick<SourceMaterialAssetInput, "type" | "title" | "claims" | "snippets">>;
  incoming: SourceMaterialAssetInput[];
}): SourceMaterialAssetInput[] {
  const seen = new Set(args.existing.map((asset) => buildSourceMaterialIdentityKey(asset)));

  return args.incoming.filter((asset) => {
    const key = buildSourceMaterialIdentityKey(asset);
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
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
  const keywordSet = new Set(args.keywords);
  const corpusTokens = buildSourceMaterialCorpusTokenSet(args.asset);
  const titleTokens = new Set(tokenize(args.asset.title));
  const tagSet = new Set(args.asset.tags.map((tag) => tag.toLowerCase()));

  const keywordHits = args.keywords.filter((keyword) => corpusTokens.has(keyword)).length;
  const titleHits = args.keywords.filter((keyword) => titleTokens.has(keyword)).length;
  const tagHits = Array.from(keywordSet).filter((keyword) => tagSet.has(keyword)).length;
  const relevanceScore = keywordHits * 14 + titleHits * 8 + tagHits * 6;
  const verifiedBoost = args.asset.verified ? 20 : 0;
  const acceptanceBoost = Array.from(APPROVED_SOURCE_TAGS).some((tag) => tagSet.has(tag)) ? 28 : 0;
  const recencyBoost = scoreSourceRecency(args.asset);

  return relevanceScore + verifiedBoost + acceptanceBoost + recencyBoost;
}

function scoreSourceRecency(asset: SourceMaterialAssetRecord): number {
  const timestamps = [asset.lastUsedAt, asset.updatedAt, asset.createdAt]
    .map((value) => (value ? Date.parse(value) : Number.NaN))
    .filter((value) => Number.isFinite(value));

  if (timestamps.length === 0) {
    return 0;
  }

  const latestTimestamp = Math.max(...timestamps);
  const ageInDays = Math.max(0, (Date.now() - latestTimestamp) / 86_400_000);
  const lastUsedBoost = asset.lastUsedAt ? 8 : 0;

  if (ageInDays <= 7) {
    return lastUsedBoost + 18;
  }

  if (ageInDays <= 30) {
    return lastUsedBoost + 12;
  }

  if (ageInDays <= 90) {
    return lastUsedBoost + 6;
  }

  if (ageInDays <= 180) {
    return lastUsedBoost + 2;
  }

  return lastUsedBoost;
}

function buildSourceMaterialCorpusTokenSet(asset: SourceMaterialAssetRecord): Set<string> {
  return new Set(
    tokenize(
      [
        asset.title,
        asset.tags.join(" "),
        asset.claims.join(" "),
        asset.snippets.join(" "),
      ].join(" "),
    ),
  );
}

function looksLikeVagueSourceMaterialRequest(args: {
  userMessage: string;
  keywords: string[];
}): boolean {
  const normalized = args.userMessage.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  const genericBundlePrompt = /^(?:give|write|draft|make|create|generate)\s+(?:me\s+)?(?:(?:a\s+)?random\s+post|multiple\s+(?:posts|drafts|tweets)(?:\s+i(?:\s+can|\s*'d)\s+use)?|(?:\d+|two|three|four|five)\s+(?:posts|drafts|tweets)|(?:a\s+)?post)\b/.test(
    normalized,
  );
  if (genericBundlePrompt) {
    return true;
  }

  if (args.keywords.length >= 3) {
    return false;
  }

  return /^(?:give|write|draft|make|create|generate)\s+(?:me\s+)?(?:(?:a\s+)?random\s+post|multiple\s+(?:posts|drafts|tweets)|(?:\d+|two|three|four|five)\s+(?:posts|drafts|tweets)|(?:a\s+)?post)\b/.test(
    normalized,
  );
}

function selectFallbackSourceMaterials(args: {
  assets: SourceMaterialAssetRecord[];
  limit: number;
}): SourceMaterialAssetRecord[] {
  return args.assets
    .filter((asset) => asset.verified)
    .map((asset) => {
      const tagSet = new Set(asset.tags.map((tag) => tag.toLowerCase()));
      const acceptanceBoost = Array.from(APPROVED_SOURCE_TAGS).some((tag) => tagSet.has(tag))
        ? 28
        : 0;
      return {
        asset,
        score: scoreSourceRecency(asset) + acceptanceBoost + (asset.lastUsedAt ? 8 : 0),
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      const rightRecency = Date.parse(right.asset.lastUsedAt || right.asset.updatedAt || right.asset.createdAt);
      const leftRecency = Date.parse(left.asset.lastUsedAt || left.asset.updatedAt || left.asset.createdAt);
      return rightRecency - leftRecency;
    })
    .slice(0, args.limit)
    .map(({ asset }) => asset);
}

export function selectRelevantSourceMaterials(args: {
  assets: SourceMaterialAssetRecord[];
  userMessage: string;
  topicSummary?: string | null;
  limit?: number;
}): SourceMaterialAssetRecord[] {
  const limit = Math.max(1, Math.min(args.limit ?? 2, 2));
  const keywords = tokenize(`${args.userMessage} ${args.topicSummary || ""}`);
  const scored = args.assets
    .filter((asset) => asset.verified)
    .map((asset) => {
      const corpusTokens = buildSourceMaterialCorpusTokenSet(asset);
      return {
        asset,
        score: scoreSourceMaterial({ asset, keywords }),
        keywordHits: keywords.filter((keyword) => corpusTokens.has(keyword)).length,
      };
    })
    .filter(({ score, keywordHits }) => {
      if (keywords.length === 0) {
        return score > 0;
      }

      return keywordHits > 0;
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      const rightRecency = Date.parse(right.asset.lastUsedAt || right.asset.updatedAt || right.asset.createdAt);
      const leftRecency = Date.parse(left.asset.lastUsedAt || left.asset.updatedAt || left.asset.createdAt);
        return rightRecency - leftRecency;
      })
    .slice(0, limit)
    .map(({ asset }) => asset);

  if (scored.length > 0) {
    return scored;
  }

  if (looksLikeVagueSourceMaterialRequest({ userMessage: args.userMessage, keywords })) {
    return selectFallbackSourceMaterials({
      assets: args.assets,
      limit,
    });
  }

  return [];
}

export function mergeSourceMaterialsIntoGroundingPacket(args: {
  groundingPacket: GroundingPacket;
  sourceMaterials: SourceMaterialAssetRecord[];
}): GroundingPacket {
  const sanitizedSourceMaterials = sanitizeGroundingSourceMaterials(
    args.sourceMaterials,
    args.groundingPacket.forbiddenClaims,
  );

  if (sanitizedSourceMaterials.length === 0) {
    return args.groundingPacket;
  }

  const addedClaims = dedupeList(
    sanitizedSourceMaterials.flatMap((asset) => asset.claims),
  );
  const addedAutobiographicalClaims = addedClaims.filter(looksAutobiographical);
  const addedNumbers = dedupeList(
    addedClaims.flatMap((claim) => claim.match(/\b\d[\d,./%]*\b/g) || []),
  );
  const addedForbiddenClaims = dedupeList(
    sanitizedSourceMaterials.flatMap((asset) => asset.doNotClaim),
  );
  const existingSourceMaterialKeys = new Set(
    args.groundingPacket.sourceMaterials.map((asset) => `${asset.type}:${asset.title}`.toLowerCase()),
  );
  const mergedSourceMaterials = sanitizedSourceMaterials
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

  const nextPacket = {
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

  return {
    ...nextPacket,
    factualAuthority: collectGroundingFactualAuthority(nextPacket),
  };
}
