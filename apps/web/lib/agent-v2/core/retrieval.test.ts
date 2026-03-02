import "dotenv/config";
import { retrieveAnchors } from "./retrieval";

async function runTest() {
  console.log("Testing retrieval module...");

  // We need a test user ID. Let's just use a dummy one for now, 
  // or if there are no posts, we'll just see empty results which is fine.
  const dummyUserId = "test-user-id";
  const focusTopic = "learning nextjs and react";

  console.log(`Searching for topic: "${focusTopic}"`);

  const result = await retrieveAnchors(dummyUserId, focusTopic);

  console.log("Results:");
  console.log(JSON.stringify(result, null, 2));
}

runTest().catch(console.error);
