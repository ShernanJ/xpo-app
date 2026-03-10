import { z } from "zod";

import type { GroundingPacket } from "./groundingPacket.ts";
import type { DraftGroundingSource } from "../../onboarding/draftArtifacts.ts";
import type {
  CreatorRepresentativeExamples,
  CreatorRepresentativePost,
} from "../../onboarding/types.ts";

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

function stripSeedLinePrefix(value: string): string {
  return normalizeLine(
    value
      .replace(/^\s*[-*>•]\s+/, "")
      .replace(/^\s*\d+(?:[.)/-])\s+/, ""),
  );
}

function extractSeedClaimsFromText(text: string): string[] {
  const lines = text
    .split(/\r?\n+/)
    .map(stripSeedLinePrefix)
    .filter((line) => line.length >= 16 && !/^https?:\/\//i.test(line));

  if (lines.length > 0) {
    return dedupeList(lines).slice(0, 3);
  }

  return dedupeList(
    text
      .split(/(?<=[.!?])\s+/)
      .map(stripSeedLinePrefix)
      .filter((line) => line.length >= 16),
  ).slice(0, 3);
}

function extractSeedSnippetsFromText(text: string): string[] {
  const normalizedText = text.trim();
  const claims = extractSeedClaimsFromText(text);
  const snippets = dedupeList([
    ...claims,
    normalizeLine(normalizedText).slice(0, 280),
  ]).filter((line) => line.length >= 16);

  return snippets.slice(0, 3);
}

function inferSourceMaterialTypeFromText(text: string): SourceMaterialType {
  const normalized = text.toLowerCase();

  if (/\b(playbook|checklist|workflow|operating system|runbook)\b/.test(normalized)) {
    return "playbook";
  }

  if (/\b(framework|template|formula|pattern|system|mental model)\b/.test(normalized)) {
    return "framework";
  }

  if (/\b(case study|breakdown|teardown|postmortem)\b/.test(normalized)) {
    return "case_study";
  }

  return "story";
}

function truncateTitle(value: string, max = 120): string {
  const normalized = normalizeLine(value);
  if (normalized.length <= max) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function buildRepresentativePostSeedAsset(params: {
  post: CreatorRepresentativePost;
  label: string;
}): SourceMaterialAssetInput | null {
  const claims = extractSeedClaimsFromText(params.post.text);
  if (claims.length === 0) {
    return null;
  }

  const titleSeed = claims[0] || params.post.text;
  return normalizeSourceMaterialInput({
    type: inferSourceMaterialTypeFromText(params.post.text),
    title: truncateTitle(`${params.label}: ${titleSeed}`),
    tags: dedupeList([
      params.post.lane,
      params.post.contentType,
      params.post.hookPattern,
      ...tokenize(`${params.post.selectionReason} ${titleSeed}`).slice(0, 3),
    ]),
    verified: true,
    claims,
    snippets: extractSeedSnippetsFromText(params.post.text),
    doNotClaim: [],
  });
}

function buildGroundingSourceSeedAsset(params: {
  source: DraftGroundingSource;
  candidateTitle: string;
  sourcePlaybook?: string | null;
}): SourceMaterialAssetInput | null {
  const claims = dedupeList(params.source.claims || []).slice(0, 3);
  const snippets = dedupeList(params.source.snippets || []).slice(0, 3);
  if (claims.length === 0 && snippets.length === 0) {
    return null;
  }

  return normalizeSourceMaterialInput({
    type: params.source.type,
    title: truncateTitle(params.source.title || params.candidateTitle),
    tags: dedupeList([
      params.source.type,
      params.sourcePlaybook || "",
      ...tokenize(`${params.candidateTitle} ${params.source.title}`).slice(0, 3),
    ]),
    verified: true,
    claims,
    snippets,
    doNotClaim: [],
  });
}

function dedupeSeedAssets(assets: SourceMaterialAssetInput[]): SourceMaterialAssetInput[] {
  const seen = new Set<string>();
  const next: SourceMaterialAssetInput[] = [];

  for (const asset of assets) {
    const key = [
      asset.type,
      asset.title.toLowerCase(),
      (asset.claims[0] || asset.snippets[0] || "").toLowerCase(),
    ].join("::");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    next.push(asset);
  }

  return next;
}

export function buildSeedSourceMaterialInputs(args: {
  examples: Pick<CreatorRepresentativeExamples, "bestPerforming" | "voiceAnchors">;
  draftCandidates?: Array<{
    title: string;
    sourcePlaybook?: string | null;
    artifact?: {
      groundingSources?: DraftGroundingSource[];
    } | null;
  }>;
  limit?: number;
}): SourceMaterialAssetInput[] {
  const seeds: SourceMaterialAssetInput[] = [];

  for (const post of args.examples.bestPerforming.slice(0, 2)) {
    const asset = buildRepresentativePostSeedAsset({
      post,
      label: "Best post",
    });
    if (asset) {
      seeds.push(asset);
    }
  }

  for (const post of args.examples.voiceAnchors.slice(0, 2)) {
    const asset = buildRepresentativePostSeedAsset({
      post,
      label: "Voice anchor",
    });
    if (asset) {
      seeds.push(asset);
    }
  }

  for (const candidate of args.draftCandidates || []) {
    for (const source of candidate.artifact?.groundingSources || []) {
      const asset = buildGroundingSourceSeedAsset({
        source,
        candidateTitle: candidate.title,
        sourcePlaybook: candidate.sourcePlaybook,
      });
      if (asset) {
        seeds.push(asset);
      }
    }
  }

  return dedupeSeedAssets(seeds).slice(0, Math.max(1, args.limit ?? 8));
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
