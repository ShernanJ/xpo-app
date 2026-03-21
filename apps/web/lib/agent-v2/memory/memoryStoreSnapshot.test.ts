import assert from "node:assert/strict";
import test from "node:test";

import { createConversationMemorySnapshot } from "./memoryStore.ts";

test("createConversationMemorySnapshot preserves pending plan live-context fields and thread posts", () => {
  const snapshot = createConversationMemorySnapshot({
    topicSummary: "launch thread",
    concreteAnswerCount: 1,
    activeConstraints: {
      constraints: [],
      inferredConstraints: [],
      conversationState: "plan_pending_approval",
      pendingPlan: {
        objective: "launch thread",
        angle: "show what actually changed",
        targetLane: "original",
        mustInclude: ["new pricing"],
        mustAvoid: ["generic hype"],
        hookType: "direct",
        pitchResponse: "lead with the actual change",
        extractedConstraints: [],
        formatPreference: "thread",
        formatIntent: "lesson",
        requiresLiveContext: true,
        searchQueries: ["latest launch update", "pricing change"],
        posts: [
          {
            role: "hook",
            objective: "open on the change",
            proofPoints: ["pricing changed"],
            transitionHint: "set up the context",
          },
        ],
      },
      clarificationState: null,
      continuationState: {
        capability: "drafting",
        pendingAction: "retry_delivery",
        formatPreference: "thread",
        formatIntent: "lesson",
        plan: {
          objective: "launch thread",
          angle: "show what actually changed",
          targetLane: "original",
          mustInclude: [],
          mustAvoid: [],
          hookType: "direct",
          pitchResponse: "lead with the actual change",
          extractedConstraints: [],
          requiresLiveContext: true,
          searchQueries: ["latest launch update"],
        },
      },
      lastIdeationAngles: [],
      rollingSummary: null,
      assistantTurnCount: 0,
      activeDraftRef: null,
      latestRefinementInstruction: null,
      unresolvedQuestion: null,
      clarificationQuestionsAsked: 0,
      preferredSurfaceMode: null,
      formatPreference: "thread",
      activeReplyContext: null,
      activeReplyArtifactRef: null,
      activeProfileAnalysisRef: null,
      selectedReplyOptionId: null,
      liveContextCache: {
        queryKey: "latest launch update||pricing change",
        queries: ["latest launch update", "pricing change"],
        content: "cached context",
      },
    },
  });

  assert.equal(snapshot.pendingPlan?.requiresLiveContext, true);
  assert.deepEqual(snapshot.pendingPlan?.searchQueries, [
    "latest launch update",
    "pricing change",
  ]);
  assert.equal(Array.isArray((snapshot.pendingPlan as { posts?: unknown[] })?.posts), true);
  assert.equal(snapshot.continuationState?.plan?.requiresLiveContext, true);
  assert.deepEqual(snapshot.continuationState?.plan?.searchQueries, [
    "latest launch update",
  ]);
  assert.equal(snapshot.liveContextCache?.content, "cached context");
});
