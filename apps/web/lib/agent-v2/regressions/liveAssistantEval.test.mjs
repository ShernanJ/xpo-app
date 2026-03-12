import test from "node:test";
import assert from "node:assert/strict";

import { resolveArtifactContinuationAction } from "../agents/controller.ts";
import { normalizeDraftRevisionInstruction } from "../orchestrator/draftRevision.ts";
import { assessGroundedProductDrift } from "../orchestrator/draftGrounding.ts";
import {
  buildConversationContextFromHistory,
  resolveSelectedDraftContextFromHistory,
} from "../../../app/api/creator/v2/chat/route.logic.ts";

test("eval: continuity follow-up reuses the stored active draft instead of resetting the task", () => {
  const selectedDraftContext = resolveSelectedDraftContextFromHistory({
    activeDraftRef: {
      messageId: "assistant_msg_1",
      versionId: "draft_v2",
    },
    history: [
      {
        id: "assistant_msg_1",
        role: "assistant",
        content: "here's the latest version",
        data: {
          assistant_context_v2: {
            contextPacket: {
              draftRef: {
                activeDraftVersionId: "draft_v2",
                excerpt: "xpo helps turn rough ideas into posts you can actually ship.",
                revisionChainId: "chain_1",
              },
            },
          },
          draftVersions: [
            {
              id: "draft_v1",
              content: "old draft",
            },
            {
              id: "draft_v2",
              content: "xpo helps turn rough ideas into posts you can actually ship.",
            },
          ],
        },
      },
    ],
    selectedDraftContext: null,
  });

  const context = buildConversationContextFromHistory({
    history: [
      {
        id: "assistant_msg_1",
        role: "assistant",
        content: "here's the latest version",
        data: {
          assistant_context_v2: {
            contextPacket: {
              draftRef: {
                activeDraftVersionId: "draft_v2",
                excerpt: "xpo helps turn rough ideas into posts you can actually ship.",
                revisionChainId: "chain_1",
              },
            },
          },
        },
      },
      {
        role: "user",
        content: "make that punchier",
      },
    ],
    selectedDraftContext,
  });

  const action = resolveArtifactContinuationAction({
    userMessage: "make that punchier",
    memory: {
      conversationState: "drafting",
      topicSummary: "xpo launch",
      hasPendingPlan: false,
      hasActiveDraft: true,
      unresolvedQuestion: null,
      concreteAnswerCount: 1,
      pendingPlanSummary: null,
      latestRefinementInstruction: null,
      lastIdeationAngles: [],
    },
  });

  assert.equal(selectedDraftContext?.content, "xpo helps turn rough ideas into posts you can actually ship.");
  assert.equal(context.activeDraft, "xpo helps turn rough ideas into posts you can actually ship.");
  assert.equal(action, "revise");
});

test("eval: direct questions are not hijacked by artifact heuristics", () => {
  const action = resolveArtifactContinuationAction({
    userMessage: "what changed between option 1 and option 2?",
    memory: {
      conversationState: "ready_to_ideate",
      topicSummary: "xpo positioning",
      hasPendingPlan: false,
      hasActiveDraft: false,
      unresolvedQuestion: null,
      concreteAnswerCount: 0,
      pendingPlanSummary: null,
      latestRefinementInstruction: null,
      lastIdeationAngles: [
        "why context loss makes ai feel generic",
        "why brittle routing kills continuity",
      ],
    },
  });

  assert.equal(action, null);
});

test("eval: grounded first-pass drafting rejects invented product usage and mechanics", () => {
  const result = assessGroundedProductDrift({
    activeConstraints: [
      "Topic grounding: Xpo helps users repurpose existing ideas into X posts and replies.",
    ],
    sourceUserMessage: "write a post about xpo",
    draft:
      "i built xpo to scan engagement timing, handle the rest, and remove the mental load from posting.",
  });

  assert.equal(result.shouldGuard, true);
  assert.equal(result.hasDrift, true);
  assert.match(result.reason || "", /invented first-person product usage|adjacent product mechanics/i);
});

test("eval: revision directives stay local and grounded for expansion and specificity requests", () => {
  const expansion = normalizeDraftRevisionInstruction(
    "make it longer and more detailed",
    "xpo helps turn rough ideas into posts you can actually ship.",
  );
  const specificity = normalizeDraftRevisionInstruction(
    "make it more specific",
    "xpo helps turn rough ideas into posts you can actually ship.",
  );

  assert.equal(expansion.changeKind, "length_expand");
  assert.match(expansion.instruction, /already grounded|already grounded in the draft, chat, or session context/i);

  assert.equal(specificity.changeKind, "specificity_tune");
  assert.match(specificity.instruction, /already present|already present in the draft, user note, chat, or grounding/i);
});
