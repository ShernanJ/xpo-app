import "dotenv/config";
import {
  getConversationMemory,
  createConversationMemory,
  updateConversationMemory,
  createConversationMemorySnapshot,
} from "./memoryStore";
import { prisma } from "../../db";
import { Prisma } from "../../generated/prisma/client";
import { randomUUID } from "crypto";

async function runTest() {
  console.log("Testing memory store...");

  // We need to create a dummy onboarding run first, due to foreign key constraints
  const testRunId = `or_test_${randomUUID()}`;

  console.log("Creating dummy onboarding run...");
  await prisma.onboardingRun.create({
    data: {
      id: testRunId,
      input: {} as unknown as Prisma.InputJsonObject,
      result: {} as unknown as Prisma.InputJsonObject,
    }
  });

  console.log("1. Creating memory...");
  const memory = await createConversationMemory({
    runId: testRunId,
  });
  console.log("Created memory:", memory?.id);

  console.log("2. Updating memory...");
  const updated = await updateConversationMemory({
    runId: testRunId,
    topicSummary: "User wants to write about Next.js features.",
    activeConstraints: ["No emojis", "Professional tone"],
    concreteAnswerCount: 1,
    lastDraftArtifactId: "draft_123",
    conversationState: "plan_pending_approval",
    pendingPlan: {
      objective: "Talk about shipping a tricky refactor",
      angle: "The hard part is the messy middle, not the final screenshot",
      targetLane: "original",
      mustInclude: [],
      mustAvoid: ["generic opener"],
      hookType: "Counter-narrative",
      pitchResponse: "i'm thinking we focus on the messy middle. sound good?",
    },
    rollingSummary: "Current topic: tricky refactor",
    assistantTurnCount: 2,
  });
  console.log("Updated memory summary:", updated?.topicSummary);
  console.log("Updated memory constraints:", updated?.activeConstraints);

  console.log("3. Fetching memory...");
  const fetched = await getConversationMemory({ runId: testRunId });
  console.log("Fetched memory concreteAnswerCount:", fetched?.concreteAnswerCount);
  console.log("Fetched memory snapshot:", createConversationMemorySnapshot(fetched as any));

  console.log("4. Cleaning up test data...");
  await prisma.conversationMemory.deleteMany({
    where: { runId: testRunId }
  });
  await prisma.onboardingRun.delete({
    where: { id: testRunId }
  });

  console.log("Test complete!");
}

runTest().catch(console.error);
