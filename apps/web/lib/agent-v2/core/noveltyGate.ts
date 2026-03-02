export interface NoveltyEvaluation {
  isNovel: boolean;
  maxSimilarity: number;
  reason: string | null;
}

/**
 * Standardizes text by converting to lowercase and removing punctuation,
 * extra spaces, and special characters to ensure fair comparisons.
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Generates N-grams (shingles) from a normalized string.
 * Example for n=4: "the quick brown fox" -> Set(["the quick brown fox"])
 */
function getNGrams(text: string, n: number): Set<string> {
  const words = text.split(" ");
  const nGrams = new Set<string>();

  if (words.length < n) {
    // If the text is shorter than N words, the whole text is one sequence
    if (words.length > 0) {
      nGrams.add(words.join(" "));
    }
    return nGrams;
  }

  for (let i = 0; i <= words.length - n; i++) {
    nGrams.add(words.slice(i, i + n).join(" "));
  }

  return nGrams;
}

/**
 * Computes the Jaccard similarity index between two sets of n-grams.
 * Returns a value between 0.0 (no overlap) and 1.0 (exact match).
 */
function computeJaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersectionSize = 0;
  for (const item of setA) {
    if (setB.has(item)) {
      intersectionSize++;
    }
  }

  const unionSize = setA.size + setB.size - intersectionSize;
  return intersectionSize / unionSize;
}

/**
 * Stage 1 Novelty Gate: Deterministic N-gram matching.
 * Compares a newly generated draft against an array of historical posts.
 * Rejects the draft if 4-gram overlap is >= 80%.
 */
export function checkDeterministicNovelty(
  draft: string,
  historicalPosts: string[]
): NoveltyEvaluation {
  const SIMILARITY_THRESHOLD = 0.80;
  const N_GRAM_SIZE = 4;

  const normalizedDraft = normalizeText(draft);
  const draftNGrams = getNGrams(normalizedDraft, N_GRAM_SIZE);

  if (draftNGrams.size === 0) {
    return { isNovel: true, maxSimilarity: 0, reason: null };
  }

  let maxSimilarity = 0;

  for (const post of historicalPosts) {
    const normalizedPost = normalizeText(post);
    const postNGrams = getNGrams(normalizedPost, N_GRAM_SIZE);

    const similarity = computeJaccardSimilarity(draftNGrams, postNGrams);

    if (similarity > maxSimilarity) {
      maxSimilarity = similarity;
    }

    if (similarity >= SIMILARITY_THRESHOLD) {
      return {
        isNovel: false,
        maxSimilarity: similarity,
        reason: `Draft shares ${Math.round(similarity * 100)}% phrase structure with a past post.`,
      };
    }
  }

  return {
    isNovel: true,
    maxSimilarity,
    reason: null,
  };
}

/**
 * Semantic gate placeholder.
 * If we were to implement Stage 2 (Embeddings/Cosine Similarity), it would live here.
 * For now, MVP just runs deterministic checks.
 */
export async function checkSemanticNovelty(
  _draft: string,
  _historicalPosts: string[]
): Promise<NoveltyEvaluation> {
  // Pass-through for MVP until text-embedding-3-small is wired up
  return { isNovel: true, maxSimilarity: 0, reason: null };
}
