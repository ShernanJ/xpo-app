import test from "node:test";
import assert from "node:assert/strict";

import { buildChatReplyDraftWithDeps } from "./chatReplyAdapter.ts";

const sourceContext = {
  primaryPost: {
    id: "reply-source-1",
    url: "https://x.com/vitddnv/status/1",
    text:
      "just hooked sierra, my @OpenClaw ai, up to @NotionHQ. working on a project proposal. voice dumped the ideas in my head and she packaged them into a notion page. sent a link back.",
    authorHandle: "vitddnv",
    postType: "original" as const,
  },
  quotedPost: null,
  media: {
    images: [
      {
        altText:
          "Telegram screenshot showing Sierra summarizing edits and posting a Notion link back into chat.",
      },
    ],
    hasVideo: false,
    hasGif: false,
    hasLink: false,
  },
  conversation: null,
};

const inferredIntent = {
  label: "nuance",
  strategyPillar: "reply leverage",
  anchor: "version history",
  rationale: "Turn the concrete workflow into a native follow-up question.",
};

const baseArgs = {
  source: {
    opportunityId: "opp-1",
    sourceText: sourceContext.primaryPost.text,
    sourceUrl: sourceContext.primaryPost.url,
    authorHandle: sourceContext.primaryPost.authorHandle,
    sourceContext,
  },
  strategy: {
    knownFor: "reply leverage",
    targetAudience: "builders",
    contentPillars: ["reply leverage"],
    replyGoals: ["Ask one grounded follow-up question."],
    profileConversionCues: [],
    offBrandThemes: [],
    ambiguities: [],
    confidence: {
      overall: 60,
      positioning: 60,
      replySignal: 60,
      readiness: "caution" as const,
    },
    truthBoundary: {
      verifiedFacts: [],
      inferredThemes: [],
      unknowns: [],
    },
  },
  styleCard: null,
  stage: "0_to_1k" as const,
  tone: "builder" as const,
  goal: "followers",
};

function createGeneration(overrides: Record<string, unknown> = {}) {
  return {
    strategyPillar: "reply leverage",
    angleLabel: "nuance",
    groundingPacket: {
      durableFacts: [],
      turnGrounding: [],
      allowedFirstPersonClaims: [],
      allowedNumbers: [],
      forbiddenClaims: [],
      unknowns: [],
      sourceMaterials: [],
      voiceContextHints: [],
    },
    intent: inferredIntent,
    policy: {
      allowImageAnchoring: false,
      preferTextOverImage: true,
    },
    notes: ["Anchored to: reply leverage"],
    ...overrides,
  };
}

function createFallback(overrides: Record<string, unknown> = {}) {
  return {
    response: {
      options: [
        {
          id: "safe-1",
          label: "safe",
          text: "fallback reply",
          intent: undefined,
        },
      ],
      notes: ["Anchored to: reply leverage"],
    },
    strategyPillar: "reply leverage",
    angleLabel: "nuance",
    groundingPacket: {
      durableFacts: [],
      turnGrounding: [],
      allowedFirstPersonClaims: [],
      allowedNumbers: [],
      forbiddenClaims: [],
      unknowns: [],
      sourceMaterials: [],
      voiceContextHints: [],
    },
    ...overrides,
  };
}

function createDeps(args?: {
  generation?: ReturnType<typeof createGeneration>;
  fallback?: ReturnType<typeof createFallback>;
  allowImageAnchoring?: boolean;
}) {
  const calls: {
    promptPackets: unknown[];
    policyArgs: unknown[];
  } = {
    promptPackets: [],
    policyArgs: [],
  };

  return {
    calls,
    deps: {
      buildReplySourceContextFromFlatInput: () => sourceContext,
      buildReplyDraftGenerationContext: () => args?.generation || createGeneration(),
      buildExtensionReplyDraft: () => args?.fallback || createFallback(),
      prepareExtensionReplyDraftPromptPacket: async (input: unknown) => {
        calls.promptPackets.push(input);
        return {
          preflightResult: {
            op_tone: "specific",
            post_intent: "reply to the workflow point in the visible post",
            recommended_reply_mode: "insightful_add_on",
            source_shape: "strategic_take",
            image_role: "context",
            image_reply_anchor: "Sierra edit summary",
            should_reference_image_text: false,
          },
          visualContext: {
            imageRole: "context",
          },
          voiceEvidence: {
            summaryLines: ["Primary voice evidence: 2 lane-matched anchors"],
          },
        };
      },
      generateReplyDraftText: async () => ({
        draft: "nice speed run-does she keep a version history for those voice-dump edits?",
        voiceTarget: {
          summary: "short casual reply",
        },
        visualContext: {
          imageRole: "context",
        },
      }),
      resolveReplyConstraintPolicy: (input: unknown) => {
        calls.policyArgs.push(input);
        return {
          allowImageAnchoring: args?.allowImageAnchoring ?? false,
        };
      },
      shouldUseLiveGroqReplyDrafts: () => true,
    },
  };
}

test("buildChatReplyDraft reuses inferred intent in the live chat draft path", async () => {
  const { calls, deps } = createDeps();

  const result = await buildChatReplyDraftWithDeps(baseArgs, deps);

  assert.equal(calls.promptPackets.length, 1);
  assert.deepEqual(
    (calls.promptPackets[0] as { generation: { intent: unknown } }).generation.intent,
    inferredIntent,
  );
  assert.deepEqual(result.response.options[0]?.intent, inferredIntent);
});

test("buildChatReplyDraft only reports image sharpening when the final policy allows it", async () => {
  const withoutImageNote = createDeps({ allowImageAnchoring: false });
  const withoutImageResult = await buildChatReplyDraftWithDeps(baseArgs, withoutImageNote.deps);

  assert.equal(
    withoutImageResult.response.notes.includes("Used image context to sharpen the reply."),
    false,
  );

  const withImageNote = createDeps({ allowImageAnchoring: true });
  const withImageResult = await buildChatReplyDraftWithDeps(baseArgs, withImageNote.deps);

  assert.equal(
    withImageResult.response.notes.includes("Used image context to sharpen the reply."),
    true,
  );
});
