import test from "node:test";
import assert from "node:assert/strict";

import { resolveArtifactContinuationAction } from "../agents/controller.ts";
import { normalizeDraftRevisionInstruction } from "../orchestrator/draftRevision.ts";
import { assessGroundedProductDrift } from "../orchestrator/draftGrounding.ts";
import { scopeMemoryForCurrentTurn } from "../memory/turnScopedMemory.ts";
import {
  buildConversationContextFromHistory,
  resolveSelectedDraftContextFromHistory,
} from "../../../app/api/creator/v2/chat/_lib/request/routeLogic.ts";
import { LIVE_ASSISTANT_EVAL_FIXTURES } from "./liveAssistantEvalFixtures.ts";

for (const fixture of LIVE_ASSISTANT_EVAL_FIXTURES) {
  if (fixture.category === "continuity") {
    test(`eval [${fixture.category}]: ${fixture.name}`, () => {
      const selectedDraftContext = resolveSelectedDraftContextFromHistory({
        activeDraftRef: fixture.activeDraftRef,
        history: fixture.history,
        selectedDraftContext: null,
      });

      const context = buildConversationContextFromHistory({
        history: fixture.history,
        selectedDraftContext,
      });

      const action = resolveArtifactContinuationAction({
        userMessage: fixture.followUpMessage,
        memory: fixture.controllerMemory,
      });

      assert.equal(selectedDraftContext?.content, fixture.expectedActiveDraft);
      assert.equal(context.activeDraft, fixture.expectedActiveDraft);
      assert.equal(action, fixture.expectedAction);
    });
    continue;
  }

  if (fixture.category === "controller") {
    test(`eval [${fixture.category}]: ${fixture.name}`, () => {
      const action = resolveArtifactContinuationAction({
        userMessage: fixture.userMessage,
        memory: fixture.controllerMemory,
      });

      assert.equal(action, fixture.expectedAction);
    });
    continue;
  }

  if (fixture.category === "grounding") {
    test(`eval [${fixture.category}]: ${fixture.name}`, () => {
      const result = assessGroundedProductDrift({
        activeConstraints: fixture.activeConstraints,
        sourceUserMessage: fixture.sourceUserMessage,
        draft: fixture.draft,
      });

      assert.equal(result.shouldGuard, true);
      assert.equal(result.hasDrift, true);
      assert.match(result.reason || "", fixture.expectedReasonPattern);
    });
    continue;
  }

  if (fixture.category === "memory_scope") {
    test(`eval [${fixture.category}]: ${fixture.name}`, () => {
      const result = scopeMemoryForCurrentTurn({
        userMessage: fixture.userMessage,
        memory: fixture.memory,
        resolvedWorkflow: "plan_then_draft",
      });

      assert.equal(result.conversationState, fixture.expectedConversationState);
      assert.equal(result.topicSummary, fixture.expectedTopicSummary);
      assert.equal(result.currentDraftArtifactId, fixture.expectedCurrentDraftArtifactId);
      assert.deepEqual(result.activeConstraints, fixture.expectedActiveConstraints);

      if (fixture.expectedReplyCleared) {
        assert.equal(result.activeReplyContext, null);
        assert.equal(result.activeReplyArtifactRef, null);
        assert.equal(result.selectedReplyOptionId, null);
      }
    });
    continue;
  }

  test(`eval [${fixture.category}]: ${fixture.name}`, () => {
    const expansion = normalizeDraftRevisionInstruction(
      fixture.expansionMessage,
      fixture.activeDraft,
    );
    const specificity = normalizeDraftRevisionInstruction(
      fixture.specificityMessage,
      fixture.activeDraft,
    );

    assert.equal(expansion.changeKind, "length_expand");
    assert.match(expansion.instruction, /already grounded|already grounded in the draft, chat, or session context/i);

    assert.equal(specificity.changeKind, "specificity_tune");
    assert.match(specificity.instruction, /already present|already present in the draft, user note, chat, or grounding/i);
  });
}
