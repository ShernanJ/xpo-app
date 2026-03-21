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

test("createConversationMemorySnapshot preserves active reply source context and preview metadata", () => {
  const snapshot = createConversationMemorySnapshot({
    topicSummary: "reply workflow",
    concreteAnswerCount: 1,
    activeConstraints: {
      constraints: [],
      inferredConstraints: [],
      conversationState: "draft_ready",
      pendingPlan: null,
      clarificationState: null,
      continuationState: {
        capability: "replying",
        pendingAction: "reply_regenerate",
        formatPreference: "shortform",
        sourceUserMessage: "Perfect algo pull",
      },
      lastIdeationAngles: [],
      rollingSummary: null,
      assistantTurnCount: 2,
      activeDraftRef: null,
      latestRefinementInstruction: null,
      unresolvedQuestion: null,
      clarificationQuestionsAsked: 0,
      preferredSurfaceMode: "structured",
      formatPreference: "shortform",
      activeReplyContext: {
        sourceText: "Perfect algo pull",
        sourceUrl: "https://x.com/elkelk/status/2034751673290350617",
        authorHandle: "elkelk",
        sourceContext: {
          primaryPost: {
            id: "2034751673290350617",
            url: "https://x.com/elkelk/status/2034751673290350617",
            text: "Perfect algo pull",
            authorHandle: "elkelk",
            authorDisplayName: "elkelk",
            postType: "original",
          },
          quotedPost: {
            id: "quoted-1",
            url: "https://x.com/thejustinguo/status/1",
            text: "founder mode but the screenshot is doing half the work",
            authorHandle: "thejustinguo",
            authorDisplayName: "Justin Guo",
          },
          media: {
            images: [
              {
                imageUrl: "https://pbs.twimg.com/media/post-image.jpg?format=jpg&name=large",
                altText: "dashboard screenshot",
              },
            ],
            hasVideo: false,
            hasGif: false,
            hasLink: false,
          },
        },
        replySourcePreview: {
          postId: "2034751673290350617",
          sourceUrl: "https://x.com/elkelk/status/2034751673290350617",
          author: {
            displayName: "elkelk",
            username: "elkelk",
            avatarUrl: null,
            isVerified: false,
          },
          text: "Perfect algo pull",
          media: [
            {
              type: "image",
              url: "https://pbs.twimg.com/media/post-image.jpg?format=jpg&name=large",
              altText: "dashboard screenshot",
            },
          ],
          quotedPost: {
            postId: "quoted-1",
            sourceUrl: "https://x.com/thejustinguo/status/1",
            author: {
              displayName: "Justin Guo",
              username: "thejustinguo",
              avatarUrl: null,
              isVerified: false,
            },
            text: "founder mode but the screenshot is doing half the work",
            media: [],
          },
        },
        quotedUserAsk: null,
        confidence: "high",
        parseReason: "reply_draft_revised",
        awaitingConfirmation: false,
        stage: "1k_to_10k",
        tone: "builder",
        goal: "followers",
        opportunityId: "chat-reply-1",
        latestReplyOptions: [],
        latestReplyDraftOptions: [],
        selectedReplyOptionId: "option_2",
      },
      activeReplyArtifactRef: {
        messageId: "assistant-reply-1",
        kind: "reply_draft",
      },
      activeProfileAnalysisRef: null,
      selectedReplyOptionId: "option_2",
      liveContextCache: null,
    },
  });

  assert.equal(
    snapshot.activeReplyContext?.sourceContext?.primaryPost.authorHandle,
    "elkelk",
  );
  assert.equal(
    snapshot.activeReplyContext?.sourceContext?.quotedPost?.authorHandle,
    "thejustinguo",
  );
  assert.equal(
    snapshot.activeReplyContext?.replySourcePreview?.author.username,
    "elkelk",
  );
  assert.equal(
    snapshot.activeReplyContext?.replySourcePreview?.quotedPost?.author.username,
    "thejustinguo",
  );
  assert.equal(
    snapshot.activeReplyContext?.replySourcePreview?.media[0]?.url,
    "https://pbs.twimg.com/media/post-image.jpg?format=jpg&name=large",
  );
});
