import { manageConversationTurn } from "./conversationManager";
import { prisma } from "../../db";
import { Prisma } from "../../generated/prisma/client";
import { randomUUID } from "crypto";

async function runTest() {
  console.log("=== Testing Orchestrator V2 ===");

  const testUserId = "test-user-v2";
  const testRunId = `or_test_${randomUUID()}`;

  // Ensure user and run exist for foreign key constraints
  console.log("\\n[Setup] Creating dummy user and run...");
  await prisma.user.upsert({
    where: { id: testUserId },
    update: {},
    create: { id: testUserId, handle: "tester" }
  });
  await prisma.onboardingRun.create({
    data: {
      id: testRunId,
      userId: testUserId,
      input: {} as unknown as Prisma.InputJsonObject,
      result: {} as unknown as Prisma.InputJsonObject,
    }
  });
  await prisma.conversationMemory.create({
    data: {
      id: randomUUID(),
      userId: testUserId,
      runId: testRunId,
    }
  });

  // Turn 1: Basic greeting (should trigger Coach mode)
  console.log("\\n[Turn 1] User says: 'Hello'");
  const res1 = await manageConversationTurn({
    userId: testUserId,
    runId: testRunId,
    userMessage: "Hello",
    recentHistory: "None"
  });
  console.log("-> Orchestrator Output Mode:", res1.mode);
  console.log("-> Response:", res1.response);

  // Turn 2: Providing a vague topic (should trigger Ideate mode per Rule 2)
  console.log("\\n[Turn 2] User says: 'I want to write about React.js today'");
  const res2 = await manageConversationTurn({
    userId: testUserId,
    runId: testRunId,
    userMessage: "I want to write about React.js today",
    recentHistory: "User: Hello\\nAgent: Hi there!"
  });
  console.log("-> Orchestrator Output Mode:", res2.mode);
  console.log("-> Response:", res2.response);
  if (res2.mode === "ideate") {
    console.log("-> Angles provided:", (res2.data as Record<string, unknown>).angles ? (res2.data as { angles: unknown[] }).angles.length : 0);
  }

  // Turn 3: Forcing a draft with explicit constraints
  console.log("\\n[Turn 3] User says: 'Draft this for me. I love Next.js app router. No emojis.'");
  const res3 = await manageConversationTurn({
    userId: testUserId,
    runId: testRunId,
    userMessage: "Draft this for me. I love Next.js app router. No emojis.",
    recentHistory: "User: I want to write about React.js\\nAgent: Here are some angles..."
  });
  console.log("-> Orchestrator Output Mode:", res3.mode);
  console.log("-> Response:", res3.response);
  if (res3.mode === "draft") {
    const data = res3.data as { drafts?: unknown[], issuesFixed?: unknown[] };
    console.log("-> Drafts generated:", data.drafts?.length || 0);
    console.log("-> Issues fixed by Critic:", data.issuesFixed);
  }

  // Cleanup
  console.log("\\n[Cleanup] Removing test data...");
  await prisma.conversationMemory.deleteMany({ where: { runId: testRunId } });
  await prisma.onboardingRun.delete({ where: { id: testRunId } });

  console.log("=== Test Complete ===");
}

runTest().catch(console.error);
