const MAX_QUERIES = 3;
const MAX_RESULTS_PER_QUERY = 3;
const MAX_SNIPPET_LENGTH = 500;
const MAX_COMPILED_LENGTH = 4_000;
const SEARCH_TIMEOUT_MS = 5_000;
const TRUNCATION_SUFFIX = "...[Content Truncated]";

interface SearchSnippet {
  title: string;
  url: string;
  snippet: string;
}

interface TavilyResult {
  title?: string;
  url?: string;
  content?: string;
}

interface ExaResult {
  title?: string;
  url?: string;
  text?: string;
}

function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function truncateSnippet(value: string, maxLength = MAX_SNIPPET_LENGTH): string {
  const normalized = collapseWhitespace(value);
  if (!normalized) {
    return "";
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function sanitizeMarkdownLine(value: string): string {
  return collapseWhitespace(value)
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ");
}

function htmlDecode(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#x3D;/gi, "=")
    .replace(/&#x26;/gi, "&")
    .replace(/&#(\d+);/g, (_, code) => {
      const parsed = Number.parseInt(code, 10);
      return Number.isFinite(parsed) ? String.fromCharCode(parsed) : "";
    });
}

function stripHtmlTags(value: string): string {
  return htmlDecode(value.replace(/<[^>]+>/g, " "));
}

function normalizeResult(result: Partial<SearchSnippet> | null | undefined): SearchSnippet | null {
  const snippet = truncateSnippet(result?.snippet || "");
  const title = sanitizeMarkdownLine(result?.title || "");
  const url = collapseWhitespace(result?.url || "");

  if (!snippet || !title || !url) {
    return null;
  }

  return {
    title,
    url,
    snippet,
  };
}

function dedupeResults(results: SearchSnippet[]): SearchSnippet[] {
  const seen = new Set<string>();
  const deduped: SearchSnippet[] = [];

  for (const result of results) {
    const key = `${result.title.toLowerCase()}|${result.url.toLowerCase()}|${result.snippet.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(result);

    if (deduped.length >= MAX_RESULTS_PER_QUERY) {
      break;
    }
  }

  return deduped;
}

export function normalizeWebSearchQueries(queries: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const query of queries) {
    const next = collapseWhitespace(query);
    if (!next) {
      continue;
    }

    const key = next.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(next);

    if (normalized.length >= MAX_QUERIES) {
      break;
    }
  }

  return normalized;
}

export function buildWebSearchQueryKey(queries: string[]): string {
  return normalizeWebSearchQueries(queries)
    .slice()
    .sort((left, right) => left.localeCompare(right, "en", { sensitivity: "base" }))
    .join("||");
}

function looksLikeNewsQuery(query: string): boolean {
  return /\b(latest|breaking|today|recent|just announced|new update|news|this week|this month|current)\b/i.test(
    query,
  );
}

async function fetchJson<T>(input: string, init: RequestInit): Promise<T | null> {
  const response = await fetch(input, init);
  if (!response.ok) {
    return null;
  }

  return (await response.json()) as T;
}

async function searchWithTavily(
  query: string,
  signal: AbortSignal,
): Promise<SearchSnippet[]> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) {
    return [];
  }

  const data = await fetchJson<{ results?: TavilyResult[] }>(
    "https://api.tavily.com/search",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        topic: looksLikeNewsQuery(query) ? "news" : "general",
        search_depth: "basic",
        max_results: MAX_RESULTS_PER_QUERY,
        include_answer: false,
        include_raw_content: false,
      }),
      signal,
    },
  );

  return dedupeResults(
    (data?.results || [])
      .map((result) =>
        normalizeResult({
          title: result.title || result.url || "Source",
          url: result.url,
          snippet: result.content || "",
        }),
      )
      .filter((result): result is SearchSnippet => Boolean(result)),
  );
}

async function searchWithExa(
  query: string,
  signal: AbortSignal,
): Promise<SearchSnippet[]> {
  const apiKey = process.env.EXA_API_KEY?.trim();
  if (!apiKey) {
    return [];
  }

  const data = await fetchJson<{ results?: ExaResult[] }>(
    "https://api.exa.ai/search",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        query,
        text: true,
        numResults: MAX_RESULTS_PER_QUERY,
      }),
      signal,
    },
  );

  return dedupeResults(
    (data?.results || [])
      .map((result) =>
        normalizeResult({
          title: result.title || result.url || "Source",
          url: result.url,
          snippet: result.text || "",
        }),
      )
      .filter((result): result is SearchSnippet => Boolean(result)),
  );
}

function resolveDuckDuckGoHref(rawHref: string): string {
  const href = htmlDecode(rawHref.trim());
  if (!href) {
    return "";
  }

  try {
    const url = new URL(href, "https://duckduckgo.com");
    const redirected = url.searchParams.get("uddg");
    return redirected ? decodeURIComponent(redirected) : url.toString();
  } catch {
    return href;
  }
}

function parseDuckDuckGoResults(html: string): SearchSnippet[] {
  const results: SearchSnippet[] = [];
  const anchorRegex =
    /<a[^>]+class="[^"]*\bresult__a\b[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null = null;

  while ((match = anchorRegex.exec(html)) && results.length < MAX_RESULTS_PER_QUERY) {
    const url = resolveDuckDuckGoHref(match[1] || "");
    const title = sanitizeMarkdownLine(stripHtmlTags(match[2] || ""));
    const segment = html.slice(match.index, anchorRegex.lastIndex + 2_000);
    const snippetMatch = segment.match(
      /<(?:a|div)[^>]+class="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div)>/i,
    );
    const snippet = truncateSnippet(stripHtmlTags(snippetMatch?.[1] || ""));
    const normalized = normalizeResult({ title, url, snippet });

    if (normalized) {
      results.push(normalized);
    }
  }

  return dedupeResults(results);
}

async function searchWithDuckDuckGo(
  query: string,
  signal: AbortSignal,
): Promise<SearchSnippet[]> {
  const response = await fetch(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    {
      headers: {
        Accept: "text/html,application/xhtml+xml",
      },
      signal,
    },
  );

  if (!response.ok) {
    return [];
  }

  const html = await response.text();
  return parseDuckDuckGoResults(html);
}

function compileResults(resultsByQuery: Array<{ query: string; results: SearchSnippet[] }>): string {
  const sections = resultsByQuery
    .filter((entry) => entry.results.length > 0)
    .map((entry) => {
      const lines = [`## Results for [${sanitizeMarkdownLine(entry.query)}]`];

      for (const result of entry.results.slice(0, MAX_RESULTS_PER_QUERY)) {
        const title = sanitizeMarkdownLine(result.title);
        const url = sanitizeMarkdownLine(result.url);
        const snippet = sanitizeMarkdownLine(result.snippet);
        lines.push(`- [${title}](${url}): ${snippet}`);
      }

      return lines.join("\n");
    });

  return sections.join("\n\n");
}

function enforceCompiledLengthLimit(value: string): string {
  if (value.length <= MAX_COMPILED_LENGTH) {
    return value;
  }

  const maxBaseLength = Math.max(0, MAX_COMPILED_LENGTH - TRUNCATION_SUFFIX.length);
  return `${value.slice(0, maxBaseLength).trimEnd()}${TRUNCATION_SUFFIX}`;
}

export async function executeWebSearch(queries: string[]): Promise<string> {
  const normalizedQueries = normalizeWebSearchQueries(queries);
  if (normalizedQueries.length === 0) {
    return "";
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

  try {
    const provider =
      process.env.TAVILY_API_KEY?.trim()
        ? searchWithTavily
        : process.env.EXA_API_KEY?.trim()
          ? searchWithExa
          : searchWithDuckDuckGo;

    const settled = await Promise.allSettled(
      normalizedQueries.map(async (query) => ({
        query,
        results: await provider(query, controller.signal),
      })),
    );

    const resultsByQuery = settled
      .filter(
        (result): result is PromiseFulfilledResult<{ query: string; results: SearchSnippet[] }> =>
          result.status === "fulfilled",
      )
      .map((result) => result.value)
      .filter((entry) => entry.results.length > 0);

    if (resultsByQuery.length === 0) {
      return "";
    }

    return enforceCompiledLengthLimit(compileResults(resultsByQuery));
  } catch {
    return "";
  } finally {
    clearTimeout(timeoutId);
  }
}
