export type RenderContractMode = "long_form_post" | "short_post";
export type DraftCtaMode = "A" | "B" | "C";

export interface DraftValidationMetrics {
  wordCount: number;
  sectionCount: number;
  blankLineSeparators: number;
  proofBullets: number;
  mechanismSteps: number;
  maxLineLen: number;
  ngramOverlap5: number;
  metricReuseCount: number;
  bannedOpenerHit: boolean;
}

export interface DraftValidationResult {
  pass: boolean;
  errors: string[];
  metrics: DraftValidationMetrics;
}

interface ValidateDraftParams {
  draft: string;
  mode: RenderContractMode;
  exemplarText: string;
  bannedOpeners?: string[];
  metricTarget?: {
    min?: number;
    max?: number;
  };
  evidenceMetrics?: string[];
  ctaMode?: DraftCtaMode;
}

const DEFAULT_BANNED_OPENERS = [
  "i used to think",
  "here's the thing",
  "hot take",
  "unpopular opinion",
  "stop scrolling",
  "most people don't",
];

function normalizeWhitespace(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

function tokenizeWords(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9$%]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function countFiveGramOverlap(source: string, reference: string): number {
  const sourceTokens = tokenizeWords(source);
  const referenceTokens = tokenizeWords(reference);

  if (sourceTokens.length < 5 || referenceTokens.length < 5) {
    return 0;
  }

  const referenceNgrams = new Set<string>();
  for (let index = 0; index <= referenceTokens.length - 5; index += 1) {
    referenceNgrams.add(referenceTokens.slice(index, index + 5).join(" "));
  }

  let overlap = 0;
  const seen = new Set<string>();
  for (let index = 0; index <= sourceTokens.length - 5; index += 1) {
    const ngram = sourceTokens.slice(index, index + 5).join(" ");
    if (referenceNgrams.has(ngram) && !seen.has(ngram)) {
      seen.add(ngram);
      overlap += 1;
    }
  }

  return overlap;
}

function getSections(text: string): string[] {
  return text
    .split(/\n[ \t]*\n/)
    .map((section) => section.trim())
    .filter(Boolean);
}

function countBlankLineSeparators(text: string): number {
  return text.match(/\n[ \t]*\n/g)?.length ?? 0;
}

function countMetricReuse(draft: string, evidenceMetrics: string[]): number {
  const loweredDraft = draft.toLowerCase();
  const numericTokens = new Set<string>();

  for (const metric of evidenceMetrics) {
    for (const token of metric.match(/[$<]?\d[\d,.]*(?:[kmb]|%|x)?(?:\/[a-z]+)?/gi) ?? []) {
      numericTokens.add(token.toLowerCase());
    }
  }

  if (numericTokens.size === 0) {
    return 0;
  }

  let count = 0;
  for (const token of numericTokens) {
    if (loweredDraft.includes(token)) {
      count += 1;
    }
  }

  return count;
}

function buildCtaRegex(mode: DraftCtaMode): RegExp {
  switch (mode) {
    case "A":
      return /^reply "[^"\n]+" and i(?:'|’)ll send .+\.$/i;
    case "C":
      return /^comment your .+ and i(?:'|’)ll reply with the first 3 moves\.$/i;
    case "B":
    default:
      return /^follow [—-] i(?:'|’)m posting .+ for the next \d+ days\.$/i;
  }
}

function getLineLengths(lines: string[]): number {
  return lines.reduce((max, line) => Math.max(max, line.length), 0);
}

function hasBannedOpener(text: string, bannedOpeners: string[]): boolean {
  const openerWindow = text.slice(0, 160).toLowerCase();
  return bannedOpeners.some((opener) => openerWindow.includes(opener.toLowerCase()));
}

function validateLongFormDraft(
  normalizedDraft: string,
  exemplarText: string,
  bannedOpeners: string[],
  metricTarget: { min?: number; max?: number },
  evidenceMetrics: string[],
  ctaMode: DraftCtaMode,
): DraftValidationResult {
  const sections = getSections(normalizedDraft);
  const lines = normalizedDraft.split("\n");
  const blankLineSeparators = countBlankLineSeparators(normalizedDraft);
  const wordCount = normalizedDraft.split(/\s+/).filter(Boolean).length;
  const maxLineLen = getLineLengths(lines);
  const ngramOverlap5 = countFiveGramOverlap(normalizedDraft, exemplarText);
  const metricReuseCount = countMetricReuse(normalizedDraft, evidenceMetrics);
  const bannedOpenerHit = hasBannedOpener(normalizedDraft, bannedOpeners);
  const errors: string[] = [];

  const proofSection = sections[1] ?? "";
  const mechanismSection = sections[2] ?? "";
  const thesisSection = sections[0] ?? "";
  const ctaSection = sections[3] ?? "";

  const proofLines = proofSection ? proofSection.split("\n").map((line) => line.trim()) : [];
  const mechanismLines = mechanismSection
    ? mechanismSection.split("\n").map((line) => line.trim())
    : [];
  const thesisLines = thesisSection
    ? thesisSection.split("\n").map((line) => line.trim())
    : [];
  const ctaLines = ctaSection ? ctaSection.split("\n").map((line) => line.trim()) : [];

  const proofBullets = proofLines.slice(1).filter((line) => /^- /.test(line)).length;
  const mechanismSteps = mechanismLines
    .slice(1)
    .filter((line) => /^(1|2|3)\) /.test(line)).length;

  if (sections.length !== 4) {
    errors.push("E_SECTION_COUNT");
  }

  const spacingValid =
    blankLineSeparators === 3 && !/\n[ \t]*\n[ \t]*\n/.test(normalizedDraft);
  if (!spacingValid) {
    errors.push("E_SPACING");
  }

  if (
    sections.length >= 1 &&
    !(thesisLines[0] === "THESIS:" && thesisLines.length >= 2 && thesisLines.length <= 3)
  ) {
    errors.push("E_SECTION_COUNT");
  }

  if (
    sections.length >= 2 &&
    !(proofLines[0] === "PROOF:" && proofBullets === 3 && proofLines.length === 4)
  ) {
    errors.push("E_PROOF_BULLETS");
  }

  if (
    sections.length >= 3 &&
    !(
      mechanismLines[0] === "MECHANISM:" &&
      mechanismSteps === 3 &&
      mechanismLines.length === 4
    )
  ) {
    errors.push("E_MECHANISM_STEPS");
  }

  if (wordCount < 90) {
    errors.push("E_TOO_SHORT");
  }
  if (wordCount > 190) {
    errors.push("E_TOO_LONG");
  }
  if (maxLineLen > 92) {
    errors.push("E_LINE_TOO_LONG");
  }
  if (ngramOverlap5 > 0) {
    errors.push("E_NGRAM_OVERLAP_5");
  }
  if (bannedOpenerHit) {
    errors.push("E_BANNED_OPENER");
  }

  const effectiveMetricTarget =
    evidenceMetrics.length > 0
      ? { min: metricTarget.min ?? 3, max: metricTarget.max ?? 4 }
      : { min: undefined, max: metricTarget.max ?? 2 };

  if (
    typeof effectiveMetricTarget.min === "number" &&
    metricReuseCount < effectiveMetricTarget.min
  ) {
    errors.push("E_TOO_FEW_METRICS");
  }
  if (
    typeof effectiveMetricTarget.max === "number" &&
    metricReuseCount > effectiveMetricTarget.max
  ) {
    errors.push("E_TOO_MANY_METRICS");
  }

  const thesisContent = thesisLines.slice(1);
  if (thesisContent.some((line) => line.includes("?"))) {
    errors.push("E_THESIS_QUESTION");
  }

  const ctaRegex = buildCtaRegex(ctaMode);
  const ctaBodyLines = ctaLines.slice(1);
  const finalLine = ctaBodyLines[ctaBodyLines.length - 1] ?? "";

  const ctaShapeValid =
    ctaLines[0] === "CTA:" &&
    ctaBodyLines.length >= 2 &&
    ctaBodyLines.length <= 4 &&
    ctaRegex.test(finalLine);

  if (!ctaShapeValid) {
    errors.push("E_INVALID_CTA");
  }

  return {
    pass: errors.length === 0,
    errors: Array.from(new Set(errors)),
    metrics: {
      wordCount,
      sectionCount: sections.length,
      blankLineSeparators,
      proofBullets,
      mechanismSteps,
      maxLineLen,
      ngramOverlap5,
      metricReuseCount,
      bannedOpenerHit,
    },
  };
}

export function validateDraft(params: ValidateDraftParams): DraftValidationResult {
  const normalizedDraft = normalizeWhitespace(params.draft);
  const bannedOpeners =
    params.bannedOpeners && params.bannedOpeners.length > 0
      ? params.bannedOpeners
      : DEFAULT_BANNED_OPENERS;

  if (params.mode === "short_post") {
    return {
      pass: normalizedDraft.length > 0,
      errors: normalizedDraft.length > 0 ? [] : ["E_TOO_SHORT"],
      metrics: {
        wordCount: normalizedDraft.split(/\s+/).filter(Boolean).length,
        sectionCount: 1,
        blankLineSeparators: 0,
        proofBullets: 0,
        mechanismSteps: 0,
        maxLineLen: getLineLengths(normalizedDraft.split("\n")),
        ngramOverlap5: countFiveGramOverlap(normalizedDraft, params.exemplarText),
        metricReuseCount: countMetricReuse(normalizedDraft, params.evidenceMetrics ?? []),
        bannedOpenerHit: hasBannedOpener(normalizedDraft, bannedOpeners),
      },
    };
  }

  return validateLongFormDraft(
    normalizedDraft,
    params.exemplarText,
    bannedOpeners,
    params.metricTarget ?? {},
    params.evidenceMetrics ?? [],
    params.ctaMode ?? "B",
  );
}
