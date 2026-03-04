import "dotenv/config";
import { generateStyleProfile, saveStyleProfile, StyleCardSchema } from "./styleProfile";

// Mock the generateObject call instead of spending API credits for a test,
// or we can test the real thing if we provide a dummy userId that actually has posts.
// Since we don't know if 'test-user-id' has posts, we'll write a simple test wrapper.
async function runTest() {
  console.log("Testing style profile generator...");
  const dummyUserId = "test-user-id";

  // Create a dummy result to test the DB save separately from the LLM call
  const dummyCard = {
    sentenceOpenings: ["Look,", "Here's the thing:"],
    sentenceClosers: ["Think about it.", "Right?"],
    pacing: "Short and punchy.",
    emojiPatterns: ["🚀 when talking about growth"],
    slangAndVocabulary: ["10x", "ship it"],
    formattingRules: ["no uppercase at start of sentence"],
    customGuidelines: [],
    contextAnchors: [],
  };

  console.log("Saving dummy profile to database...");
  const saved = await saveStyleProfile(dummyUserId, "default", dummyCard);
  console.log("Saved successfully:", saved.id);

  // We could test the real LLM call here, but let's just make sure it compiles
  console.log("Type checking StyleCardSchema parse...");
  StyleCardSchema.parse(dummyCard);
  console.log("Schema is valid.");
}

runTest()
  .then(() => console.log("Test complete!"))
  .catch(console.error);
