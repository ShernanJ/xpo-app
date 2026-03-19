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
