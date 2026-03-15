import { tokenize } from "./sourceMaterialShared.ts";
import type { SourceMaterialAssetRecord } from "./sourceMaterials.ts";

const APPROVED_SOURCE_TAGS = new Set([
  "accepted_output",
  "approved_draft",
]);

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
  const acceptanceBoost = Array.from(APPROVED_SOURCE_TAGS).some((tag) => tagSet.has(tag))
    ? 28
    : 0;
  const recencyBoost = scoreSourceRecency(args.asset);

  return relevanceScore + verifiedBoost + acceptanceBoost + recencyBoost;
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

      const rightRecency = Date.parse(
        right.asset.lastUsedAt || right.asset.updatedAt || right.asset.createdAt,
      );
      const leftRecency = Date.parse(
        left.asset.lastUsedAt || left.asset.updatedAt || left.asset.createdAt,
      );
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

      const rightRecency = Date.parse(
        right.asset.lastUsedAt || right.asset.updatedAt || right.asset.createdAt,
      );
      const leftRecency = Date.parse(
        left.asset.lastUsedAt || left.asset.updatedAt || left.asset.createdAt,
      );
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
