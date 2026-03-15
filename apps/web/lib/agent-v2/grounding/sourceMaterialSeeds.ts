import type { DraftGroundingSource } from "../../onboarding/draftArtifacts.ts";
import type {
  CreatorRepresentativeExamples,
  CreatorRepresentativePost,
} from "../../onboarding/types.ts";
import type { SourceMaterialAssetInput } from "./sourceMaterials.ts";
import { normalizeSourceMaterialInput } from "./sourceMaterials.ts";
import {
  dedupeList,
  looksAutobiographical,
  normalizeLine,
  tokenize,
  type SourceMaterialType,
} from "./sourceMaterialShared.ts";

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

function stripSeedLinePrefix(value: string): string {
  return normalizeLine(
    value
      .replace(/^\s*[-*>•]\s+/, "")
      .replace(/^\s*\d+(?:[.)/-])\s+/, ""),
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
