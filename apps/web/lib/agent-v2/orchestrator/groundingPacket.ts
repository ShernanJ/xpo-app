import type { DraftContextSlots } from "./draftContextSlots.ts";

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

function getDurableFactsFromStyleCard(styleCard: GroundingStyleCard | null | undefined): string[] {
  if (!styleCard) {
    return [];
  }

  return dedupeLines([
    ...(styleCard.factLedger?.durableFacts || []),
    ...(styleCard.contextAnchors || []),
  ]);
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
  const durableFacts = dedupeLines([
    ...getDurableFactsFromStyleCard(args.styleCard),
    ...extractConstraintGrounding(args.activeConstraints),
  ]);
  const turnGrounding = dedupeLines([
    ...extractConstraintGrounding(args.activeConstraints),
    ...((args.extractedFacts || []).filter(Boolean)),
  ]);
  const factLedger = args.styleCard?.factLedger;
  const allowedFirstPersonClaims = dedupeLines([
    ...(factLedger?.allowedFirstPersonClaims || []),
    ...durableFacts.filter(looksLikeAutobiographicalClaim),
    ...turnGrounding.filter(looksLikeAutobiographicalClaim),
  ]);
  const forbiddenClaims = dedupeLines([
    ...(factLedger?.forbiddenClaims || []),
    "Do not invent first-person usage, testing, rollout history, metrics, timelines, or named places that are not explicitly grounded.",
  ]);
  const sourceMaterials = (factLedger?.sourceMaterials || []).map((entry) => ({
    type: entry.type,
    title: normalizeLine(entry.title),
    claims: dedupeLines(entry.claims || []),
    snippets: dedupeLines(entry.snippets || []),
  }));

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
  };
}

export function addGroundingUnknowns(
  packet: GroundingPacket,
  slots: DraftContextSlots,
): GroundingPacket {
  const unknowns = [...packet.unknowns];

  if (
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
