import { z } from "zod";

export const SourceMaterialTypeSchema = z.enum([
  "story",
  "playbook",
  "framework",
  "case_study",
]);

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

export type SourceMaterialType = z.infer<typeof SourceMaterialTypeSchema>;

export function normalizeLine(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function dedupeList(values: string[]): string[] {
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

export function normalizeTag(value: string): string {
  return normalizeLine(value).toLowerCase();
}

export function tokenize(value: string): string[] {
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

export function looksAutobiographical(value: string): boolean {
  return /\b(?:i|we|my|our|me|us)\b/i.test(value);
}
