import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateDraftContextSlots,
} from "./draftContextSlots.ts";
import {
  isBareIdeationRequest,
  isBareDraftRequest,
  resolveConversationMode,
  resolveDraftOutputShape,
  shouldRouteCareerClarification,
  shouldUsePendingPlanApprovalPath,
  shouldUseRevisionDraftPath,
} from "./conversationManagerLogic.ts";

test("generic draft prompts are treated as bare draft requests", () => {
  assert.equal(isBareDraftRequest("draft a post for me"), true);
  assert.equal(isBareDraftRequest("write me a post"), true);
  assert.equal(isBareDraftRequest("give me a random post I would use"), true);
  assert.equal(isBareDraftRequest("give me random post i'd use"), true);
  assert.equal(isBareDraftRequest("write me a post about internship hunt"), false);
});

test("generic ideation prompts are detected deterministically", () => {
  assert.equal(isBareIdeationRequest("give me post ideas"), true);
  assert.equal(isBareIdeationRequest("give me more post ideas"), true);
  assert.equal(isBareIdeationRequest("give me more ideas"), true);
  assert.equal(isBareIdeationRequest("brainstorm with me"), true);
  assert.equal(isBareIdeationRequest("give me post ideas about onboarding"), false);
  assert.equal(isBareIdeationRequest("give me more post ideas about onboarding"), false);
});

test("plain draft intent without an active draft upgrades to plan mode", () => {
  const mode = resolveConversationMode({
    explicitIntent: null,
    userMessage: "write me a post",
    classifiedIntent: "draft",
  });

  assert.equal(mode, "plan");
});

test("bare draft requests force plan mode even when classifier misses", () => {
  const mode = resolveConversationMode({
    explicitIntent: null,
    userMessage: "draft a post for me",
    classifiedIntent: "ideate",
  });

  assert.equal(mode, "plan");
});

test("bare ideation requests force ideate mode when classifier is noisy", () => {
  const mode = resolveConversationMode({
    explicitIntent: null,
    userMessage: "give me post ideas",
    classifiedIntent: "coach",
  });

  assert.equal(mode, "ideate");
});

test("planner feedback only reuses pending plan when approval state is active", () => {
  assert.equal(
    shouldUsePendingPlanApprovalPath({
      mode: "planner_feedback",
      conversationState: "plan_pending_approval",
      hasPendingPlan: true,
    }),
    true,
  );
  assert.equal(
    shouldUsePendingPlanApprovalPath({
      mode: "planner_feedback",
      conversationState: "needs_more_context",
      hasPendingPlan: true,
    }),
    false,
  );
});

test("selected draft review/edit modes use the revision flow", () => {
  assert.equal(
    shouldUseRevisionDraftPath({
      mode: "edit",
      activeDraft: "current draft",
    }),
    true,
  );
  assert.equal(
    shouldUseRevisionDraftPath({
      mode: "plan",
      activeDraft: "current draft",
    }),
    false,
  );
});

test("verified longform maps to long_form_post", () => {
  assert.equal(resolveDraftOutputShape("longform"), "long_form_post");
  assert.equal(resolveDraftOutputShape("shortform"), "short_form_post");
});

test("career prompts are routed into the career clarification gate", () => {
  assert.equal(
    shouldRouteCareerClarification({
      explicitIntent: null,
      mode: "plan",
      domainHint: "career",
      behaviorKnown: false,
      stakesKnown: true,
    }),
    true,
  );
  assert.equal(
    shouldRouteCareerClarification({
      explicitIntent: null,
      mode: "plan",
      domainHint: "product",
      behaviorKnown: false,
      stakesKnown: true,
    }),
    false,
  );
});

test("slot evaluator treats concrete career prompts as career and not entity-definition gaps", () => {
  const slots = evaluateDraftContextSlots({
    userMessage:
      "write a post for me for my internship hunt, taiv requested an interview",
    topicSummary: null,
    contextAnchors: [],
  });

  assert.equal(slots.domainHint, "career");
  assert.equal(slots.behaviorKnown, true);
  assert.equal(slots.stakesKnown, true);
  assert.equal(slots.entityNeedsDefinition, false);
});

test("slot evaluator treats undefined product references as entity-definition gaps", () => {
  const slots = evaluateDraftContextSlots({
    userMessage: "i'm building an extension for stanley",
    topicSummary: null,
    contextAnchors: [],
  });

  assert.equal(slots.domainHint, "product");
  assert.equal(slots.entityNeedsDefinition, true);
  assert.equal(slots.namedEntity, "stanley");
});

test("slot evaluator flags ampm when reference is ambiguous", () => {
  const slots = evaluateDraftContextSlots({
    userMessage: "draft a post about the ampm event",
    topicSummary: null,
    contextAnchors: [],
  });

  assert.equal(slots.ambiguousReferenceNeedsClarification, true);
  assert.equal(slots.ambiguousReference, "ampm");
});

test("slot evaluator skips ampm clarification when context already disambiguates", () => {
  const slots = evaluateDraftContextSlots({
    userMessage: "draft a post about ampm",
    topicSummary: null,
    contextAnchors: ["ampm is a club in downtown toronto where i meet creators"],
  });

  assert.equal(slots.ambiguousReferenceNeedsClarification, false);
  assert.equal(slots.ambiguousReference, "ampm");
});
