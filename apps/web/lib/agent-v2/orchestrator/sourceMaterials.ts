import { z } from "zod";

import {
  sanitizeGroundingSourceMaterials,
  type GroundingPacket,
} from "./groundingPacket.ts";
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

const APPROVED_SOURCE_TAGS = new Set([
  "accepted_output",
  "approved_draft",
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

function looksLikeCommandOrQuestion(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  if (normalized.endsWith("?")) {
    return true;
  }

  return /^(?:write|draft|make|give|help|can you|could you|turn|edit|rewrite|fix|shorten|improve|generate)\b/.test(
    normalized,
  );
}

function getRecentAssistantPrompt(recentHistory: string): string | null {
  const lines = recentHistory
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reverse();

  for (const line of lines) {
    const match = line.match(/^assistant:\s*(.+)$/i);
    if (!match?.[1]) {
      continue;
    }

    return normalizeLine(match[1]);
  }

  return null;
}

function looksLikeAssistantAnswer(value: string, recentHistory: string): boolean {
  const recentAssistantPrompt = getRecentAssistantPrompt(recentHistory);
  if (!recentAssistantPrompt || !/[?]$/.test(recentAssistantPrompt)) {
    return false;
  }

  const normalized = value.trim();
  if (normalized.length < 24 || looksLikeCommandOrQuestion(normalized)) {
    return false;
  }

  return (
    looksAutobiographical(normalized) ||
    /\b(?:it|this)\s+(?:helps|does|lets|works|cuts|removes|improves|reduces|rewrites|turns)\b/i.test(
      normalized,
    )
  );
}

function looksLikeImperativeOperatingList(value: string): boolean {
  const lines = value
    .split(/\r?\n+/)
    .map(stripSeedLinePrefix)
    .filter((line) => line.length >= 8);

  if (lines.length < 2) {
    return false;
  }

  const imperativeVerbs = /^(?:publish|ask|skip|start|stop|show|ship|share|write|test|keep|cut|remove|use|lead|open|close|answer|focus|document|sell|teach|hire|record|send)\b/i;
  const imperativeLineCount = lines.filter(
    (line) =>
      imperativeVerbs.test(line) &&
      !looksAutobiographical(line) &&
      !/[?]$/.test(line),
  ).length;

  return imperativeLineCount >= 2;
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

function inferSourceMaterialTypeFromMessage(value: string): SourceMaterialType | null {
  const normalized = value.toLowerCase();

  if (/\b(case study|breakdown|teardown|postmortem)\b/.test(normalized)) {
    return "case_study";
  }

  if (/\b(playbook|checklist|process|workflow|runbook|operating system)\b/.test(normalized)) {
    return "playbook";
  }

  if (/\b(framework|template|formula|pattern|mental model|system)\b/.test(normalized)) {
    return "framework";
  }

  if (looksLikeImperativeOperatingList(value)) {
    return "playbook";
  }

  if (
    looksAutobiographical(value) &&
    /\b(when|after|before|learned|realized|shipped|launched|built|hired|closed|lost|grew|cut|changed)\b/i.test(
      normalized,
    )
  ) {
    return "story";
  }

  return null;
}

function inferSourceMaterialTitle(args: {
  userMessage: string;
  type: SourceMaterialType;
  claims: string[];
}): string {
  const firstLine = args.userMessage
    .split(/\r?\n/)
    .map((line) => normalizeLine(line))
    .find(Boolean);

  const colonTitle = firstLine?.match(/^([^:]{3,60}):\s+/)?.[1]?.trim();
  if (colonTitle) {
    return truncateTitle(colonTitle);
  }

  const prefix =
    args.type === "playbook"
      ? "Playbook"
      : args.type === "framework"
        ? "Framework"
        : args.type === "case_study"
          ? "Case study"
          : "Story";

  const seed = args.claims[0] || firstLine || args.userMessage;
  return truncateTitle(`${prefix}: ${seed}`);
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
  approvedDraftText?: string | null;
}): SourceMaterialAssetInput | null {
  const claims = dedupeList(params.source.claims || []).slice(0, 3);
  const snippets = dedupeList([
    ...(params.source.snippets || []),
    ...extractSeedSnippetsFromText(params.approvedDraftText || ""),
  ]).slice(0, 3);
  if (claims.length === 0 && snippets.length === 0) {
    return null;
  }

  return normalizeSourceMaterialInput({
    type: params.source.type,
    title: truncateTitle(params.source.title || params.candidateTitle),
    tags: dedupeList([
      params.source.type,
      params.sourcePlaybook || "",
      ...(params.approvedDraftText ? ["approved_draft", "accepted_output"] : []),
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

export function buildPromotedDraftSourceMaterialInputs(args: {
  title: string;
  content: string;
  groundingSources: DraftGroundingSource[];
  limit?: number;
}): SourceMaterialAssetInput[] {
  const candidateTitle = normalizeLine(args.title) || "Approved draft";
  const approvedDraftText = args.content.trim();
  if (!approvedDraftText || args.groundingSources.length === 0) {
    return [];
  }

  const seeds = args.groundingSources
    .map((source) =>
      buildGroundingSourceSeedAsset({
        source,
        candidateTitle,
        approvedDraftText,
      }),
    )
    .filter((asset): asset is SourceMaterialAssetInput => Boolean(asset));

  return dedupeSeedAssets(seeds).slice(0, Math.max(1, Math.min(args.limit ?? 2, 2)));
}

export function extractAutoSourceMaterialInputs(args: {
  userMessage: string;
  recentHistory: string;
  extractedFacts?: string[] | null;
}): SourceMaterialAssetInput[] {
  const trimmed = args.userMessage.trim();
  const qualifiesAsAssistantAnswer = looksLikeAssistantAnswer(trimmed, args.recentHistory);
  if (
    (trimmed.length < 48 && !qualifiesAsAssistantAnswer) ||
    looksLikeCommandOrQuestion(trimmed) ||
    /^assistant:/i.test(trimmed)
  ) {
    return [];
  }

  const type = inferSourceMaterialTypeFromMessage(trimmed);
  if (!type) {
    return [];
  }

  const extractedClaims = dedupeList(args.extractedFacts || []);
  const claims = dedupeList([
    ...extractedClaims,
    ...extractSeedClaimsFromText(trimmed),
  ]).slice(0, 4);
  const snippets = extractSeedSnippetsFromText(trimmed);

  if (claims.length === 0 && snippets.length === 0) {
    return [];
  }

  if (
    type === "story" &&
    !claims.some(looksAutobiographical) &&
    !snippets.some(looksAutobiographical)
  ) {
    return [];
  }

  const input = normalizeSourceMaterialInput({
    type,
    title: inferSourceMaterialTitle({
      userMessage: trimmed,
      type,
      claims,
    }),
    tags: dedupeList([
      type,
      ...tokenize(trimmed).slice(0, 4),
    ]),
    verified: true,
    claims,
    snippets,
    doNotClaim: [],
  });

  return input.claims.length === 0 && input.snippets.length === 0 ? [] : [input];
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
