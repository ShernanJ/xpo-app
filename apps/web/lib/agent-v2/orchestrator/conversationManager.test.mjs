import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateDraftContextSlots,
} from "./draftContextSlots.ts";
import {
  applyCreatorProfileHintsToPlan,
  mapPreferredOutputShapeToFormatPreference,
} from "./creatorHintPolicy.ts";
import {
  addGroundingUnknowns,
  buildGroundingPacket,
  buildSafeFrameworkConstraint,
  hasAutobiographicalGrounding,
} from "./groundingPacket.ts";
import {
  buildDirectionChoiceReply,
  buildLooseDirectionReply,
} from "./assistantReplyStyle.ts";
import {
  isBareIdeationRequest,
  isBareDraftRequest,
  resolveConversationMode,
  resolveDraftOutputShape,
  shouldRouteCareerClarification,
  shouldUsePendingPlanApprovalPath,
  shouldUseRevisionDraftPath,
} from "./conversationManagerLogic.ts";
import {
  appendNoFabricationConstraint,
  buildDraftMeaningResponse,
  hasNoFabricationPlanGuardrail,
  isConcreteAnecdoteDraftRequest,
  isDraftMeaningQuestion,
  NO_FABRICATION_CONSTRAINT,
  NO_FABRICATION_MUST_AVOID,
  shouldForceNoFabricationPlanGuardrail,
  withNoFabricationPlanGuardrail,
} from "./draftGrounding.ts";
import { isMissingDraftCandidateTableError } from "./prismaGuards.ts";
import { planTurn } from "./turnPlanner.ts";
import { checkDraftClaimsAgainstGrounding } from "./claimChecker.ts";

test("generic draft prompts are treated as bare draft requests", () => {
  assert.equal(isBareDraftRequest("draft a post for me"), true);
  assert.equal(isBareDraftRequest("write me a post"), true);
  assert.equal(isBareDraftRequest("write a thread i would use"), true);
  assert.equal(isBareDraftRequest("write me a thread"), true);
  assert.equal(isBareDraftRequest("give me a random post I would use"), true);
  assert.equal(isBareDraftRequest("give me random post i'd use"), true);
  assert.equal(isBareDraftRequest("write me a post about internship hunt"), false);
  assert.equal(isBareDraftRequest("write me a thread about internship hunt"), false);
});

test("generic ideation prompts are detected deterministically", () => {
  assert.equal(isBareIdeationRequest("give me post ideas"), true);
  assert.equal(isBareIdeationRequest("give me more post ideas"), true);
  assert.equal(isBareIdeationRequest("give me more ideas"), true);
  assert.equal(isBareIdeationRequest("try again"), true);
  assert.equal(isBareIdeationRequest("give me another set of ideas"), true);
  assert.equal(isBareIdeationRequest("brainstorm with me"), true);
  assert.equal(isBareIdeationRequest("give me post ideas about onboarding"), false);
  assert.equal(isBareIdeationRequest("give me more post ideas about onboarding"), false);
});

test("thread direction reply avoids post-length framing", () => {
  const reply = buildDirectionChoiceReply({
    verified: true,
    requestedFormatPreference: "thread",
  });

  assert.equal(reply.toLowerCase().includes("thread"), true);
  assert.equal(/shortform|longform/i.test(reply), false);
});

test("thread loose-direction reply stays thread-native", () => {
  const reply = buildLooseDirectionReply({
    almostReady: true,
    requestedFormatPreference: "thread",
  });

  assert.equal(reply.toLowerCase().includes("thread"), true);
  assert.equal(/concrete direction/i.test(reply), false);
});

test("concrete anecdote draft requests trigger the no-fabrication guardrail", () => {
  assert.equal(
    isConcreteAnecdoteDraftRequest(
      "can you write me a post on playing league at the stan office against the ceo and losing hard?",
    ),
    true,
  );
  assert.equal(
    isConcreteAnecdoteDraftRequest(
      "write one about playing league at the stan office against the ceo and losing hard",
    ),
    true,
  );
  assert.equal(isConcreteAnecdoteDraftRequest("write one about growth lessons for builders"), false);
  assert.equal(
    shouldForceNoFabricationPlanGuardrail({
      userMessage:
        "write one about playing league at the stan office against the ceo and losing hard",
      behaviorKnown: true,
      stakesKnown: true,
    }),
    true,
  );
});

test("no-fabrication guardrails are appended once to plans and constraints", () => {
  const plan = {
    objective: "league loss story",
    angle: "tell the office league story plainly",
    targetLane: "original",
    mustInclude: [],
    mustAvoid: [],
    hookType: "story",
    pitchResponse: "drafting it.",
  };

  const guardedPlan = withNoFabricationPlanGuardrail(plan);
  assert.equal(hasNoFabricationPlanGuardrail(guardedPlan), true);
  assert.equal(guardedPlan.mustAvoid.includes(NO_FABRICATION_MUST_AVOID), true);
  assert.equal(
    withNoFabricationPlanGuardrail(guardedPlan).mustAvoid.filter(
      (entry) => entry === NO_FABRICATION_MUST_AVOID,
    ).length,
    1,
  );

  const nextConstraints = appendNoFabricationConstraint(["no emojis"]);
  assert.equal(nextConstraints.includes(NO_FABRICATION_CONSTRAINT), true);
  assert.equal(
    appendNoFabricationConstraint(nextConstraints).filter(
      (entry) => entry === NO_FABRICATION_CONSTRAINT,
    ).length,
    1,
  );
});

test("draft meaning fallback admits muddiness instead of inventing an explanation", () => {
  assert.equal(isDraftMeaningQuestion("what does this post even mean?"), true);

  const reply = buildDraftMeaningResponse(
    "lost a league game with the ceo on my team and then pivoted into some vague point",
  );

  assert.equal(reply.toLowerCase().includes("as written, it's muddy"), true);
  assert.equal(reply.toLowerCase().includes("the point is"), false);
  assert.equal(reply.includes("?"), false);
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

test("bare thread requests force plan mode even when classifier misses", () => {
  const mode = resolveConversationMode({
    explicitIntent: null,
    userMessage: "write a thread i would use",
    classifiedIntent: "coach",
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

test("bare ideation requests do not force ideate when an active draft exists", () => {
  const mode = resolveConversationMode({
    explicitIntent: null,
    userMessage: "try again",
    classifiedIntent: "edit",
    activeDraft: "current draft",
  });

  assert.equal(mode, "edit");
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

test("lets do it routes to planner feedback when a plan is pending", () => {
  const turnPlan = planTurn({
    userMessage: "Lets do it",
    recentHistory: "assistant: start with a punchy hook and then land the CTA.",
    memory: {
      conversationState: "plan_pending_approval",
      concreteAnswerCount: 1,
      topicSummary: "momentum vs progress",
      pendingPlan: {
        objective: "momentum vs progress",
        angle: "flip the belief that momentum equals traction",
        targetLane: "original",
        mustInclude: [],
        mustAvoid: [],
        hookType: "contrarian",
        pitchResponse: "drafting it.",
        formatPreference: "thread",
      },
      currentDraftArtifactId: null,
      activeConstraints: [],
      assistantTurnCount: 2,
      unresolvedQuestion: null,
    },
  });

  assert.equal(turnPlan?.overrideClassifiedIntent, "planner_feedback");
  assert.equal(turnPlan?.userGoal, "draft");
});

test("specific thread draft requests auto-draft from the planner path", () => {
  const turnPlan = planTurn({
    userMessage:
      "write me a thread on how my hiring playbook led to one of our top candidates finding us and building in public instead of going through the regular hiring pipeline",
    recentHistory: "assistant: none",
    memory: {
      conversationState: "needs_more_context",
      concreteAnswerCount: 0,
      topicSummary: null,
      pendingPlan: null,
      currentDraftArtifactId: null,
      activeConstraints: [],
      assistantTurnCount: 0,
      unresolvedQuestion: null,
    },
  });

  assert.equal(turnPlan?.overrideClassifiedIntent, "draft");
  assert.equal(turnPlan?.shouldAutoDraftFromPlan, true);
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
  assert.equal(resolveDraftOutputShape("thread"), "thread_seed");
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

test("slot evaluator treats vague named build prompts as product definition gaps", () => {
  const slots = evaluateDraftContextSlots({
    userMessage: "write me a post about how im building stanley for x",
    topicSummary: null,
    contextAnchors: [],
  });

  assert.equal(slots.domainHint, "product");
  assert.equal(slots.entityNeedsDefinition, true);
  assert.equal(slots.behaviorKnown, false);
  assert.equal(slots.namedEntity, "stanley");
});

test("slot evaluator treats hiring playbook prompts as career context, not product context", () => {
  const slots = evaluateDraftContextSlots({
    userMessage:
      "write me a thread on how my hiring playbook led to one of our top candidates finding us and building in public instead of going through the regular hiring pipeline",
    topicSummary: null,
    contextAnchors: [],
  });

  assert.equal(slots.domainHint, "career");
  assert.equal(slots.isProductLike, false);
  assert.equal(slots.entityNeedsDefinition, false);
  assert.equal(slots.behaviorKnown, true);
  assert.equal(slots.stakesKnown, true);
});

test("historical anchors do not satisfy missing product definition for named products", () => {
  const slots = evaluateDraftContextSlots({
    userMessage: "write me a post about how im building stanley for x",
    topicSummary: null,
    contextAnchors: [
      "stanley scans live engagement and finds the top hashtags for any tweet",
    ],
  });

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

test("missing DraftCandidate table errors are downgraded safely", () => {
  assert.equal(
    isMissingDraftCandidateTableError({
      code: "P2021",
      meta: { table: "public.DraftCandidate" },
      message: "The table `public.DraftCandidate` does not exist in the current database.",
    }),
    true,
  );

  assert.equal(
    isMissingDraftCandidateTableError({
      code: "P2021",
      meta: { table: "public.Post" },
      message: "The table `public.Post` does not exist in the current database.",
    }),
    false,
  );

  assert.equal(
    isMissingDraftCandidateTableError({
      code: "P2002",
      meta: { table: "public.DraftCandidate" },
      message: "Unique constraint failed.",
    }),
    false,
  );
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

test("grounding packet normalizes legacy durable facts and flags missing product detail", () => {
  const packet = addGroundingUnknowns(
    buildGroundingPacket({
      styleCard: {
        sentenceOpenings: [],
        sentenceClosers: [],
        pacing: "direct",
        emojiPatterns: [],
        slangAndVocabulary: [],
        formattingRules: [],
        customGuidelines: [],
        contextAnchors: ["xpo helps people write and grow faster on x"],
        factLedger: {
          durableFacts: ["User is building xpo"],
          allowedFirstPersonClaims: [],
          allowedNumbers: [],
          forbiddenClaims: [],
          sourceMaterials: [],
        },
        antiExamples: [],
      },
      activeConstraints: [],
      extractedFacts: ["User is shipping xpo in public"],
    }),
    evaluateDraftContextSlots({
      userMessage: "write me a post about xpo",
      topicSummary: null,
      contextAnchors: ["User is building xpo"],
    }),
  );

  assert.equal(packet.durableFacts.includes("User is building xpo"), true);
  assert.equal(
    packet.durableFacts.includes("xpo helps people write and grow faster on x"),
    true,
  );
  assert.equal(packet.turnGrounding.includes("User is shipping xpo in public"), true);
  assert.equal(packet.unknowns.some((entry) => /missing product behavior/i.test(entry)), true);
  assert.equal(hasAutobiographicalGrounding(packet), true);
});

test("safe framework constraint forbids autobiographical invention when facts are thin", () => {
  const packet = {
    durableFacts: ["xpo helps people write better on x"],
    turnGrounding: [],
    allowedFirstPersonClaims: [],
    allowedNumbers: [],
    forbiddenClaims: [],
    unknowns: ["missing product behavior detail"],
    sourceMaterials: [],
  };

  const constraint = buildSafeFrameworkConstraint(packet);
  assert.match(constraint, /framework, opinion, or principle-first post/i);
  assert.match(constraint, /do not write first-person anecdotes/i);
});

test("claim checker removes unsupported autobiographical specifics but preserves grounded replacements", () => {
  const result = checkDraftClaimsAgainstGrounding({
    draft: [
      "yesterday i closed 3 launches with xpo in toronto.",
      "xpo helps people write and grow faster on x without the mental load.",
    ].join("\n"),
    groundingPacket: {
      durableFacts: [
        "xpo helps people write and grow faster on x without the mental load",
      ],
      turnGrounding: [],
      allowedFirstPersonClaims: [],
      allowedNumbers: [],
      forbiddenClaims: [],
      unknowns: ["missing product behavior detail"],
      sourceMaterials: [],
    },
  });

  assert.equal(result.hasUnsupportedClaims, true);
  assert.doesNotMatch(result.draft, /yesterday|3 launches|toronto/i);
  assert.match(
    result.draft,
    /xpo helps people write and grow faster on x without the mental load/i,
  );
});

test("claim checker removes unsupported named entities dates and scale claims", () => {
  const result = checkDraftClaimsAgainstGrounding({
    draft: [
      "In January 2025 we grew xpo to 12,000 users after a Toronto meetup.",
      "It boosted conversion by 38% for Shopify teams.",
      "Write from grounded product facts only.",
    ].join("\n"),
    groundingPacket: {
      durableFacts: ["xpo helps people write and grow faster on x"],
      turnGrounding: [],
      allowedFirstPersonClaims: [],
      allowedNumbers: [],
      forbiddenClaims: [],
      unknowns: ["missing product behavior detail"],
      sourceMaterials: [],
    },
  });

  assert.equal(result.hasUnsupportedClaims, true);
  assert.doesNotMatch(result.draft, /January 2025|12,000 users|Toronto|38%|Shopify/i);
  assert.match(result.draft, /Write from grounded product facts only/i);
});

test("claim checker allows grounded source-material details", () => {
  const result = checkDraftClaimsAgainstGrounding({
    draft: "At Shopify, we used xpo to reduce the mental load of writing on x.",
    groundingPacket: {
      durableFacts: [],
      turnGrounding: [],
      allowedFirstPersonClaims: [],
      allowedNumbers: [],
      forbiddenClaims: [],
      unknowns: [],
      sourceMaterials: [
        {
          type: "case_study",
          title: "Shopify team workflow",
          claims: ["At Shopify, we used xpo to reduce the mental load of writing on x."],
          snippets: [],
        },
      ],
    },
  });

  assert.equal(result.hasUnsupportedClaims, false);
  assert.match(result.draft, /At Shopify, we used xpo/i);
});

test("claim checker removes claims that conflict with forbidden grounding", () => {
  const result = checkDraftClaimsAgainstGrounding({
    draft: "We grew xpo to 50k users last year.",
    groundingPacket: {
      durableFacts: ["xpo helps people write and grow faster on x"],
      turnGrounding: [],
      allowedFirstPersonClaims: [],
      allowedNumbers: [],
      forbiddenClaims: ["Do not claim we had 50k users."],
      unknowns: [],
      sourceMaterials: [],
    },
  });

  assert.equal(result.hasUnsupportedClaims, true);
  assert.doesNotMatch(result.draft, /50k users/i);
  assert.match(result.issues.join(" "), /conflicts with grounded facts/i);
});

test("creator profile hints bias default format preference toward thread-first accounts", () => {
  assert.equal(mapPreferredOutputShapeToFormatPreference("thread_seed"), "thread");
  assert.equal(mapPreferredOutputShapeToFormatPreference("long_form_post"), "longform");
  assert.equal(mapPreferredOutputShapeToFormatPreference("reply_candidate"), "shortform");
});

test("creator profile hints can override generic hook types with preferred hook patterns", () => {
  const plan = applyCreatorProfileHintsToPlan(
    {
      objective: "xpo positioning",
      angle: "keep it factual",
      targetLane: "original",
      mustInclude: [],
      mustAvoid: [],
      hookType: "direct",
      pitchResponse: "draft it",
      formatPreference: "shortform",
    },
    {
      preferredOutputShape: "thread_seed",
      threadBias: "high",
      preferredHookPatterns: ["question_open", "story_open"],
      toneGuidelines: ["keep it conversational"],
      ctaPolicy: "Ask for a specific reply, not passive engagement.",
      topExampleSnippets: ["what changed when i stopped forcing polished hooks"],
    },
  );

  assert.equal(plan.hookType, "question open");
});
