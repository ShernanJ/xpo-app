import { checkDeterministicNovelty } from "./noveltyGate";

function runTest() {
  console.log("=== Testing Novelty Gate (N-Gram Shingling) ===");

  const historicalPosts = [
    "I launched a new feature today and it felt amazing to finally ship it.",
    "The biggest lesson I learned this year is that consistency beats intensity.",
    "Database migrations are always harder than they look. Always."
  ];

  console.log("Historical Posts Loaded:", historicalPosts.length, "\\n");

  // Test 1: Completely Novel Draft
  console.log("[Test 1] Completely Novel Draft");
  const novelDraft = "Next.js routing is pretty simple once you understand the app directory structure.";
  const res1 = checkDeterministicNovelty(novelDraft, historicalPosts);
  console.log(`Input: "${novelDraft}"`);
  console.log(`Result: ${res1.isNovel ? "✅ NOVEL" : "❌ REJECTED"} (Max Similarity: ${res1.maxSimilarity.toFixed(2)})\n`);

  // Test 2: Exact Duplicate
  console.log("[Test 2] Exact Duplicate");
  const exactDraft = "The biggest lesson I learned this year is that consistency beats intensity.";
  const res2 = checkDeterministicNovelty(exactDraft, historicalPosts);
  console.log(`Input: "${exactDraft}"`);
  console.log(`Result: ${res2.isNovel ? "✅ NOVEL" : "❌ REJECTED - " + res2.reason} (Max Similarity: ${res2.maxSimilarity.toFixed(2)})\n`);

  // Test 3: High overlap (>= 80% similarity threshold)
  // This draft remixes the history but keeps the exact phrase structure intact for 4-grams
  console.log("[Test 3] High Overlap (Plagiarized Structure)");
  const highOverlapDraft = "The biggest lesson I learned this year is that consistency always beats intensity.";
  const res3 = checkDeterministicNovelty(highOverlapDraft, historicalPosts);
  console.log(`Input: "${highOverlapDraft}"`);
  console.log(`Result: ${res3.isNovel ? "✅ NOVEL" : "❌ REJECTED - " + res3.reason} (Max Similarity: ${res3.maxSimilarity.toFixed(2)})\n`);

  // Test 4: Same keywords, different structure (should pass)
  console.log("[Test 4] Low Overlap (Same words, different order)");
  const diffStructureDraft = "Intensity is great, but consistency is the biggest lesson I learned beating it this year.";
  const res4 = checkDeterministicNovelty(diffStructureDraft, historicalPosts);
  console.log(`Input: "${diffStructureDraft}"`);
  console.log(`Result: ${res4.isNovel ? "✅ NOVEL" : "❌ REJECTED"} (Max Similarity: ${res4.maxSimilarity.toFixed(2)})\n`);

}

runTest();
