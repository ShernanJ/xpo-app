function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function truncatePhrase(value: string, max = 44): string {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= max) {
    return normalized;
  }

  const slice = normalized.slice(0, max);
  const cutoff = slice.lastIndexOf(" ");
  return `${slice.slice(0, cutoff > 16 ? cutoff : max).trimEnd()}...`;
}

function extractHashtag(text: string): string | null {
  const match = text.match(/#[a-z0-9_]+/i);
  return match?.[0]?.toLowerCase() || null;
}

function extractLiteralSnippet(text: string): string {
  const normalized = normalizeWhitespace(text.replace(/https?:\/\/\S+/g, ""));
  const withoutTrailingHashtags = normalizeWhitespace(normalized.replace(/\s+#[a-z0-9_]+/gi, ""));
  const clause = withoutTrailingHashtags.split(/[.?!]/)[0]?.trim() || withoutTrailingHashtags;
  return truncatePhrase(clause || normalized);
}

function extractRecruitingAnchor(text: string): string | null {
  const normalized = normalizeWhitespace(text);
  const quotedMatch = normalized.match(/["“]([^"”]{4,80})["”]/);
  if (quotedMatch?.[1]) {
    return truncatePhrase(quotedMatch[1], 42);
  }

  const strongMatch = normalized.match(
    /\b(work insanely hard|reply or dm me|dm me|hiring soon|finding undiscovered talent|meeting people)\b/i,
  );
  if (strongMatch?.[1]) {
    return truncatePhrase(strongMatch[1], 42);
  }

  return null;
}

export function buildCasualReplyText(args: {
  sourceText: string;
  variant: "relatable" | "pile_on" | "deadpan";
  concise?: boolean;
  anchorText?: string | null;
}) {
  const snippet = extractLiteralSnippet(args.anchorText || args.sourceText);
  const hashtag = extractHashtag(args.sourceText);

  switch (args.variant) {
    case "pile_on":
      return args.concise
        ? `${snippet}${hashtag ? ` + ${hashtag}` : ""} is a complete sentence`
        : `${snippet}${hashtag ? ` + ${hashtag}` : ""} is a very complete sentence honestly.`;
    case "deadpan":
      return args.concise
        ? `no notes. "${snippet}" feels correct`
        : `no notes. "${snippet}" feels like the correct call.`;
    case "relatable":
    default:
      return args.concise
        ? `honestly "${snippet}" is so real`
        : `honestly the "${snippet}" energy is so real.`;
  }
}

export function buildRecruitingReplyText(args: {
  sourceText: string;
  variant: "relatable" | "pile_on" | "deadpan";
  concise?: boolean;
  anchorText?: string | null;
}) {
  const anchor = extractRecruitingAnchor(args.anchorText || args.sourceText);

  switch (args.variant) {
    case "pile_on":
      return anchor
        ? args.concise
          ? `the "${anchor}" line is doing the filtering already`
          : `the "${anchor}" line is doing most of the filtering already.`
        : args.concise
          ? "this is a very specific ambition filter"
          : "this reads like a very specific ambition filter.";
    case "deadpan":
      return anchor
        ? args.concise
          ? `the "${anchor}" qualifier narrowed the funnel fast`
          : `the "${anchor}" qualifier narrowed the funnel pretty fast.`
        : args.concise
          ? "the hiring pitch is screening people on its own"
          : "the hiring pitch is screening people on its own already.";
    case "relatable":
    default:
      return anchor
        ? args.concise
          ? `the "${anchor}" part is a serious filter`
          : `the "${anchor}" part is a serious filter honestly.`
        : args.concise
          ? "this is basically ambitious-people filter copy"
          : "this is basically ambitious-people filter copy.";
  }
}
