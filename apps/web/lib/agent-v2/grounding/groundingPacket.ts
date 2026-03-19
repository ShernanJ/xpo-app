import type { DraftContextSlots } from "../capabilities/planning/draftContextSlots.ts";
import { looksLikeProfileContextLeak } from "../core/profileContextLeak.ts";

export interface GroundingPacketSourceMaterial {
  type: "story" | "playbook" | "framework" | "case_study";
  title: string;
  claims: string[];
  snippets: string[];
}

export interface GroundingPacket {
  durableFacts: string[];
  turnGrounding: string[];
  allowedFirstPersonClaims: string[];
  allowedNumbers: string[];
  forbiddenClaims: string[];
  unknowns: string[];
  sourceMaterials: GroundingPacketSourceMaterial[];
  factualAuthority?: string[];
  voiceContextHints?: string[];
}

export interface CreatorProfileHints {
  preferredOutputShape:
    | "short_form_post"
    | "long_form_post"
    | "thread_seed"
    | "reply_candidate"
    | "quote_candidate";
  threadBias: "low" | "medium" | "high";
  preferredHookPatterns: string[];
  toneGuidelines: string[];
  ctaPolicy: string;
  topExampleSnippets: string[];
  knownFor?: string | null;
  targetAudience?: string | null;
  contentPillars?: string[];
  replyGoals?: string[];
  profileConversionCues?: string[];
  offBrandThemes?: string[];
  ambiguities?: string[];
  learningSignals?: string[];
  voiceProfile?: {
    primaryCasing: "lowercase" | "normal";
    averageLengthBand: "short" | "medium" | "long" | null;
    lowercaseSharePercent: number;
    multiLinePostRate: number;
  };
}

interface GroundingStyleCard {
  contextAnchors?: string[];
  factLedger?: {
    durableFacts?: string[];
    allowedFirstPersonClaims?: string[];
    allowedNumbers?: string[];
    forbiddenClaims?: string[];
    sourceMaterials?: Array<{
      type: "story" | "playbook" | "framework" | "case_study";
      title: string;
      claims?: string[];
      snippets?: string[];
    }>;
  } | null;
}

const GROUNDING_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "for",
  "from",
  "i",
  "in",
  "is",
  "it",
  "me",
  "my",
  "of",
  "on",
  "our",
  "that",
  "the",
  "this",
  "to",
  "us",
  "was",
  "we",
  "with",
]);

function normalizeLine(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function dedupeLines(values: string[]): string[] {
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

export function collectGroundingFactualAuthority(packet: {
  durableFacts: string[];
  turnGrounding: string[];
  allowedFirstPersonClaims: string[];
  sourceMaterials: Array<{ claims: string[]; snippets: string[] }>;
  factualAuthority?: string[];
}): string[] {
  if (packet.factualAuthority && packet.factualAuthority.length > 0) {
    return dedupeLines(packet.factualAuthority);
  }

  return dedupeLines([
    ...packet.durableFacts,
    ...packet.turnGrounding,
    ...packet.allowedFirstPersonClaims,
    ...packet.sourceMaterials.flatMap((asset) => [...asset.claims, ...asset.snippets]),
  ]);
}

function extractConstraintGrounding(activeConstraints: string[]): string[] {
  return dedupeLines(
    activeConstraints
      .filter(
        (entry) =>
          /^Correction lock:/i.test(entry) || /^Topic grounding:/i.test(entry),
      )
      .map((entry) =>
        entry
          .replace(/^Correction lock:\s*/i, "")
          .replace(/^Topic grounding:\s*/i, "")
          .trim(),
      ),
  );
}

function collectNumberTokens(values: string[]): string[] {
  return dedupeLines(
    values.flatMap((value) => value.match(/\b\d[\d,./%]*\b/g) || []),
  );
}

function normalizeComparable(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s%]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripForbiddenPrefix(value: string): string {
  return normalizeLine(
    value
      .replace(
        /^(?:do not|don't|dont|never)\s+(?:claim|say|mention|write|reuse)\s+/i,
        "",
      )
      .replace(/^(?:do not|don't|dont|never)\s+/i, ""),
  );
}

function collectComparableTokens(value: string): string[] {
  return normalizeComparable(value)
    .split(" ")
    .map((token) => {
      const normalized = token.trim();
      if (normalized.length > 4 && normalized.endsWith("s")) {
        return normalized.slice(0, -1);
      }

      return normalized;
    })
    .filter((token) => token.length > 1 && !GROUNDING_STOPWORDS.has(token));
}

function hasNegationCue(value: string): boolean {
  return /\b(?:no|not|never|dont|don't|doesnt|doesn't|didnt|didn't|cant|can't|cannot|isnt|isn't|arent|aren't|wasnt|wasn't|werent|weren't|without)\b/i.test(
    value,
  );
}

function invertCorrectionDetail(detail: string): string | null {
  const normalized = normalizeLine(detail);
  if (!normalized) {
    return null;
  }

  const doesNotMatch = normalized.match(/^(.*)\bdoes(?: not|n't|nt)\s+([a-z]+)(.*)$/i);
  if (doesNotMatch) {
    const [, subject, verb, rest] = doesNotMatch;
    const nextVerb = verb.endsWith("s") ? verb : `${verb}s`;
    const inverted = normalizeLine(`${subject.trim()} ${nextVerb}${rest}`);
    return inverted && inverted.toLowerCase() !== normalized.toLowerCase() ? inverted : null;
  }

  const replacements: Array<[RegExp, string]> = [
    [/\bdoes not\b/gi, ""],
    [/\bdoesn't\b/gi, ""],
    [/\bdoesnt\b/gi, ""],
    [/\bdo not\b/gi, ""],
    [/\bdon't\b/gi, ""],
    [/\bdont\b/gi, ""],
    [/\bdid not\b/gi, ""],
    [/\bdidn't\b/gi, ""],
    [/\bdidnt\b/gi, ""],
    [/\bis not\b/gi, "is"],
    [/\bisn't\b/gi, "is"],
    [/\bisnt\b/gi, "is"],
    [/\bare not\b/gi, "are"],
    [/\baren't\b/gi, "are"],
    [/\barent\b/gi, "are"],
    [/\bwas not\b/gi, "was"],
    [/\bwasn't\b/gi, "was"],
    [/\bwasnt\b/gi, "was"],
    [/\bwere not\b/gi, "were"],
    [/\bweren't\b/gi, "were"],
    [/\bwerent\b/gi, "were"],
    [/\bcannot\b/gi, "can"],
    [/\bcan't\b/gi, "can"],
    [/\bcant\b/gi, "can"],
    [/\bwill not\b/gi, "will"],
    [/\bwon't\b/gi, "will"],
    [/\bwont\b/gi, "will"],
    [/\bnot a\b/gi, "a"],
    [/\bnot an\b/gi, "an"],
    [/\bnot the\b/gi, "the"],
    [/\bnot\b/gi, ""],
    [/\bno\b/gi, ""],
  ];

  for (const [pattern, replacement] of replacements) {
    if (!pattern.test(normalized)) {
      continue;
    }

    const inverted = normalizeLine(normalized.replace(pattern, replacement));
    return inverted && inverted.toLowerCase() !== normalized.toLowerCase() ? inverted : null;
  }

  return null;
}

function deriveForbiddenClaimsFromCorrectionLocks(activeConstraints: string[]): string[] {
  return dedupeLines(
    activeConstraints
      .filter((entry) => /^Correction lock:/i.test(entry))
      .map((entry) => entry.replace(/^Correction lock:\s*/i, "").trim())
      .map(invertCorrectionDetail)
      .filter((entry): entry is string => Boolean(entry))
      .map((entry) => `Do not claim ${entry}.`),
  );
}

export function conflictsWithGroundingForbiddenClaims(
  candidate: string,
  forbiddenClaims: string[],
): boolean {
  const normalizedCandidate = normalizeComparable(candidate);
  if (!normalizedCandidate) {
    return false;
  }

  const candidateTokens = Array.from(new Set(collectComparableTokens(candidate)));
  const candidateHasNegation = hasNegationCue(candidate);

  return forbiddenClaims.some((entry) => {
    const comparableEntry = normalizeComparable(stripForbiddenPrefix(entry));
    if (!comparableEntry) {
      return false;
    }

    const entryHasNegation = hasNegationCue(comparableEntry);
    if (candidateHasNegation && !entryHasNegation) {
      return false;
    }

    if (
      normalizedCandidate.includes(comparableEntry) ||
      comparableEntry.includes(normalizedCandidate)
    ) {
      return true;
    }

    const entryTokens = new Set(collectComparableTokens(comparableEntry));
    if (candidateTokens.length === 0 || entryTokens.size === 0) {
      return false;
    }

    const overlap = candidateTokens.filter((token) => entryTokens.has(token)).length;
    if (overlap === 0) {
      return false;
    }

    const score = overlap / candidateTokens.length;
    const candidateNumbers = candidate.match(/\b\d[\d,./%a-z]*\b/gi) || [];
    const entryNumbers = comparableEntry.match(/\b\d[\d,./%a-z]*\b/gi) || [];
    const sharesNumber =
      candidateNumbers.length > 0 &&
      entryNumbers.some((value) =>
        candidateNumbers.some((candidateValue) => candidateValue.toLowerCase() === value.toLowerCase()),
      );

    return score >= 0.6 || (score >= 0.4 && sharesNumber);
  });
}

export function filterConflictingGroundingStrings(
  values: string[],
  forbiddenClaims: string[],
): string[] {
  return dedupeLines(values).filter(
    (value) => !conflictsWithGroundingForbiddenClaims(value, forbiddenClaims),
  );
}

export function sanitizeGroundingSourceMaterials<
  T extends { claims: string[]; snippets: string[] },
>(sourceMaterials: T[], forbiddenClaims: string[]): T[] {
  return sourceMaterials
    .map((asset) => ({
      ...asset,
      claims: filterConflictingGroundingStrings(asset.claims || [], forbiddenClaims),
      snippets: filterConflictingGroundingStrings(asset.snippets || [], forbiddenClaims),
    }))
    .filter((asset) => asset.claims.length > 0 || asset.snippets.length > 0);
}

function looksLikeLegacyFactAnchor(value: string): boolean {
  const normalized = normalizeLine(value);
  if (!normalized) {
    return false;
  }

  if (looksLikeAutobiographicalClaim(normalized)) {
    return true;
  }

  if (/\b\d[\d,./%]*\b/.test(normalized)) {
    return true;
  }

  return /\b(?:is|are|was|were|has|have|had|helps|help|lets|let|does|do|works|work|builds|build|built|building|launched|launch|shipping|ship|runs|run|founded|serves|targets|sells|uses|used)\b/i.test(
    normalized,
  );
}

function getGroundingStyleCardFacts(styleCard: GroundingStyleCard | null | undefined): string[] {
  if (!styleCard) {
    return [];
  }

  return dedupeLines([
    ...(styleCard.factLedger?.durableFacts || []),
    ...(styleCard.contextAnchors || []).filter(looksLikeLegacyFactAnchor),
  ]).filter((entry) => !looksLikeProfileContextLeak(entry));
}

function getVoiceContextHintsFromStyleCard(styleCard: GroundingStyleCard | null | undefined): string[] {
  if (!styleCard) {
    return [];
  }

  const factualEntries = new Set(
    getGroundingStyleCardFacts(styleCard).map((entry) => entry.toLowerCase()),
  );

  return dedupeLines(styleCard.contextAnchors || []).filter(
    (entry) =>
      !factualEntries.has(entry.toLowerCase()) &&
      !looksLikeProfileContextLeak(entry),
  );
}

function looksLikeAutobiographicalClaim(value: string): boolean {
  return (
    /\b(?:i|we|my|our|me|us)\b/i.test(value) ||
    /\buser\s+(?:is|was|has|had|built|builds|uses|used|launched|launching|wants|wanted)\b/i.test(
      value,
    )
  );
}

export function buildGroundingPacket(args: {
  styleCard: GroundingStyleCard | null;
  activeConstraints: string[];
  extractedFacts?: string[] | null;
}): GroundingPacket {
  const voiceContextHints = getVoiceContextHintsFromStyleCard(args.styleCard);
  const rawDurableFacts = dedupeLines([
    ...getGroundingStyleCardFacts(args.styleCard),
    ...extractConstraintGrounding(args.activeConstraints),
  ]);
  const rawTurnGrounding = dedupeLines([
    ...extractConstraintGrounding(args.activeConstraints),
    ...((args.extractedFacts || []).filter(Boolean)),
  ]);
  const factLedger = args.styleCard?.factLedger;
  const forbiddenClaims = dedupeLines([
    ...(factLedger?.forbiddenClaims || []),
    ...deriveForbiddenClaimsFromCorrectionLocks(args.activeConstraints),
    "Do not invent first-person usage, testing, rollout history, metrics, timelines, or named places that are not explicitly grounded.",
  ]);
  const durableFacts = filterConflictingGroundingStrings(rawDurableFacts, forbiddenClaims);
  const turnGrounding = filterConflictingGroundingStrings(rawTurnGrounding, forbiddenClaims);
  const allowedFirstPersonClaims = filterConflictingGroundingStrings(
    [
      ...(factLedger?.allowedFirstPersonClaims || []),
      ...durableFacts.filter(looksLikeAutobiographicalClaim),
      ...turnGrounding.filter(looksLikeAutobiographicalClaim),
    ],
    forbiddenClaims,
  );
  const sourceMaterials = sanitizeGroundingSourceMaterials(
    (factLedger?.sourceMaterials || []).map((entry) => ({
      type: entry.type,
      title: normalizeLine(entry.title),
      claims: dedupeLines(entry.claims || []),
      snippets: dedupeLines(entry.snippets || []),
    })),
    forbiddenClaims,
  );

  return {
    durableFacts,
    turnGrounding,
    allowedFirstPersonClaims,
    allowedNumbers: dedupeLines([
      ...(factLedger?.allowedNumbers || []),
      ...collectNumberTokens([...durableFacts, ...turnGrounding]),
    ]),
    forbiddenClaims,
    unknowns: [],
    sourceMaterials,
    voiceContextHints,
    factualAuthority: collectGroundingFactualAuthority({
      durableFacts,
      turnGrounding,
      allowedFirstPersonClaims,
      sourceMaterials,
    }),
  };
}

export function addGroundingUnknowns(
  packet: GroundingPacket,
  slots: DraftContextSlots,
  userMessageLength?: number,
): GroundingPacket {
  const unknowns = [...packet.unknowns];

  // Only flag unknowns when the user message is very short and genuinely
  // lacks detail. Longer messages with any context signal should be draftable
  // without triggering safe-framework mode.
  const isVeryThinContext = (userMessageLength ?? 100) < 40;

  if (
    isVeryThinContext &&
    (slots.domainHint === "product" || slots.domainHint === "career") &&
    !slots.behaviorKnown
  ) {
    unknowns.push(
      slots.domainHint === "career"
        ? "missing lived behavior detail"
        : "missing product behavior detail",
    );
  }

  if (
    isVeryThinContext &&
    (slots.domainHint === "product" || slots.domainHint === "career") &&
    !slots.stakesKnown
  ) {
    unknowns.push(
      slots.domainHint === "career"
        ? "missing stakes or outcome detail"
        : "missing product stakes or payoff detail",
    );
  }

  if (slots.entityNeedsDefinition && slots.namedEntity) {
    unknowns.push(`missing definition for ${slots.namedEntity}`);
  }

  if (slots.ambiguousReferenceNeedsClarification && slots.ambiguousReference) {
    unknowns.push(`ambiguous reference: ${slots.ambiguousReference}`);
  }

  return {
    ...packet,
    unknowns: dedupeLines(unknowns),
  };
}

export function hasAutobiographicalGrounding(packet: GroundingPacket): boolean {
  return packet.allowedFirstPersonClaims.length > 0;
}

export function buildSafeFrameworkConstraint(packet: GroundingPacket): string {
  const unknownBlock =
    packet.unknowns.length > 0
      ? ` Missing context: ${packet.unknowns.join(" | ")}.`
      : "";

  return `Safe framework mode: do not write first-person anecdotes, personal results, usage claims, or scene details that are not explicitly grounded. If facts are missing, write a framework, opinion, or principle-first post instead.${unknownBlock}`;
}
