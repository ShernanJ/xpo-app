import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import fc from "fast-check";

import {
  evaluateDraftContextSlots,
} from "./draftContextSlots.ts";
import { shouldFastStartGroundedDraft } from "./draftFastStart.ts";
import { resolveConversationRouterState } from "./conversationRouterMachine.ts";
import {
  applyCreatorProfileHintsToPlan,
  mapPreferredOutputShapeToFormatPreference,
} from "./creatorHintPolicy.ts";
import { applySourceMaterialBiasToPlan } from "./sourceMaterialPlanPolicy.ts";
import { buildSourceMaterialDraftConstraints } from "./sourceMaterialDraftPolicy.ts";
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
  buildDraftBundleBriefs,
} from "./draftBundles.ts";
import {
  buildPlanFailureResponse,
  hasStrongDraftCommand,
  inferExplicitDraftFormatPreference,
  isBareIdeationRequest,
  isBareDraftRequest,
  isMultiDraftRequest,
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
import { getDeterministicChatReply } from "./chatResponderDeterministic.ts";

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

test("filler-prefixed draft commands still count as bare draft requests", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(
        "yes",
        "yeah",
        "yep",
        "ok",
        "okay",
        "just",
        "please",
        "actually",
        "i mean",
        "no i mean",
      ),
      fc.constantFrom("write me a post", "write me a thread", "draft a post", "make me a post"),
      fc.constantFrom("", ".", "!", "?"),
      (prefix, baseCommand, punctuation) => {
        assert.equal(
          isBareDraftRequest(`${prefix} ${baseCommand}${punctuation}`),
          true,
        );
      },
    ),
    { numRuns: 40 },
  );
});

test("multi-draft prompts are detected deterministically", () => {
  assert.equal(isMultiDraftRequest("generate me multiple posts i can use"), true);
  assert.equal(isMultiDraftRequest("draft 4 posts about growing my company"), true);
  assert.equal(isMultiDraftRequest("draft 4 posts from what you know about me"), true);
  assert.equal(isMultiDraftRequest("give me a random post i would use"), true);
  assert.equal(isMultiDraftRequest("write me a post"), false);
});

test("explicit draft format cues prefer post or thread wording over profile bias", () => {
  assert.equal(inferExplicitDraftFormatPreference("write me a post"), "shortform");
  assert.equal(inferExplicitDraftFormatPreference("turn this into a post"), "shortform");
  assert.equal(inferExplicitDraftFormatPreference("write me a thread"), "thread");
});

test("generic draft asks still fall back to creator-profile format hints", () => {
  const hintedFallback =
    mapPreferredOutputShapeToFormatPreference("thread_seed") || "shortform";

  assert.equal(
    inferExplicitDraftFormatPreference("write me something") || hintedFallback,
    "thread",
  );
  assert.equal(
    inferExplicitDraftFormatPreference("write me a post") || hintedFallback,
    "shortform",
  );
});

test("draft commands with growth language do not collapse into capability chat", () => {
  fc.assert(
    fc.property(
      fc.constantFrom("write me a post", "draft a post", "make me a post"),
      fc.constantFrom("to help me grow", "for growth", "for reach", "to grow on x"),
      (baseCommand, growthTail) => {
        const message = `${baseCommand} ${growthTail}`;

        assert.equal(hasStrongDraftCommand(message), true);
        assert.equal(
          getDeterministicChatReply({
            userMessage: message,
            recentHistory: "",
            userContextString: "",
            activeConstraints: [],
          }),
          null,
        );
        assert.equal(
          resolveConversationMode({
            explicitIntent: null,
            userMessage: message,
            classifiedIntent: "coach",
          }),
          "plan",
        );
      },
    ),
    { numRuns: 20 },
  );
});

test("bundle brief builder creates four distinct framings from saved context", () => {
  const briefs = buildDraftBundleBriefs({
    userMessage: "draft 4 posts about growing my company",
    basePlan: {
      objective: "turn the company growth story into posts",
      angle: "use the story of growing the company",
      targetLane: "original",
      mustInclude: ["Keep it in my voice."],
      mustAvoid: ["No generic platitudes."],
      hookType: "story",
      pitchResponse: "Running with the company-growth story.",
      formatPreference: "shortform",
    },
    sourceMaterials: [
      {
        id: "asset_1",
        userId: "user_1",
        xHandle: "stan",
        type: "story",
        title: "Growth story",
        tags: ["growth", "approved_draft"],
        verified: true,
        claims: ["We grew the company by tightening onboarding first."],
        snippets: ["That onboarding change became the turning point."],
        doNotClaim: [],
        lastUsedAt: null,
        createdAt: new Date("2026-03-01T00:00:00.000Z").toISOString(),
        updatedAt: new Date("2026-03-01T00:00:00.000Z").toISOString(),
      },
    ],
  });

  assert.equal(briefs.length, 4);
  assert.equal(new Set(briefs.map((brief) => brief.prompt)).size, 4);
  assert.deepEqual(
    briefs.map((brief) => brief.id),
    [
      "lesson_reflection",
      "proof_result",
      "mistake_turning_point",
      "playbook_breakdown",
    ],
  );
});

test("diagnostic reply explains likely reasons and next actions from diagnostic context", () => {
  const reply = getDeterministicChatReply({
    userMessage: "why am i not getting views",
    recentHistory: "",
    userContextString: "",
    activeConstraints: [],
    diagnosticContext: {
      stage: "1k-10k",
      knownFor: "product lessons",
      reasons: [
        "your positioning is still blurry across the bio and recent posts",
        "recent posts are not repeating the same pillar enough",
      ],
      nextActions: [
        "tighten the bio around one promise",
        "publish three posts from the same pillar this week",
      ],
      recommendedPlaybooks: [
        {
          id: "weekly-series",
          name: "Weekly series",
          whyFit: "this gives the account a more repeatable format.",
        },
      ],
    },
  });

  assert.equal(typeof reply, "string");
  assert.equal(reply.includes("likely reasons:"), true);
  assert.equal(reply.includes("next actions:"), true);
  assert.equal(reply.includes("full breakdown is there if you want it."), true);
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

test("conversation router machine prioritizes pending plan approval", () => {
  assert.equal(
    resolveConversationRouterState({
      explicitIntent: null,
      mode: "planner_feedback",
      conversationState: "plan_pending_approval",
      hasPendingPlan: true,
      hasOutstandingClarification: false,
      shouldAutoDraftFromPlan: false,
      hasEnoughContextToAct: false,
      clarificationBranchKey: null,
    }),
    "approve_pending_plan",
  );
});

test("conversation router machine opens the clarification gate only when plan context is thin", () => {
  assert.equal(
    resolveConversationRouterState({
      explicitIntent: null,
      mode: "plan",
      conversationState: "needs_more_context",
      hasPendingPlan: false,
      hasOutstandingClarification: false,
      shouldAutoDraftFromPlan: false,
      hasEnoughContextToAct: false,
      clarificationBranchKey: null,
    }),
    "clarify_before_generation",
  );
  assert.equal(
    resolveConversationRouterState({
      explicitIntent: null,
      mode: "plan",
      conversationState: "needs_more_context",
      hasPendingPlan: false,
      hasOutstandingClarification: true,
      shouldAutoDraftFromPlan: false,
      hasEnoughContextToAct: false,
      clarificationBranchKey: null,
    }),
    "continue",
  );
  assert.equal(
    resolveConversationRouterState({
      explicitIntent: null,
      mode: "plan",
      conversationState: "needs_more_context",
      hasPendingPlan: false,
      hasOutstandingClarification: false,
      shouldAutoDraftFromPlan: true,
      hasEnoughContextToAct: false,
      clarificationBranchKey: null,
    }),
    "continue",
  );
});

test("lets do it now falls through to the controller when a plan is pending", () => {
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

  assert.equal(turnPlan, null);
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

  assert.equal(turnPlan, null);
});

test("memory-grounded multi-draft requests auto-draft from saved context", () => {
  const turnPlan = planTurn({
    userMessage: "draft 4 posts from what you know about me",
    recentHistory: "assistant: none",
    memory: {
      conversationState: "needs_more_context",
      concreteAnswerCount: 2,
      topicSummary: "x growth lessons from building stanley",
      pendingPlan: null,
      currentDraftArtifactId: null,
      activeConstraints: [],
      assistantTurnCount: 0,
      unresolvedQuestion: null,
    },
  });

  assert.equal(turnPlan, null);
});

test("growth phrasing inside a draft request does not route to coach chat", () => {
  const turnPlan = planTurn({
    userMessage: "write me a post to help me grow",
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

  assert.notEqual(turnPlan?.overrideClassifiedIntent, "coach");
  assert.equal(
    resolveConversationMode({
      explicitIntent: null,
      userMessage: "write me a post to help me grow",
      classifiedIntent: "coach",
    }),
    "plan",
  );
});

test("missing-draft improvement requests stay in coach mode until a draft is provided", () => {
  const turnPlan = planTurn({
    userMessage: "help me improve this draft",
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

  assert.equal(turnPlan?.overrideClassifiedIntent, "coach");
  assert.equal(turnPlan?.shouldGenerate, false);
});

test("planner failure replies preserve the captured reason", () => {
  assert.equal(
    buildPlanFailureResponse("the planner returned invalid JSON"),
    "Failed to generate strategy plan because the planner returned invalid JSON.",
  );
  assert.equal(
    buildPlanFailureResponse(null),
    "Failed to generate strategy plan.",
  );
});

test("fast-start draft path triggers for bare requests with saved grounded sources", () => {
  assert.equal(
    shouldFastStartGroundedDraft({
      userMessage: "write me a post",
      mode: "plan",
      explicitIntent: null,
      hasActiveDraft: false,
      memoryTopicSummary: null,
      hasTopicGrounding: false,
      groundingSourceCount: 2,
      turnGroundingCount: 0,
      creatorHintsAvailable: true,
    }),
    true,
  );
});

test("fast-start draft path triggers for topical requests with recent grounded facts", () => {
  assert.equal(
    shouldFastStartGroundedDraft({
      userMessage: "write me a post about xpo onboarding",
      mode: "plan",
      explicitIntent: null,
      hasActiveDraft: false,
      memoryTopicSummary: null,
      hasTopicGrounding: true,
      groundingSourceCount: 0,
      turnGroundingCount: 1,
      creatorHintsAvailable: false,
    }),
    true,
  );
});

test("fast-start draft path does not trigger without grounding", () => {
  assert.equal(
    shouldFastStartGroundedDraft({
      userMessage: "write me a post",
      mode: "plan",
      explicitIntent: null,
      hasActiveDraft: false,
      memoryTopicSummary: null,
      hasTopicGrounding: false,
      groundingSourceCount: 0,
      turnGroundingCount: 0,
      creatorHintsAvailable: true,
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

test("grounding packet lets correction locks override stale positive facts and source material", () => {
  const packet = buildGroundingPacket({
    styleCard: {
      sentenceOpenings: [],
      sentenceClosers: [],
      pacing: "direct",
      emojiPatterns: [],
      slangAndVocabulary: [],
      formattingRules: [],
      customGuidelines: [],
      contextAnchors: ["xpo generates hashtags automatically"],
      factLedger: {
        durableFacts: ["xpo generates hashtags automatically"],
        allowedFirstPersonClaims: ["We generate hashtags automatically for every post."],
        allowedNumbers: [],
        forbiddenClaims: [],
        sourceMaterials: [
          {
            type: "story",
            title: "Hashtag workflow",
            claims: ["xpo generates hashtags automatically"],
            snippets: ["We generate hashtags automatically for every post."],
          },
        ],
      },
      antiExamples: [],
    },
    activeConstraints: ["Correction lock: xpo doesn't generate hashtags automatically"],
    extractedFacts: null,
  });

  assert.equal(
    packet.durableFacts.includes("xpo doesn't generate hashtags automatically"),
    true,
  );
  assert.equal(packet.durableFacts.includes("xpo generates hashtags automatically"), false);
  assert.equal(
    packet.forbiddenClaims.some((entry) => /do not claim xpo generates hashtags automatically/i.test(entry)),
    true,
  );
  assert.equal(
    packet.allowedFirstPersonClaims.includes("We generate hashtags automatically for every post."),
    false,
  );
  assert.equal(packet.sourceMaterials.length, 0);
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

test("claim checker preserves grounded dates entities places and scale claims", () => {
  const groundedLine =
    "In January 2025, Shopify's growth team used Xpo in Toronto with 12,000 users in the pilot.";
  const result = checkDraftClaimsAgainstGrounding({
    draft: groundedLine,
    groundingPacket: {
      durableFacts: [],
      turnGrounding: [],
      allowedFirstPersonClaims: [],
      allowedNumbers: ["12,000"],
      forbiddenClaims: [],
      unknowns: [],
      sourceMaterials: [
        {
          type: "case_study",
          title: "Shopify pilot",
          claims: [groundedLine],
          snippets: [],
        },
      ],
    },
  });

  assert.equal(result.hasUnsupportedClaims, false);
  assert.match(result.draft, /January 2025/i);
  assert.match(result.draft, /Shopify/i);
  assert.match(result.draft, /Toronto/i);
  assert.match(result.draft, /12,000 users/i);
});

test("claim checker strips unsupported product behavior drift even when the product is grounded", () => {
  const result = checkDraftClaimsAgainstGrounding({
    draft: [
      "xpo helps people write and grow faster on x.",
      "xpo schedules posts automatically for every account.",
    ].join("\n"),
    groundingPacket: {
      durableFacts: ["xpo helps people write and grow faster on x."],
      turnGrounding: [],
      allowedFirstPersonClaims: [],
      allowedNumbers: [],
      forbiddenClaims: [],
      unknowns: [],
      sourceMaterials: [],
    },
  });

  assert.equal(result.hasUnsupportedClaims, true);
  assert.match(result.draft, /helps people write and grow faster on x/i);
  assert.doesNotMatch(result.draft, /schedules posts automatically/i);
});

test("claim checker strips unsupported follower spike claims from revision-style additions", () => {
  const result = checkDraftClaimsAgainstGrounding({
    draft: [
      "been in a rabbit hole this week learning how to grow on x.",
      "a few tweaks actually moved the needle with real follower spikes.",
    ].join("\n"),
    groundingPacket: {
      durableFacts: ["been in a rabbit hole this week learning how to grow on x"],
      turnGrounding: [],
      allowedFirstPersonClaims: [],
      allowedNumbers: [],
      forbiddenClaims: [],
      unknowns: ["missing evidence for outcome claims"],
      sourceMaterials: [],
    },
  });

  assert.equal(result.hasUnsupportedClaims, true);
  assert.match(result.draft, /rabbit hole this week learning how to grow on x/i);
  assert.doesNotMatch(result.draft, /moved the needle|follower spikes/i);
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

test("claim checker catches forbidden claims even when wording drifts", () => {
  const result = checkDraftClaimsAgainstGrounding({
    draft: "Xpo will auto-generate hashtags for every post.",
    groundingPacket: {
      durableFacts: ["xpo helps people write and grow faster on x"],
      turnGrounding: [],
      allowedFirstPersonClaims: [],
      allowedNumbers: [],
      forbiddenClaims: ["Do not claim xpo generates hashtags automatically."],
      unknowns: [],
      sourceMaterials: [],
    },
  });

  assert.equal(result.hasUnsupportedClaims, true);
  assert.doesNotMatch(result.draft, /hashtags/i);
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

test("source material bias anchors framework plans to saved playbooks", () => {
  const plan = applySourceMaterialBiasToPlan(
    {
      objective: "hiring lessons",
      angle: "make it useful",
      targetLane: "original",
      mustInclude: [],
      mustAvoid: [],
      hookType: "direct",
      pitchResponse: "draft it",
      formatPreference: "shortform",
    },
    [
      {
        type: "playbook",
        title: "Hiring playbook",
        claims: ["We ask candidates to ship a small demo instead of sending resumes."],
        snippets: ["Ship the work, then talk."],
      },
    ],
    {
      hasAutobiographicalGrounding: true,
    },
  );

  assert.equal(plan.hookType, "playbook");
  assert.equal(
    plan.mustInclude.some((entry) => /saved playbook: Hiring playbook/i.test(entry)),
    true,
  );
  assert.equal(
    plan.mustAvoid.some((entry) => /generic advice or a vague founder story/i.test(entry)),
    true,
  );
});

test("source material bias keeps story plans from inventing extra first-person beats", () => {
  const plan = applySourceMaterialBiasToPlan(
    {
      objective: "customer story",
      angle: "tell the lesson",
      targetLane: "original",
      mustInclude: [],
      mustAvoid: [],
      hookType: "direct",
      pitchResponse: "draft it",
      formatPreference: "thread",
    },
    [
      {
        type: "story",
        title: "Onboarding lesson",
        claims: ["A shorter onboarding flow got more people to finish setup."],
        snippets: ["We cut the tour and more people finished setup."],
      },
    ],
    {
      hasAutobiographicalGrounding: false,
    },
  );

  assert.equal(plan.hookType, "story");
  assert.equal(
    plan.mustAvoid.some((entry) => /do not invent extra first-person beats/i.test(entry)),
    true,
  );
});

test("source material draft constraints keep playbooks structured", () => {
  const constraints = buildSourceMaterialDraftConstraints({
    sourceMaterials: [
      {
        type: "playbook",
        title: "Hiring playbook",
        claims: ["We ask candidates to ship a small demo before interviews."],
        snippets: [],
      },
    ],
    formatPreference: "thread",
    hasAutobiographicalGrounding: true,
  });

  assert.equal(
    constraints.some((entry) => /frame this as a usable playbook/i.test(entry)),
    true,
  );
  assert.equal(
    constraints.some((entry) => /each post carry one step, rule, or decision/i.test(entry)),
    true,
  );
});

test("source material draft constraints keep saved stories literal", () => {
  const constraints = buildSourceMaterialDraftConstraints({
    sourceMaterials: [
      {
        type: "story",
        title: "Onboarding lesson",
        claims: ["We cut the tour and more people finished setup."],
        snippets: [],
      },
    ],
    formatPreference: "shortform",
    hasAutobiographicalGrounding: false,
  });

  assert.equal(
    constraints.some((entry) => /anchored to the saved story beats/i.test(entry)),
    true,
  );
  assert.equal(
    constraints.some((entry) => /do not add extra first-person scenes/i.test(entry)),
    true,
  );
});

test("draft anchor selection keeps historical posts in style-only mode when truth sources exist", () => {
  const source = readFileSync(
    fileURLToPath(new URL("./conversationManager.ts", import.meta.url)),
    "utf8",
  );

  assert.equal(
    source.includes("groundingPacket.sourceMaterials.length > 0"),
    true,
  );
  assert.equal(
    source.includes(
      "kept historical posts in style-only mode because grounded truth sources were already available",
    ),
    true,
  );
  assert.equal(
    source.includes('? "reference_hints"'),
    true,
  );
});

test("unsupported claims force a stricter grounded retry before first-pass delivery", () => {
  const source = readFileSync(
    fileURLToPath(new URL("./conversationManager.ts", import.meta.url)),
    "utf8",
  );

  assert.equal(source.includes("buildUnsupportedClaimRetryConstraint"), true);
  assert.equal(source.includes("hasUnsupportedClaims"), true);
  assert.equal(
    source.includes("!firstAttemptWithClaimCheck.hasUnsupportedClaims"),
    true,
  );
});
