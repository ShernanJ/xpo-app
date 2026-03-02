import "dotenv/config";
import { classifyIntent } from "./classifier";
import { generateCoachReply } from "./coach";
import { generatePlan } from "./planner";
import { generateIdeasMenu } from "./ideator";
import { generateDrafts } from "./writer";
import { critiqueDrafts } from "./critic";

async function runTest() {
  console.log("=== Testing Decoupled UI Agents ===");

  // 1. Test Classifier
  console.log("\\n[1/6] Testing Classifier...");
  const intent = await classifyIntent("I need to write about my recent launch of Stanley X", "User is a founder.");
  console.log("-> Intent Output:", intent);

  // 2. Test Coach
  console.log("\\n[2/6] Testing Coach...");
  const coach = await generateCoachReply("I want to talk about growth but I don't know what to specify.", "None", "Growth tactics");
  console.log("-> Coach Output:", coach);

  // 3. Test Planner
  console.log("\\n[3/6] Testing Planner...");
  const plan = await generatePlan("I want to tweet about how hard it was to migrate JSONL to Postgres yesterday.", "Database migration", ["No emojis"]);
  console.log("-> Planner Output:", plan?.objective ? "Success (Plan generated)" : "Failed");

  // 4. Test Ideator
  console.log("\\n[4/6] Testing Ideator...");
  const ideas = await generateIdeasMenu("Migrating flat files to a database", "Database migration", "User struggled with Prisma yesterday");
  console.log("-> Ideator Output:", ideas?.angles?.length ? `Success (${ideas.angles.length} angles)` : "Failed");

  if (!plan) {
    throw new Error("Plan failed, skipping Writer and Critic tests.");
  }

  // 5. Test Writer
  console.log("\\n[5/6] Testing Writer...");
  const writer = await generateDrafts(
    plan,
    null, // No style card for simple test
    ["Yesterday I moved 67 records from jsonl to postgres", "I used the neon adapter"],
    ["No emojis"]
  );
  console.log("-> Writer Output:", writer?.drafts?.length ? `Success (${writer.drafts.length} drafts)` : "Failed");

  if (!writer) {
    throw new Error("Writer failed, skipping Critic test.");
  }

  // 6. Test Critic
  console.log("\\n[6/6] Testing Critic...");
  const critic = await critiqueDrafts(writer, ["No emojis", "No buzzwords"]);
  console.log("-> Critic Output:", critic?.approved ? "Approved" : "Rejected or Failed");

  console.log("\\n=== All Tests Complete ===");
}

runTest().catch(console.error);
