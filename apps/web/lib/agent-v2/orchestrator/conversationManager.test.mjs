import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import fc from "fast-check";

import { loadInitialContextWorkers } from "../workers/contextLoadWorkers.ts";
import { executeDraftBundleCapability } from "../capabilities/drafting/draftBundleExecutor.ts";
import { runDraftBundleCandidateWorkers } from "../workers/draftBundleCandidateWorkers.ts";
import { runDraftGuardValidationWorkers } from "../workers/draftGuardValidationWorkers.ts";
import { loadHistoricalTextWorkers } from "../workers/historicalTextWorkers.ts";
import { hydrateTurnContextWorkers } from "../workers/turnContextHydrationWorkers.ts";
import { executeRevisingCapability } from "../capabilities/revision/revisingCapability.ts";
import {
  buildRuntimeValidationResult,
  buildRuntimeWorkerExecution,
  mergeRuntimeExecutionMeta,
  resolveRuntimeValidationStatus,
} from "../runtime/workerPlane.ts";
import { runDeliveryValidationWorkers } from "../workers/validation/deliveryValidationWorkers.ts";
import { runRevisionValidationWorkers } from "../workers/validation/revisionValidationWorkers.ts";
import { validateDelivery } from "../validators/shared/deliveryValidators.ts";

import {
  evaluateDraftContextSlots,
} from "../capabilities/planning/draftContextSlots.ts";
import {
  shouldFastStartGroundedDraft,
  shouldForceLooseDraftIdeation,
} from "../capabilities/planning/draftFastStart.ts";
import { resolveConversationRouterState } from "../runtime/conversationRouterMachine.ts";
import {
  applyCreatorProfileHintsToPlan,
  mapPreferredOutputShapeToFormatPreference,
} from "../grounding/creatorHintPolicy.ts";
import { applySourceMaterialBiasToPlan } from "../grounding/sourceMaterialPlanPolicy.ts";
import { buildSourceMaterialDraftConstraints } from "../grounding/sourceMaterialDraftPolicy.ts";
import {
  addGroundingUnknowns,
  buildGroundingPacket,
  buildSafeFrameworkConstraint,
  hasAutobiographicalGrounding,
} from "../grounding/groundingPacket.ts";
import {
  buildDirectionChoiceReply,
  buildLooseDirectionReply,
} from "../responses/assistantReplyStyle.ts";
import {
  buildDraftBundleBriefs,
} from "../capabilities/drafting/draftBundles.ts";
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
} from "../grounding/draftGrounding.ts";
import { isMissingDraftCandidateTableError } from "../persistence/prismaGuards.ts";
import { planTurn } from "../runtime/turnPlanner.ts";
import { checkDraftClaimsAgainstGrounding } from "../grounding/claimChecker.ts";
import { getDeterministicChatReply } from "../responses/chatResponderDeterministic.ts";

test("initial context load workers return mergeable outputs for identified users", async () => {
  const result = await loadInitialContextWorkers({
    userId: "user_1",
    effectiveXHandle: "stan",
    userMessage: "write about onboarding",
    recentHistory: "assistant: none",
    services: {
      extractStyleRules: async () => ["avoid emojis"],
      extractCoreFacts: async () => ["User rewrote onboarding in January"],
      getSourceMaterialAssets: async () => [
        {
          id: "asset_1",
          userId: "user_1",
          xHandle: "stan",
          type: "story",
          title: "Onboarding rebuild",
          tags: ["onboarding"],
          verified: true,
          claims: ["The onboarding rewrite cut friction."],
          snippets: ["We rewrote onboarding after seeing drop-off."],
          doNotClaim: [],
          lastUsedAt: null,
          createdAt: "2026-03-01T00:00:00.000Z",
          updatedAt: "2026-03-01T00:00:00.000Z",
        },
      ],
    },
  });

  assert.deepEqual(result.extractedRules, ["avoid emojis"]);
  assert.deepEqual(result.extractedFacts, ["User rewrote onboarding in January"]);
  assert.equal(result.sourceMaterialAssets.length, 1);
  assert.deepEqual(
    result.workerExecutions.map((execution) => ({
      worker: execution.worker,
      phase: execution.phase,
      mode: execution.mode,
      status: execution.status,
      groupId: execution.groupId,
    })),
    [
      {
        worker: "extract_style_rules",
        phase: "context_load",
        mode: "parallel",
        status: "completed",
        groupId: "initial_context_load",
      },
      {
        worker: "extract_core_facts",
        phase: "context_load",
        mode: "parallel",
        status: "completed",
        groupId: "initial_context_load",
      },
      {
        worker: "load_source_material_assets",
        phase: "context_load",
        mode: "parallel",
        status: "completed",
        groupId: "initial_context_load",
      },
    ],
  );
});

test("initial context load workers skip anonymous users without changing outputs", async () => {
  let extractStyleRulesCalls = 0;
  let extractCoreFactsCalls = 0;
  let sourceMaterialCalls = 0;

  const result = await loadInitialContextWorkers({
    userId: "anonymous",
    effectiveXHandle: "default",
    userMessage: "write about onboarding",
    recentHistory: "assistant: none",
    services: {
      extractStyleRules: async () => {
        extractStyleRulesCalls += 1;
        return ["avoid emojis"];
      },
      extractCoreFacts: async () => {
        extractCoreFactsCalls += 1;
        return ["User rewrote onboarding in January"];
      },
      getSourceMaterialAssets: async () => {
        sourceMaterialCalls += 1;
        return [];
      },
    },
  });

  assert.equal(extractStyleRulesCalls, 0);
  assert.equal(extractCoreFactsCalls, 0);
  assert.equal(sourceMaterialCalls, 0);
  assert.equal(result.extractedRules, null);
  assert.equal(result.extractedFacts, null);
  assert.deepEqual(result.sourceMaterialAssets, []);
  assert.deepEqual(
    result.workerExecutions.map((execution) => execution.status),
    ["skipped", "skipped", "skipped"],
  );
});

test("turn context hydration workers return style profile and anchors as mergeable outputs", async () => {
  const result = await hydrateTurnContextWorkers({
    userId: "user_1",
    effectiveXHandle: "stan",
    userMessage: "write about onboarding",
    topicSummary: "fallback topic",
    services: {
      generateStyleProfile: async () => ({
        sentenceOpenings: [],
        sentenceClosers: [],
        pacing: "direct",
        emojiPatterns: [],
        slangAndVocabulary: [],
        formattingRules: [],
        customGuidelines: [],
        contextAnchors: [],
        factLedger: {
          durableFacts: [],
          allowedFirstPersonClaims: [],
          allowedNumbers: [],
          forbiddenClaims: [],
          sourceMaterials: [],
        },
        antiExamples: [],
      }),
      retrieveAnchors: async () => ({
        topicAnchors: ["onboarding systems"],
        laneAnchors: [],
        formatAnchors: [],
        rankedAnchors: [],
      }),
    },
  });

  assert.equal(result.styleCard?.pacing, "direct");
  assert.deepEqual(result.anchors.topicAnchors, ["onboarding systems"]);
  assert.deepEqual(
    result.workerExecutions.map((execution) => ({
      worker: execution.worker,
      phase: execution.phase,
      mode: execution.mode,
      status: execution.status,
      groupId: execution.groupId,
    })),
    [
      {
        worker: "load_style_profile",
        phase: "context_load",
        mode: "parallel",
        status: "completed",
        groupId: "turn_context_hydration",
      },
      {
        worker: "retrieve_anchors",
        phase: "context_load",
        mode: "parallel",
        status: "completed",
        groupId: "turn_context_hydration",
      },
    ],
  );
});

test("draft pipeline keeps continuation inside the chosen workflow instead of rewriting runtime resolution", () => {
  const draftPipelineSource = readFileSync(new URL("./draftPipeline.ts", import.meta.url), "utf8");

  assert.equal(/pipeline_continuation/.test(draftPipelineSource), false);
});

test("draft pipeline delegates grounded draft validation retry to the drafting capability layer", () => {
  const draftPipelineSource = readFileSync(new URL("./draftPipeline.ts", import.meta.url), "utf8");

  assert.match(
    draftPipelineSource,
    /runGroundedDraftRetry/,
  );
  assert.equal(
    /runDraftGuardValidationWorkers/.test(draftPipelineSource),
    false,
  );
  assert.equal(
    /runDeliveryValidationWorkers/.test(draftPipelineSource),
    false,
  );
});

test("draft pipeline delegates active-draft repair coaching to the revision capability layer", () => {
  const draftPipelineSource = readFileSync(new URL("./draftPipeline.ts", import.meta.url), "utf8");

  assert.match(
    draftPipelineSource,
    /handleActiveDraftCoachTurn/,
  );
  assert.match(
    draftPipelineSource,
    /resumeActiveDraftSemanticRepair/,
  );
  assert.equal(
    /buildDraftMeaningResponse\(activeDraft\)/.test(draftPipelineSource),
    false,
  );
  assert.equal(
    /buildSemanticRepairState\(memory\.topicSummary\)/.test(draftPipelineSource),
    false,
  );
});

test("draft pipeline delegates non-draft coach detours to the planning capability layer", () => {
  const draftPipelineSource = readFileSync(new URL("./draftPipeline.ts", import.meta.url), "utf8");

  assert.match(
    draftPipelineSource,
    /handleNonDraftCoachTurn/,
  );
  assert.match(
    draftPipelineSource,
    /handleNonDraftCorrectionTurn/,
  );
  assert.equal(
    /inferPostReferenceReply\(\{/.test(draftPipelineSource),
    false,
  );
  assert.equal(
    /buildSemanticCorrectionAcknowledgment\(\{/.test(draftPipelineSource),
    false,
  );
});

test("draft pipeline delegates plan clarification routing to the planning capability layer", () => {
  const draftPipelineSource = readFileSync(new URL("./draftPipeline.ts", import.meta.url), "utf8");

  assert.match(
    draftPipelineSource,
    /handlePlanClarificationTurn/,
  );
  assert.equal(
    /buildAmbiguousReferenceQuestion\(/.test(draftPipelineSource),
    false,
  );
  assert.equal(
    /branchKey: "career_context_missing"/.test(draftPipelineSource),
    false,
  );
  assert.equal(
    /branchKey: "abstract_topic_focus_pick"/.test(draftPipelineSource),
    false,
  );
});

test("draft pipeline delegates pending-plan decisions to the planning capability layer", () => {
  const draftPipelineSource = readFileSync(new URL("./draftPipeline.ts", import.meta.url), "utf8");

  assert.match(
    draftPipelineSource,
    /handlePendingPlanTurn/,
  );
  assert.equal(
    /interpretPlannerFeedback\(/.test(draftPipelineSource),
    false,
  );
  assert.equal(
    /say the word and i'll draft it, or tell me what to tweak\./.test(draftPipelineSource),
    false,
  );
  assert.equal(
    /latestDraftStatus: "Draft delivered"/.test(draftPipelineSource),
    false,
  );
  assert.equal(
    /buildPlanSourceMessage\(approvedPlan\)/.test(draftPipelineSource),
    false,
  );
});

test("draft pipeline delegates auto-approved plan execution to the planning capability layer", () => {
  const planModeTurnSource = readFileSync(
    new URL("../capabilities/planning/planModeTurn.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    planModeTurnSource,
    /handleAutoApprovedPlanTurn/,
  );
  assert.equal(
    /executeDraftBundleCapability\(/.test(planModeTurnSource),
    false,
  );
  assert.equal(
    /latestDraftStatus: "Rough draft generated"/.test(planModeTurnSource),
    false,
  );
});

test("draft pipeline delegates plan-mode orchestration to the planning capability layer", () => {
  const draftPipelineSource = readFileSync(new URL("./draftPipeline.ts", import.meta.url), "utf8");

  assert.match(
    draftPipelineSource,
    /handlePlanModeTurn/,
  );
  assert.equal(
    /executePlanningCapability\(/.test(draftPipelineSource),
    false,
  );
});

test("draft pipeline delegates revise and replan mode routing to the revision capability layer", () => {
  const draftPipelineSource = readFileSync(new URL("./draftPipeline.ts", import.meta.url), "utf8");

  assert.match(
    draftPipelineSource,
    /handleDraftEditReviewTurn/,
  );
  assert.equal(
    /executeRevisingCapability\(/.test(draftPipelineSource),
    false,
  );
  assert.equal(
    /executeReplanningCapability\(/.test(draftPipelineSource),
    false,
  );
  assert.equal(
    /normalizeDraftRevisionInstruction\(/.test(draftPipelineSource),
    false,
  );
  assert.equal(
    /prisma\.chatMessage\.findFirst\(/.test(draftPipelineSource),
    false,
  );
});

test("conversation manager no longer acts as a helper or service barrel", () => {
  const conversationManagerSource = readFileSync(
    new URL("../runtime/conversationManager.ts", import.meta.url),
    "utf8",
  );

  assert.equal(/export type \{ ConversationServices \}/.test(conversationManagerSource), false);
  assert.equal(/export \{ buildPlanPitch \}/.test(conversationManagerSource), false);
  assert.equal(/export \{\s*isLazyDraftRequest/.test(conversationManagerSource), false);
  assert.equal(/export \{\s*looksGenericTopicSummary/.test(conversationManagerSource), false);
});

test("runtime conversation manager and worker plane stay out of orchestrator once ownership moves", () => {
  assert.equal(existsSync(new URL("./conversationManager.ts", import.meta.url)), false);
  assert.equal(existsSync(new URL("./workerPlane.ts", import.meta.url)), false);

  const disallowedImportPatterns = [
    /agent-v2\/orchestrator\/conversationManager(?:\.ts)?["']/,
    /agent-v2\/orchestrator\/workerPlane(?:\.ts)?["']/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/conversationManager(?:\.ts)?["']/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/workerPlane(?:\.ts)?["']/,
  ];

  const sourceRoots = [
    new URL("../capabilities/", import.meta.url),
    new URL("../runtime/", import.meta.url),
    new URL("../workers/", import.meta.url),
    new URL("../../../app/api/creator/v2/", import.meta.url),
    new URL("../../../scripts/lib/", import.meta.url),
  ];

  for (const root of sourceRoots) {
    for (const entry of readdirSync(root, { recursive: true })) {
      const relativePath = String(entry);
      if (!/\.(?:ts|tsx|js|mjs)$/.test(relativePath)) {
        continue;
      }

      const source = readFileSync(new URL(relativePath, root), "utf8");
      for (const pattern of disallowedImportPatterns) {
        assert.equal(pattern.test(source), false, `${relativePath} -> ${pattern}`);
      }
    }
  }
});

test("orchestrator revision validation shim stays deleted once worker ownership is direct", () => {
  assert.equal(existsSync(new URL("./revisionValidationWorkers.ts", import.meta.url)), false);
});

test("draft pipeline helper blob stays deleted once ownership is split", () => {
  assert.equal(existsSync(new URL("./draftPipelineHelpers.ts", import.meta.url)), false);

  const sourceRoots = [
    new URL("../capabilities/", import.meta.url),
    new URL("../runtime/", import.meta.url),
    new URL("./", import.meta.url),
    new URL("../../../scripts/lib/", import.meta.url),
  ];

  for (const root of sourceRoots) {
    for (const entry of readdirSync(root, { recursive: true })) {
      const relativePath = String(entry);
      if (!/\.(?:ts|tsx|js|mjs)$/.test(relativePath)) {
        continue;
      }

      const source = readFileSync(new URL(relativePath, root), "utf8");
      assert.equal(
        /from ["'][^"']*draftPipelineHelpers(?:\.ts)?["']/.test(source),
        false,
        relativePath,
      );
    }
  }
});

test("grounding leaf modules stay out of orchestrator once ownership moves", () => {
  const deletedModulePaths = [
    "./groundingPacket.ts",
    "./draftGrounding.ts",
    "./claimChecker.ts",
    "./creatorProfileHints.ts",
    "./creatorHintPolicy.ts",
    "./sourceMaterials.ts",
    "./sourceMaterialDraftPolicy.ts",
    "./sourceMaterialPlanPolicy.ts",
  ];

  for (const modulePath of deletedModulePaths) {
    assert.equal(existsSync(new URL(modulePath, import.meta.url)), false, modulePath);
  }

  const disallowedImportPatterns = [
    /agent-v2\/orchestrator\/groundingPacket(?:\.ts)?/,
    /agent-v2\/orchestrator\/draftGrounding(?:\.ts)?/,
    /agent-v2\/orchestrator\/claimChecker(?:\.ts)?/,
    /agent-v2\/orchestrator\/creatorProfileHints(?:\.ts)?/,
    /agent-v2\/orchestrator\/creatorHintPolicy(?:\.ts)?/,
    /agent-v2\/orchestrator\/sourceMaterials(?:\.ts)?/,
    /agent-v2\/orchestrator\/sourceMaterialDraftPolicy(?:\.ts)?/,
    /agent-v2\/orchestrator\/sourceMaterialPlanPolicy(?:\.ts)?/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/groundingPacket(?:\.ts)?["']/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/draftGrounding(?:\.ts)?["']/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/claimChecker(?:\.ts)?["']/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/creatorProfileHints(?:\.ts)?["']/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/creatorHintPolicy(?:\.ts)?["']/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/sourceMaterials(?:\.ts)?["']/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/sourceMaterialDraftPolicy(?:\.ts)?["']/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/sourceMaterialPlanPolicy(?:\.ts)?["']/,
  ];

  const sourceRoots = [
    new URL("../capabilities/", import.meta.url),
    new URL("../grounding/", import.meta.url),
    new URL("../runtime/", import.meta.url),
    new URL("./", import.meta.url),
    new URL("../../../app/api/creator/v2/", import.meta.url),
    new URL("../../../scripts/lib/", import.meta.url),
  ];

  for (const root of sourceRoots) {
    for (const entry of readdirSync(root, { recursive: true })) {
      const relativePath = String(entry);
      if (!/\.(?:ts|tsx|js|mjs)$/.test(relativePath)) {
        continue;
      }

      const source = readFileSync(new URL(relativePath, root), "utf8");
      for (const pattern of disallowedImportPatterns) {
        assert.equal(pattern.test(source), false, `${relativePath} -> ${pattern}`);
      }
    }
  }
});

test("response helper leaf modules stay out of orchestrator once ownership moves", () => {
  const deletedModulePaths = [
    "./assistantReplyStyle.ts",
    "./chatResponder.ts",
    "./chatResponderDeterministic.ts",
    "./chatResponder.test.mjs",
    "./clarificationDraftChips.ts",
    "./constraintAcknowledgment.ts",
    "./correctionRepair.ts",
    "./correctionRepair.test.ts",
    "./draftReply.ts",
    "./feedbackMemoryNotice.ts",
    "./ideationQuickReplies.ts",
    "./ideationReply.ts",
    "./plannerQuickReplies.ts",
  ];

  for (const modulePath of deletedModulePaths) {
    assert.equal(existsSync(new URL(modulePath, import.meta.url)), false, modulePath);
  }

  const disallowedImportPatterns = [
    /agent-v2\/orchestrator\/assistantReplyStyle(?:\.ts)?/,
    /agent-v2\/orchestrator\/chatResponder(?:\.ts)?/,
    /agent-v2\/orchestrator\/chatResponderDeterministic(?:\.ts)?/,
    /agent-v2\/orchestrator\/clarificationDraftChips(?:\.ts)?/,
    /agent-v2\/orchestrator\/constraintAcknowledgment(?:\.ts)?/,
    /agent-v2\/orchestrator\/correctionRepair(?:\.ts)?/,
    /agent-v2\/orchestrator\/draftReply(?:\.ts)?/,
    /agent-v2\/orchestrator\/feedbackMemoryNotice(?:\.ts)?/,
    /agent-v2\/orchestrator\/ideationQuickReplies(?:\.ts)?/,
    /agent-v2\/orchestrator\/ideationReply(?:\.ts)?/,
    /agent-v2\/orchestrator\/plannerQuickReplies(?:\.ts)?/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/assistantReplyStyle(?:\.ts)?["']/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/chatResponder(?:\.ts)?["']/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/chatResponderDeterministic(?:\.ts)?["']/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/clarificationDraftChips(?:\.ts)?["']/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/constraintAcknowledgment(?:\.ts)?["']/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/correctionRepair(?:\.ts)?["']/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/draftReply(?:\.ts)?["']/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/feedbackMemoryNotice(?:\.ts)?["']/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/ideationQuickReplies(?:\.ts)?["']/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/ideationReply(?:\.ts)?["']/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/plannerQuickReplies(?:\.ts)?["']/,
  ];

  const sourceRoots = [
    new URL("../agents/", import.meta.url),
    new URL("../capabilities/", import.meta.url),
    new URL("../responses/", import.meta.url),
    new URL("../runtime/", import.meta.url),
    new URL("./", import.meta.url),
    new URL("../../../app/api/creator/v2/", import.meta.url),
    new URL("../../../scripts/lib/", import.meta.url),
  ];

  for (const root of sourceRoots) {
    for (const entry of readdirSync(root, { recursive: true })) {
      const relativePath = String(entry);
      if (!/\.(?:ts|tsx|js|mjs)$/.test(relativePath)) {
        continue;
      }

      const source = readFileSync(new URL(relativePath, root), "utf8");
      for (const pattern of disallowedImportPatterns) {
        assert.equal(pattern.test(source), false, `${relativePath} -> ${pattern}`);
      }
    }
  }
});

test("worker adapter leaf modules stay out of orchestrator once ownership moves", () => {
  const deletedModulePaths = [
    "./contextLoadWorkers.ts",
    "./historicalTextWorkers.ts",
    "./turnContextHydrationWorkers.ts",
    "./draftGuardValidationWorkers.ts",
    "./draftBundleCandidateWorkers.ts",
  ];

  for (const modulePath of deletedModulePaths) {
    assert.equal(existsSync(new URL(modulePath, import.meta.url)), false, modulePath);
  }

  const disallowedImportPatterns = [
    /agent-v2\/orchestrator\/contextLoadWorkers(?:\.ts)?/,
    /agent-v2\/orchestrator\/historicalTextWorkers(?:\.ts)?/,
    /agent-v2\/orchestrator\/turnContextHydrationWorkers(?:\.ts)?/,
    /agent-v2\/orchestrator\/draftGuardValidationWorkers(?:\.ts)?/,
    /agent-v2\/orchestrator\/draftBundleCandidateWorkers(?:\.ts)?/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/contextLoadWorkers(?:\.ts)?["']/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/historicalTextWorkers(?:\.ts)?["']/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/turnContextHydrationWorkers(?:\.ts)?["']/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/draftGuardValidationWorkers(?:\.ts)?["']/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/draftBundleCandidateWorkers(?:\.ts)?["']/,
  ];

  const sourceRoots = [
    new URL("../capabilities/", import.meta.url),
    new URL("../runtime/", import.meta.url),
    new URL("../workers/", import.meta.url),
    new URL("./", import.meta.url),
    new URL("../../../app/api/creator/v2/", import.meta.url),
    new URL("../../../scripts/lib/", import.meta.url),
  ];

  for (const root of sourceRoots) {
    for (const entry of readdirSync(root, { recursive: true })) {
      const relativePath = String(entry);
      if (!/\.(?:ts|tsx|js|mjs)$/.test(relativePath)) {
        continue;
      }

      const source = readFileSync(new URL(relativePath, root), "utf8");
      for (const pattern of disallowedImportPatterns) {
        assert.equal(pattern.test(source), false, `${relativePath} -> ${pattern}`);
      }
    }
  }
});

test("planning helper leaf modules stay out of orchestrator once ownership moves", () => {
  const deletedModulePaths = [
    "./clarificationTree.ts",
    "./draftFastStart.ts",
    "./draftContextSlots.ts",
    "./plannerFeedback.ts",
    "./plannerFeedback.test.ts",
  ];

  for (const modulePath of deletedModulePaths) {
    assert.equal(existsSync(new URL(modulePath, import.meta.url)), false, modulePath);
  }

  const disallowedImportPatterns = [
    /agent-v2\/orchestrator\/clarificationTree(?:\.ts)?/,
    /agent-v2\/orchestrator\/draftFastStart(?:\.ts)?/,
    /agent-v2\/orchestrator\/draftContextSlots(?:\.ts)?/,
    /agent-v2\/orchestrator\/plannerFeedback(?:\.ts)?/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/clarificationTree(?:\.ts)?["']/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/draftFastStart(?:\.ts)?["']/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/draftContextSlots(?:\.ts)?["']/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/plannerFeedback(?:\.ts)?["']/,
  ];

  const sourceRoots = [
    new URL("../capabilities/", import.meta.url),
    new URL("../grounding/", import.meta.url),
    new URL("../runtime/", import.meta.url),
    new URL("./", import.meta.url),
    new URL("../../../app/api/creator/v2/", import.meta.url),
    new URL("../../../scripts/lib/", import.meta.url),
  ];

  for (const root of sourceRoots) {
    for (const entry of readdirSync(root, { recursive: true })) {
      const relativePath = String(entry);
      if (!/\.(?:ts|tsx|js|mjs)$/.test(relativePath)) {
        continue;
      }

      const source = readFileSync(new URL(relativePath, root), "utf8");
      for (const pattern of disallowedImportPatterns) {
        assert.equal(pattern.test(source), false, `${relativePath} -> ${pattern}`);
      }
    }
  }
});

test("workflow helper leaf modules stay out of orchestrator once ownership moves", () => {
  const deletedModulePaths = [
    "./draftBundles.ts",
    "./draftBundleExecutor.ts",
    "./draftRevision.ts",
    "./replanningExecutor.ts",
    "./replyContinuationPlanner.ts",
    "./replyContinuationPlanner.test.mjs",
    "./replyTurnPlanner.ts",
    "./replyTurnLogic.ts",
  ];

  for (const modulePath of deletedModulePaths) {
    assert.equal(existsSync(new URL(modulePath, import.meta.url)), false, modulePath);
  }

  const disallowedImportPatterns = [
    /agent-v2\/orchestrator\/draftBundles(?:\.ts)?/,
    /agent-v2\/orchestrator\/draftBundleExecutor(?:\.ts)?/,
    /agent-v2\/orchestrator\/draftRevision(?:\.ts)?/,
    /agent-v2\/orchestrator\/replanningExecutor(?:\.ts)?/,
    /agent-v2\/orchestrator\/replyContinuationPlanner(?:\.ts)?/,
    /agent-v2\/orchestrator\/replyTurnPlanner(?:\.ts)?/,
    /agent-v2\/orchestrator\/replyTurnLogic(?:\.ts)?/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/draftBundles(?:\.ts)?["']/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/draftBundleExecutor(?:\.ts)?["']/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/draftRevision(?:\.ts)?["']/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/replanningExecutor(?:\.ts)?["']/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/replyContinuationPlanner(?:\.ts)?["']/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/replyTurnPlanner(?:\.ts)?["']/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/replyTurnLogic(?:\.ts)?["']/,
  ];

  const sourceRoots = [
    new URL("../capabilities/", import.meta.url),
    new URL("../grounding/", import.meta.url),
    new URL("../responses/", import.meta.url),
    new URL("../runtime/", import.meta.url),
    new URL("../workers/", import.meta.url),
    new URL("./", import.meta.url),
    new URL("../../../app/api/creator/v2/", import.meta.url),
    new URL("../../../scripts/lib/", import.meta.url),
  ];

  for (const root of sourceRoots) {
    for (const entry of readdirSync(root, { recursive: true })) {
      const relativePath = String(entry);
      if (!/\.(?:ts|tsx|js|mjs)$/.test(relativePath)) {
        continue;
      }

      const source = readFileSync(new URL(relativePath, root), "utf8");
      for (const pattern of disallowedImportPatterns) {
        assert.equal(pattern.test(source), false, `${relativePath} -> ${pattern}`);
      }
    }
  }
});

test("core and persistence leaf modules stay out of orchestrator once ownership moves", () => {
  const deletedModulePaths = [
    "./prismaGuards.ts",
    "./angleNovelty.ts",
    "./preferenceConstraints.ts",
  ];

  for (const modulePath of deletedModulePaths) {
    assert.equal(existsSync(new URL(modulePath, import.meta.url)), false, modulePath);
  }

  const disallowedImportPatterns = [
    /agent-v2\/orchestrator\/prismaGuards(?:\.ts)?/,
    /agent-v2\/orchestrator\/angleNovelty(?:\.ts)?/,
    /agent-v2\/orchestrator\/preferenceConstraints(?:\.ts)?/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/prismaGuards(?:\.ts)?["']/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/angleNovelty(?:\.ts)?["']/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/preferenceConstraints(?:\.ts)?["']/,
  ];

  const sourceRoots = [
    new URL("../agents/", import.meta.url),
    new URL("../capabilities/", import.meta.url),
    new URL("../core/", import.meta.url),
    new URL("../persistence/", import.meta.url),
    new URL("../runtime/", import.meta.url),
    new URL("./", import.meta.url),
    new URL("../../../app/api/creator/v2/", import.meta.url),
    new URL("../../../scripts/lib/", import.meta.url),
  ];

  for (const root of sourceRoots) {
    for (const entry of readdirSync(root, { recursive: true })) {
      const relativePath = String(entry);
      if (!/\.(?:ts|tsx|js|mjs)$/.test(relativePath)) {
        continue;
      }

      const source = readFileSync(new URL(relativePath, root), "utf8");
      for (const pattern of disallowedImportPatterns) {
        assert.equal(pattern.test(source), false, `${relativePath} -> ${pattern}`);
      }
    }
  }
});

test("drafting leaf helpers stay out of orchestrator once ownership moves", () => {
  const deletedPaths = [
    "./selectedAnglePrompt.ts",
    "./selectedAnglePrompt.test.ts",
  ];
  for (const relativePath of deletedPaths) {
    assert.equal(
      existsSync(new URL(relativePath, import.meta.url)),
      false,
      `${relativePath} should be deleted from orchestrator`,
    );
  }

  const disallowedImportPatterns = [
    /agent-v2\/orchestrator\/selectedAnglePrompt(?:\.ts)?/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/selectedAnglePrompt(?:\.ts)?["']/,
  ];

  const sourceRoots = [
    new URL("../agents/", import.meta.url),
    new URL("../capabilities/", import.meta.url),
    new URL("../runtime/", import.meta.url),
    new URL("./", import.meta.url),
    new URL("../../../app/api/creator/v2/", import.meta.url),
    new URL("../../../scripts/lib/", import.meta.url),
  ];

  for (const root of sourceRoots) {
    for (const entry of readdirSync(root, { recursive: true })) {
      const relativePath = String(entry);
      if (!/\.(?:ts|tsx|js|mjs)$/.test(relativePath)) {
        continue;
      }

      const source = readFileSync(new URL(relativePath, root), "utf8");
      for (const pattern of disallowedImportPatterns) {
        assert.equal(pattern.test(source), false, `${relativePath} -> ${pattern}`);
      }
    }
  }
});

test("runtime diagnostics contract stays out of orchestrator once ownership moves", () => {
  assert.equal(existsSync(new URL("./conversationalDiagnostics.ts", import.meta.url)), false);

  const disallowedImportPatterns = [
    /agent-v2\/orchestrator\/conversationalDiagnostics(?:\.ts)?/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/conversationalDiagnostics(?:\.ts)?["']/,
  ];

  const sourceRoots = [
    new URL("../responses/", import.meta.url),
    new URL("../runtime/", import.meta.url),
    new URL("./", import.meta.url),
    new URL("../../../app/api/creator/v2/", import.meta.url),
  ];

  for (const root of sourceRoots) {
    for (const entry of readdirSync(root, { recursive: true })) {
      const relativePath = String(entry);
      if (!/\.(?:ts|tsx|js|mjs)$/.test(relativePath)) {
        continue;
      }

      const source = readFileSync(new URL(relativePath, root), "utf8");
      for (const pattern of disallowedImportPatterns) {
        assert.equal(pattern.test(source), false, `${relativePath} -> ${pattern}`);
      }
    }
  }
});

test("runtime router machine stays out of orchestrator once ownership moves", () => {
  assert.equal(existsSync(new URL("./conversationRouterMachine.ts", import.meta.url)), false);

  const disallowedImportPatterns = [
    /agent-v2\/orchestrator\/conversationRouterMachine(?:\.ts)?/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/conversationRouterMachine(?:\.ts)?["']/,
  ];

  const sourceRoots = [
    new URL("../runtime/", import.meta.url),
    new URL("./", import.meta.url),
  ];

  for (const root of sourceRoots) {
    for (const entry of readdirSync(root, { recursive: true })) {
      const relativePath = String(entry);
      if (!/\.(?:ts|tsx|js|mjs)$/.test(relativePath)) {
        continue;
      }

      const source = readFileSync(new URL(relativePath, root), "utf8");
      for (const pattern of disallowedImportPatterns) {
        assert.equal(pattern.test(source), false, `${relativePath} -> ${pattern}`);
      }
    }
  }
});

test("runtime response envelope stays out of orchestrator once ownership moves", () => {
  assert.equal(existsSync(new URL("./responseEnvelope.ts", import.meta.url)), false);
  assert.equal(existsSync(new URL("./responseEnvelope.test.mjs", import.meta.url)), false);

  const disallowedImportPatterns = [
    /agent-v2\/orchestrator\/responseEnvelope(?:\.ts)?/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/responseEnvelope(?:\.ts)?["']/,
  ];

  const sourceRoots = [
    new URL("../runtime/", import.meta.url),
    new URL("./", import.meta.url),
  ];

  for (const root of sourceRoots) {
    for (const entry of readdirSync(root, { recursive: true })) {
      const relativePath = String(entry);
      if (!/\.(?:ts|tsx|js|mjs)$/.test(relativePath)) {
        continue;
      }

      const source = readFileSync(new URL(relativePath, root), "utf8");
      for (const pattern of disallowedImportPatterns) {
        assert.equal(pattern.test(source), false, `${relativePath} -> ${pattern}`);
      }
    }
  }
});

test("runtime response shaper stays out of orchestrator once ownership moves", () => {
  assert.equal(existsSync(new URL("./responseShaper.ts", import.meta.url)), false);
  assert.equal(existsSync(new URL("./responseShaper.test.mjs", import.meta.url)), false);

  const disallowedImportPatterns = [
    /agent-v2\/orchestrator\/responseShaper(?:\.ts)?/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/responseShaper(?:\.ts)?["']/,
  ];

  const sourceRoots = [
    new URL("../runtime/", import.meta.url),
    new URL("../../../app/api/creator/v2/", import.meta.url),
    new URL("./", import.meta.url),
  ];

  for (const root of sourceRoots) {
    for (const entry of readdirSync(root, { recursive: true })) {
      const relativePath = String(entry);
      if (!/\.(?:ts|tsx|js|mjs)$/.test(relativePath)) {
        continue;
      }

      const source = readFileSync(new URL(relativePath, root), "utf8");
      for (const pattern of disallowedImportPatterns) {
        assert.equal(pattern.test(source), false, `${relativePath} -> ${pattern}`);
      }
    }
  }
});

test("runtime surface mode selector stays out of orchestrator once ownership moves", () => {
  assert.equal(existsSync(new URL("./surfaceModeSelector.ts", import.meta.url)), false);

  const disallowedImportPatterns = [
    /agent-v2\/orchestrator\/surfaceModeSelector(?:\.ts)?/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/surfaceModeSelector(?:\.ts)?["']/,
  ];

  const sourceRoots = [
    new URL("../runtime/", import.meta.url),
    new URL("../../../app/api/creator/v2/", import.meta.url),
    new URL("./", import.meta.url),
  ];

  for (const root of sourceRoots) {
    for (const entry of readdirSync(root, { recursive: true })) {
      const relativePath = String(entry);
      if (!/\.(?:ts|tsx|js|mjs)$/.test(relativePath)) {
        continue;
      }

      const source = readFileSync(new URL(relativePath, root), "utf8");
      for (const pattern of disallowedImportPatterns) {
        assert.equal(pattern.test(source), false, `${relativePath} -> ${pattern}`);
      }
    }
  }
});

test("runtime turn relation helper stays out of orchestrator once ownership moves", () => {
  assert.equal(existsSync(new URL("./turnRelation.ts", import.meta.url)), false);

  const disallowedImportPatterns = [
    /agent-v2\/orchestrator\/turnRelation(?:\.ts)?/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/turnRelation(?:\.ts)?["']/,
  ];

  const sourceRoots = [
    new URL("../capabilities/", import.meta.url),
    new URL("../responses/", import.meta.url),
    new URL("../runtime/", import.meta.url),
    new URL("./", import.meta.url),
  ];

  for (const root of sourceRoots) {
    for (const entry of readdirSync(root, { recursive: true })) {
      const relativePath = String(entry);
      if (!/\.(?:ts|tsx|js|mjs)$/.test(relativePath)) {
        continue;
      }

      const source = readFileSync(new URL(relativePath, root), "utf8");
      for (const pattern of disallowedImportPatterns) {
        assert.equal(pattern.test(source), false, `${relativePath} -> ${pattern}`);
      }
    }
  }
});

test("runtime turn planner stays out of orchestrator once ownership moves", () => {
  assert.equal(existsSync(new URL("./turnPlanner.ts", import.meta.url)), false);

  const disallowedImportPatterns = [
    /agent-v2\/orchestrator\/turnPlanner(?:\.ts)?/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/turnPlanner(?:\.ts)?["']/,
  ];

  const sourceRoots = [
    new URL("../runtime/", import.meta.url),
    new URL("../regressions/", import.meta.url),
    new URL("./", import.meta.url),
  ];

  for (const root of sourceRoots) {
    for (const entry of readdirSync(root, { recursive: true })) {
      const relativePath = String(entry);
      if (!/\.(?:ts|tsx|js|mjs)$/.test(relativePath)) {
        continue;
      }

      const source = readFileSync(new URL(relativePath, root), "utf8");
      for (const pattern of disallowedImportPatterns) {
        assert.equal(pattern.test(source), false, `${relativePath} -> ${pattern}`);
      }
    }
  }
});

test("runtime context-routing-memory helpers stay out of orchestrator once ownership moves", () => {
  const deletedModulePaths = [
    "./turnContextBuilder.ts",
    "./routingPolicy.ts",
    "./memoryPolicy.ts",
  ];

  for (const modulePath of deletedModulePaths) {
    assert.equal(existsSync(new URL(modulePath, import.meta.url)), false, modulePath);
  }

  const disallowedImportPatterns = [
    /agent-v2\/orchestrator\/turnContextBuilder(?:\.ts)?/,
    /agent-v2\/orchestrator\/routingPolicy(?:\.ts)?/,
    /agent-v2\/orchestrator\/memoryPolicy(?:\.ts)?/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/turnContextBuilder(?:\.ts)?["']/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/routingPolicy(?:\.ts)?["']/,
    /from ["']\.\.?\/(?:\.\.\/)*orchestrator\/memoryPolicy(?:\.ts)?["']/,
  ];

  const sourceRoots = [
    new URL("../capabilities/", import.meta.url),
    new URL("../runtime/", import.meta.url),
    new URL("./", import.meta.url),
  ];

  for (const root of sourceRoots) {
    for (const entry of readdirSync(root, { recursive: true })) {
      const relativePath = String(entry);
      if (!/\.(?:ts|tsx|js|mjs)$/.test(relativePath)) {
        continue;
      }

      const source = readFileSync(new URL(relativePath, root), "utf8");
      for (const pattern of disallowedImportPatterns) {
        assert.equal(pattern.test(source), false, `${relativePath} -> ${pattern}`);
      }
    }
  }
});

test("turn context hydration workers fall back to topic summary when the message is empty", async () => {
  let seenFocusTopic = null;

  const result = await hydrateTurnContextWorkers({
    userId: "user_1",
    effectiveXHandle: "stan",
    userMessage: "",
    topicSummary: "x growth systems",
    services: {
      generateStyleProfile: async () => null,
      retrieveAnchors: async (_userId, _xHandle, focusTopic) => {
        seenFocusTopic = focusTopic;
        return {
          topicAnchors: [],
          laneAnchors: [],
          formatAnchors: [],
          rankedAnchors: [],
        };
      },
    },
  });

  assert.equal(seenFocusTopic, "x growth systems");
  assert.equal(result.workerExecutions[0]?.details?.hasStyleCard, false);
  assert.equal(result.workerExecutions[1]?.details?.focusTopic, "x growth systems");
});

test("historical text workers merge posts and queued draft candidates for novelty checks", async () => {
  const result = await loadHistoricalTextWorkers({
    userId: "user_1",
    xHandle: "stan",
    capability: "drafting",
    loadPosts: async () => [
      { text: "first shipped post" },
      { text: "second shipped post" },
    ],
    loadDraftCandidates: async () => [
      { artifact: { content: "queued draft one" } },
      { artifact: { content: "queued draft two" } },
      { artifact: { content: 42 } },
    ],
  });

  assert.deepEqual(result.texts, [
    "first shipped post",
    "second shipped post",
    "queued draft one",
    "queued draft two",
  ]);
  assert.deepEqual(
    result.workerExecutions.map((execution) => ({
      worker: execution.worker,
      capability: execution.capability,
      phase: execution.phase,
      mode: execution.mode,
      status: execution.status,
      groupId: execution.groupId,
    })),
    [
      {
        worker: "load_historical_posts",
        capability: "drafting",
        phase: "execution",
        mode: "parallel",
        status: "completed",
        groupId: "historical_text_load",
      },
      {
        worker: "load_queued_draft_candidates",
        capability: "drafting",
        phase: "execution",
        mode: "parallel",
        status: "completed",
        groupId: "historical_text_load",
      },
    ],
  );
});

test("draft guard validation workers merge deterministic drift checks as parallel validators", async () => {
  const result = await runDraftGuardValidationWorkers({
    capability: "drafting",
    groupId: "draft_guard_validation_initial",
    sourceUserMessage: "write one about playing league at the stan office against the ceo",
    draft:
      "I lost a league game at the stan office against the ceo and then built an analytics dashboard to fix growth.",
    activeConstraints: [],
  });

  assert.equal(result.concreteSceneAssessment.hasDrift, true);
  assert.equal(result.groundedProductAssessment.hasDrift, false);
  assert.deepEqual(
    result.workerExecutions.map((execution) => ({
      worker: execution.worker,
      phase: execution.phase,
      mode: execution.mode,
      status: execution.status,
      groupId: execution.groupId,
    })),
    [
      {
        worker: "concrete_scene_guard",
        phase: "validation",
        mode: "parallel",
        status: "completed",
        groupId: "draft_guard_validation_initial",
      },
      {
        worker: "grounded_product_guard",
        phase: "validation",
        mode: "parallel",
        status: "completed",
        groupId: "draft_guard_validation_initial",
      },
    ],
  );
  assert.deepEqual(
    result.validations.map((validation) => validation.validator),
    ["concrete_scene_guard", "grounded_product_guard"],
  );
  assert.deepEqual(
    result.validations.map((validation) => validation.status),
    ["failed", "passed"],
  );
});

test("draft bundle candidate workers parallelize initial sibling generation and preserve merge order", async () => {
  const seenPrompts = [];
  const result = await runDraftBundleCandidateWorkers({
    capability: "drafting",
    basePlan: {
      objective: "Turn onboarding lessons into posts",
      angle: "Use concrete onboarding wins",
      targetLane: "original",
      mustInclude: ["Keep it concrete."],
      mustAvoid: ["No generic advice."],
      hookType: "story",
      pitchResponse: "let's draft a few options",
      formatPreference: "shortform",
    },
    bundleBriefs: [
      {
        id: "lesson_reflection",
        label: "Lesson / Reflection",
        prompt: "Write the reflective option.",
        objective: "Reflect on the onboarding lesson",
        angle: "Lead with the shift in perspective",
        hookType: "lesson",
        mustInclude: ["Lead with the lesson."],
        mustAvoid: ["Do not sound procedural."],
      },
      {
        id: "proof_result",
        label: "Proof / Result",
        prompt: "Write the proof option.",
        objective: "Show the onboarding result",
        angle: "Lead with the result",
        hookType: "proof",
        mustInclude: ["Open with the result."],
        mustAvoid: ["Do not sound vague."],
      },
    ],
    activeConstraints: ["Keep it first person."],
    draftPreference: "balanced",
    topicSummary: "onboarding lessons",
    turnFormatPreference: "shortform",
    services: {
      runSingleDraft: async ({ plan, sourceUserMessage }) => {
        seenPrompts.push(sourceUserMessage);
        return {
          kind: "success",
          writerOutput: {
            angle: plan.angle,
            draft: `draft for ${plan.objective}`,
            supportAsset: `asset for ${plan.objective}`,
            whyThisWorks: "",
            watchOutFor: "",
          },
          criticOutput: {
            approved: true,
            finalAngle: plan.angle,
            finalDraft: `final for ${plan.objective}`,
            issues: [],
          },
          draftToDeliver: `final for ${plan.objective}`,
          voiceTarget: {
            casing: "normal",
            compression: "tight",
            formality: "neutral",
            hookStyle: "blunt",
            emojiPolicy: "none",
            ctaPolicy: "none",
            risk: "safe",
            lane: "original",
            summary: "tight original post",
            rationale: [],
          },
          retrievalReasons: [`anchor for ${plan.objective}`],
          threadFramingStyle: null,
          workers: [
            {
              worker: "claim_checker",
              capability: "drafting",
              phase: "validation",
              mode: "sequential",
              status: "completed",
              groupId: null,
              details: {
                status: "passed",
              },
            },
          ],
          validations: [
            {
              validator: "claim_checker",
              capability: "drafting",
              status: "passed",
              issues: [],
              corrected: false,
            },
          ],
        };
      },
    },
  });

  assert.deepEqual(seenPrompts, [
    "Write the reflective option.",
    "Write the proof option.",
  ]);
  assert.deepEqual(
    result.candidates.map((candidate) => candidate.brief.id),
    ["lesson_reflection", "proof_result"],
  );
  assert.deepEqual(
    result.workerExecutions.map((execution) => ({
      worker: execution.worker,
      mode: execution.mode,
      groupId: execution.groupId,
    })),
    [
      {
        worker: "generate_bundle_candidate",
        mode: "parallel",
        groupId: "draft_bundle_initial_candidates",
      },
      {
        worker: "claim_checker",
        mode: "sequential",
        groupId: null,
      },
      {
        worker: "generate_bundle_candidate",
        mode: "parallel",
        groupId: "draft_bundle_initial_candidates",
      },
      {
        worker: "claim_checker",
        mode: "sequential",
        groupId: null,
      },
    ],
  );
  assert.deepEqual(
    result.validations.map((validation) => validation.validator),
    ["claim_checker", "claim_checker"],
  );
});

test("draft bundle capability keeps sibling novelty retries sequential and explicit", async () => {
  const seenDraftRequests = [];
  const execution = await executeDraftBundleCapability({
    workflow: "plan_then_draft",
    capability: "drafting",
    context: {
      userMessage: "write 4 post options about lessons from fixing onboarding",
      memory: {
        rollingSummary: null,
      },
      plan: {
        objective: "Share onboarding lessons",
        angle: "Use a concrete onboarding moment",
        targetLane: "original",
        mustInclude: ["Keep it concrete."],
        mustAvoid: ["No generic advice."],
        hookType: "story",
        pitchResponse: "here are a few routes",
        formatPreference: "shortform",
      },
      activeConstraints: ["Stay grounded."],
      sourceMaterials: [],
      draftPreference: "balanced",
      topicSummary: "onboarding lessons",
      groundingPacket: undefined,
      historicalTexts: [],
      turnFormatPreference: "shortform",
      nextAssistantTurnCount: 3,
      refreshRollingSummary: false,
      feedbackMemoryNotice: null,
      groundingSources: [],
      groundingMode: null,
      groundingExplanation: null,
    },
    services: {
      runSingleDraft: async ({ plan, sourceUserMessage, activeConstraints }) => {
        seenDraftRequests.push({
          sourceUserMessage,
          activeConstraints,
        });

        const isSequentialRetry = sourceUserMessage.includes(
          "Keep it clearly distinct from the earlier bundle options.",
        );
        const draftToDeliver = isSequentialRetry
          ? "proof option rewritten to be distinct"
          : plan.hookType === "lesson" || plan.hookType === "proof"
            ? "shared sibling draft"
            : `unique draft for ${plan.hookType}`;

        return {
          kind: "success",
          writerOutput: {
            angle: plan.angle,
            draft: draftToDeliver,
            supportAsset: `asset for ${plan.hookType}`,
            whyThisWorks: "",
            watchOutFor: "",
          },
          criticOutput: {
            approved: true,
            finalAngle: plan.angle,
            finalDraft: draftToDeliver,
            issues: [],
          },
          draftToDeliver,
          voiceTarget: {
            casing: "normal",
            compression: "tight",
            formality: "neutral",
            hookStyle: "blunt",
            emojiPolicy: "none",
            ctaPolicy: "none",
            risk: "safe",
            lane: "original",
            summary: "tight original post",
            rationale: [],
          },
          retrievalReasons: [`anchor for ${plan.hookType}`],
          threadFramingStyle: null,
          workers: [],
          validations: [],
        };
      },
      checkDeterministicNovelty: (draft, historicalTexts) => ({
        isNovel: !historicalTexts.includes(draft),
        reason: historicalTexts.includes(draft) ? "matched earlier sibling draft" : null,
        maxSimilarity: historicalTexts.includes(draft) ? 0.96 : 0.12,
      }),
      buildNoveltyNotes: ({ noveltyCheck }) =>
        noveltyCheck?.reason ? [noveltyCheck.reason] : [],
    },
  });

  assert.equal(execution.output.kind, "draft_bundle_ready");
  assert.equal(
    seenDraftRequests.filter((request) =>
      request.sourceUserMessage.includes("Keep it clearly distinct from the earlier bundle options."),
    ).length,
    1,
  );
  assert.ok(
    seenDraftRequests.some((request) =>
      request.activeConstraints.includes(
        'Sibling novelty: make "Proof / Result" clearly distinct from the earlier bundle options.',
      ),
    ),
  );
  assert.deepEqual(
    execution.workers.filter(
      (worker) => worker.worker === "retry_bundle_candidate_for_sibling_novelty",
    ),
    [
      {
        worker: "retry_bundle_candidate_for_sibling_novelty",
        capability: "drafting",
        phase: "execution",
        mode: "sequential",
        status: "completed",
        groupId: "draft_bundle_sibling_retry",
        details: {
          briefId: "proof_result",
          label: "Proof / Result",
          reason: "matched earlier sibling draft",
          dependsOnEarlierOptions: true,
          earlierOptionCount: 1,
        },
      },
    ],
  );
});

test("revision validation workers isolate deterministic revision claim checks", () => {
  const result = runRevisionValidationWorkers({
    capability: "revising",
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
    formatPreference: "shortform",
    sourceUserMessage: "tighten this revision",
  });

  assert.equal(result.claimCheck.hasUnsupportedClaims, true);
  assert.deepEqual(
    result.workerExecutions.map((execution) => ({
      worker: execution.worker,
      phase: execution.phase,
      mode: execution.mode,
      status: execution.status,
      groupId: execution.groupId,
    })),
    [
      {
        worker: "claim_checker",
        phase: "validation",
        mode: "sequential",
        status: "completed",
        groupId: "revision_delivery_validation_initial",
      },
      {
        worker: "truncation_guard",
        phase: "validation",
        mode: "sequential",
        status: "completed",
        groupId: "revision_delivery_validation_initial",
      },
      {
        worker: "prompt_echo_guard",
        phase: "validation",
        mode: "sequential",
        status: "completed",
        groupId: "revision_delivery_validation_initial",
      },
      {
        worker: "artifact_shape_guard",
        phase: "validation",
        mode: "sequential",
        status: "completed",
        groupId: "revision_delivery_validation_initial",
      },
      {
        worker: "thread_shape_guard",
        phase: "validation",
        mode: "sequential",
        status: "skipped",
        groupId: "revision_delivery_validation_initial",
      },
    ],
  );
  assert.deepEqual(
    result.validations.map((validation) => validation.validator),
    [
      "claim_checker",
      "truncation_guard",
      "prompt_echo_guard",
      "artifact_shape_guard",
    ],
  );
});

test("delivery validators catch truncation, prompt echo, artifact mismatch, and malformed thread shape", () => {
  assert.deepEqual(
    validateDelivery({
      draft: "shipped the update and",
      formatPreference: "shortform",
      sourceUserMessage: "write me a post about the update",
    }).issues.map((issue) => issue.code),
    ["truncation"],
  );

  assert.deepEqual(
    validateDelivery({
      draft: "the post is tighter now.\nwhat do you think about the update",
      formatPreference: "shortform",
      sourceUserMessage: "what do you think about the update?",
    }).issues.map((issue) => issue.code),
    ["prompt_echo"],
  );

  assert.deepEqual(
    validateDelivery({
      draft: "Thread: first thought\n---\nsecond thought",
      formatPreference: "shortform",
      sourceUserMessage: "write one post",
    }).issues.map((issue) => issue.code),
    ["artifact_mismatch"],
  );

  assert.deepEqual(
    validateDelivery({
      draft: "first post\n---\nsecond post",
      formatPreference: "thread",
      sourceUserMessage: "write a thread",
    }).issues.map((issue) => issue.code),
    ["thread_post_shape_mismatch"],
  );
});

test("delivery validation workers expose standardized worker names and retry metadata", () => {
  const result = runDeliveryValidationWorkers({
    capability: "drafting",
    groupId: "draft_delivery_validation_initial",
    draft: "Thread: shipped the update and",
    formatPreference: "shortform",
    sourceUserMessage: "write one post about the update",
  });

  assert.deepEqual(
    result.workerExecutions.map((execution) => ({
      worker: execution.worker,
      status: execution.status,
      groupId: execution.groupId,
    })),
    [
      {
        worker: "truncation_guard",
        status: "completed",
        groupId: "draft_delivery_validation_initial",
      },
      {
        worker: "prompt_echo_guard",
        status: "completed",
        groupId: "draft_delivery_validation_initial",
      },
      {
        worker: "artifact_shape_guard",
        status: "completed",
        groupId: "draft_delivery_validation_initial",
      },
      {
        worker: "thread_shape_guard",
        status: "skipped",
        groupId: "draft_delivery_validation_initial",
      },
    ],
  );
  assert.equal(result.retryConstraints.length >= 2, true);
  assert.deepEqual(
    result.validations.map((validation) => validation.validator),
    ["truncation_guard", "prompt_echo_guard", "artifact_shape_guard"],
  );
});

test("worker plane helpers preserve merge order and shared validation status rules", () => {
  const meta = mergeRuntimeExecutionMeta(
    {
      workerExecutions: [
        buildRuntimeWorkerExecution({
          worker: "first_worker",
          capability: "shared",
          phase: "execution",
          mode: "parallel",
          status: "completed",
          groupId: "group_a",
        }),
      ],
      validations: [
        buildRuntimeValidationResult({
          validator: "first_validator",
          capability: "shared",
          status: resolveRuntimeValidationStatus({ hasFailure: false }),
          issues: [],
          corrected: false,
        }),
      ],
    },
    {
      workerExecutions: [
        buildRuntimeWorkerExecution({
          worker: "second_worker",
          capability: "drafting",
          phase: "validation",
          mode: "sequential",
          status: "failed",
          groupId: "group_b",
          details: { reason: "test_failure" },
        }),
      ],
      validations: [
        buildRuntimeValidationResult({
          validator: "second_validator",
          capability: "drafting",
          status: resolveRuntimeValidationStatus({ needsClarification: true }),
          issues: ["Need clarification."],
          corrected: true,
        }),
      ],
    },
  );

  assert.deepEqual(
    meta.workerExecutions.map((execution) => execution.worker),
    ["first_worker", "second_worker"],
  );
  assert.deepEqual(
    meta.validations.map((validation) => validation.status),
    ["passed", "clarification_required"],
  );
});

test("generic draft prompts are treated as bare draft requests", () => {
  assert.equal(isBareDraftRequest("draft a post for me"), true);
  assert.equal(isBareDraftRequest("write me a post"), true);
  assert.equal(isBareDraftRequest("write a post"), true);
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

test("diagnostic questions now fall through instead of forcing deterministic replies", () => {
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

  assert.equal(reply, null);
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

test("fast-start draft path does not trigger for bare requests without an active topic", () => {
  assert.equal(
    shouldFastStartGroundedDraft({
      userMessage: "write me a post",
      mode: "plan",
      explicitIntent: null,
      hasActiveDraft: false,
      memoryTopicSummary: null,
      hasTopicGrounding: false,
      hasAutobiographicalGrounding: true,
      groundingSourceCount: 2,
      turnGroundingCount: 0,
      creatorHintsAvailable: true,
    }),
    false,
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
      hasAutobiographicalGrounding: false,
      groundingSourceCount: 0,
      turnGroundingCount: 1,
      creatorHintsAvailable: false,
    }),
    true,
  );
});

test("fast-start draft path does not trigger for bare requests even when an active topic exists", () => {
  assert.equal(
    shouldFastStartGroundedDraft({
      userMessage: "write me a post",
      mode: "plan",
      explicitIntent: null,
      hasActiveDraft: false,
      memoryTopicSummary: "x growth consistency",
      hasTopicGrounding: false,
      hasAutobiographicalGrounding: true,
      groundingSourceCount: 2,
      turnGroundingCount: 0,
      creatorHintsAvailable: true,
    }),
    false,
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
      hasAutobiographicalGrounding: false,
      groundingSourceCount: 0,
      turnGroundingCount: 0,
      creatorHintsAvailable: true,
    }),
    false,
  );
});

test("fast-start draft path does not trigger for bare requests without autobiographical grounding", () => {
  assert.equal(
    shouldFastStartGroundedDraft({
      userMessage: "write me a post",
      mode: "plan",
      explicitIntent: null,
      hasActiveDraft: false,
      memoryTopicSummary: null,
      hasTopicGrounding: false,
      hasAutobiographicalGrounding: false,
      groundingSourceCount: 2,
      turnGroundingCount: 0,
      creatorHintsAvailable: true,
    }),
    false,
  );
});

test("fast-start draft path does not trigger for open-ended anything requests", () => {
  assert.equal(
    shouldFastStartGroundedDraft({
      userMessage: "write a post about anything",
      mode: "plan",
      explicitIntent: null,
      hasActiveDraft: false,
      memoryTopicSummary: null,
      hasTopicGrounding: false,
      hasAutobiographicalGrounding: true,
      groundingSourceCount: 2,
      turnGroundingCount: 0,
      creatorHintsAvailable: true,
    }),
    false,
  );
});

test("bare draft requests force loose ideation before stale topic memory can auto-generate", () => {
  assert.equal(
    shouldForceLooseDraftIdeation({
      userMessage: "write a post",
      explicitIntent: null,
      hasActiveDraft: false,
    }),
    true,
  );
  assert.equal(
    shouldForceLooseDraftIdeation({
      userMessage: "write a thread",
      explicitIntent: null,
      hasActiveDraft: false,
    }),
    true,
  );
  assert.equal(
    shouldForceLooseDraftIdeation({
      userMessage: "write me a post about xpo onboarding",
      explicitIntent: null,
      hasActiveDraft: false,
    }),
    false,
  );
  assert.equal(
    shouldForceLooseDraftIdeation({
      userMessage: "write a post",
      explicitIntent: null,
      hasActiveDraft: true,
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
  assert.equal(
    shouldUseRevisionDraftPath({
      mode: "coach",
      workflow: "revise_draft",
      activeDraft: "current draft",
    }),
    true,
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
  assert.equal(
    packet.factualAuthority?.includes("User is building xpo"),
    true,
  );
  assert.equal(
    packet.factualAuthority?.includes("User is shipping xpo in public"),
    true,
  );
  assert.equal(packet.unknowns.some((entry) => /missing definition for xpo/i.test(entry)), true);
  assert.equal(hasAutobiographicalGrounding(packet), true);
});

test("grounding packet keeps voice-only context hints out of factual authority", () => {
  const packet = buildGroundingPacket({
    styleCard: {
      sentenceOpenings: [],
      sentenceClosers: [],
      pacing: "direct",
      emojiPatterns: [],
      slangAndVocabulary: [],
      formattingRules: [],
      customGuidelines: [],
      contextAnchors: [
        "writes about product positioning",
        "prefers sharp contrarian hooks",
        "xpo helps people write and grow faster on x",
      ],
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
    extractedFacts: null,
  });

  assert.equal(packet.voiceContextHints?.includes("writes about product positioning"), true);
  assert.equal(packet.voiceContextHints?.includes("prefers sharp contrarian hooks"), true);
  assert.equal(
    packet.factualAuthority?.includes("writes about product positioning"),
    false,
  );
  assert.equal(
    packet.factualAuthority?.includes("prefers sharp contrarian hooks"),
    false,
  );
  assert.equal(
    packet.factualAuthority?.includes("xpo helps people write and grow faster on x"),
    true,
  );
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
    fileURLToPath(new URL("./draftPipeline.ts", import.meta.url)),
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
    fileURLToPath(new URL("../capabilities/drafting/groundedDraftRetry.ts", import.meta.url)),
    "utf8",
  );

  assert.equal(source.includes("buildUnsupportedClaimRetryConstraint"), true);
  assert.equal(source.includes("hasUnsupportedClaims"), true);
  assert.equal(
    source.includes("!firstAttemptWithClaimCheck.hasUnsupportedClaims"),
    true,
  );
});

test("draft pipeline runs delivery validation before fallbacking malformed drafts", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../capabilities/drafting/groundedDraftRetry.ts", import.meta.url)),
    "utf8",
  );

  assert.equal(source.includes("runDeliveryValidationWorkers"), true);
  assert.equal(source.includes("draft_delivery_validation_initial"), true);
  assert.equal(source.includes("draft_delivery_validation_retry"), true);
  assert.equal(source.includes("returnDeliveryValidationFallback"), true);
  assert.equal(source.includes("delivery_validation_failed"), true);
});

test("revising capability retries delivery failures once and succeeds on a clean second pass", async () => {
  let revisionCalls = 0;
  let criticCalls = 0;

  const execution = await executeRevisingCapability({
    workflow: "revise_draft",
    capability: "revising",
    context: {
      memory: {
        rollingSummary: null,
        topicSummary: "launch update",
        pendingPlan: null,
        formatPreference: "shortform",
      },
      activeDraft: "the launch is live now",
      revision: {
        instruction: "tighten the ending",
        changeKind: "length_trim",
        targetText: null,
      },
      revisionActiveConstraints: ["keep it grounded"],
      effectiveContext: "assistant: draft ready",
      relevantTopicAnchors: ["launch update"],
      styleCard: null,
      maxCharacterLimit: 280,
      goal: "Audience growth",
      antiPatterns: [],
      turnDraftPreference: "balanced",
      turnFormatPreference: "shortform",
      threadPostMaxCharacterLimit: undefined,
      turnThreadFramingStyle: null,
      userMessage: "tighten the ending",
      groundingPacket: {
        durableFacts: ["the launch is live now"],
        turnGrounding: [],
        allowedFirstPersonClaims: [],
        allowedNumbers: [],
        forbiddenClaims: [],
        unknowns: [],
        sourceMaterials: [],
      },
      feedbackMemoryNotice: null,
      nextAssistantTurnCount: 3,
      refreshRollingSummary: false,
      latestRefinementInstruction: "tighten the ending",
      groundingSources: [],
      groundingMode: null,
      groundingExplanation: null,
    },
    services: {
      generateRevisionDraft: async () => {
        revisionCalls += 1;
        return {
          revisedDraft:
            revisionCalls === 1
              ? "the launch is live now and"
              : "the launch is live now. tightened the close and kept it grounded.",
          issuesFixed: ["Tightened the ending."],
          supportAsset: null,
        };
      },
      critiqueDrafts: async (writerOutput) => {
        criticCalls += 1;
        return {
          approved: true,
          finalDraft: writerOutput.draft,
          issues: ["Smoothed the phrasing."],
        };
      },
      buildClarificationResponse: async () => {
        throw new Error("clarification should not be requested");
      },
    },
  });

  assert.equal(revisionCalls, 2);
  assert.equal(criticCalls, 2);
  assert.equal(execution.output.kind, "revision_ready");
  assert.equal(
    execution.output.responseSeed.data.draft,
    "the launch is live now. tightened the close and kept it grounded.",
  );
  assert.equal(
    execution.output.responseSeed.data.issuesFixed.includes(
      "Finished the revision with a complete ending.",
    ),
    true,
  );
  assert.equal(
    execution.workers.some(
      (worker) => worker.groupId === "revision_delivery_validation_retry",
    ),
    true,
  );
});

test("revising capability falls back safely when delivery validation fails twice", async () => {
  const execution = await executeRevisingCapability({
    workflow: "revise_draft",
    capability: "revising",
    context: {
      memory: {
        rollingSummary: null,
        topicSummary: "launch update",
        pendingPlan: null,
        formatPreference: "shortform",
      },
      activeDraft: "the launch is live now",
      revision: {
        instruction: "tighten the ending",
        changeKind: "length_trim",
        targetText: null,
      },
      revisionActiveConstraints: ["keep it grounded"],
      effectiveContext: "assistant: draft ready",
      relevantTopicAnchors: ["launch update"],
      styleCard: null,
      maxCharacterLimit: 280,
      goal: "Audience growth",
      antiPatterns: [],
      turnDraftPreference: "balanced",
      turnFormatPreference: "shortform",
      threadPostMaxCharacterLimit: undefined,
      turnThreadFramingStyle: null,
      userMessage: "tighten the ending",
      groundingPacket: {
        durableFacts: ["the launch is live now"],
        turnGrounding: [],
        allowedFirstPersonClaims: [],
        allowedNumbers: [],
        forbiddenClaims: [],
        unknowns: [],
        sourceMaterials: [],
      },
      feedbackMemoryNotice: null,
      nextAssistantTurnCount: 3,
      refreshRollingSummary: false,
      latestRefinementInstruction: "tighten the ending",
      groundingSources: [],
      groundingMode: null,
      groundingExplanation: null,
    },
    services: {
      generateRevisionDraft: async () => ({
        revisedDraft: "the launch is live now and",
        issuesFixed: ["Tightened the ending."],
        supportAsset: null,
      }),
      critiqueDrafts: async (writerOutput) => ({
        approved: true,
        finalDraft: writerOutput.draft,
        issues: ["Smoothed the phrasing."],
      }),
      buildClarificationResponse: async () => {
        throw new Error("clarification should not be requested");
      },
    },
  });

  assert.equal(execution.output.kind, "response");
  assert.equal(execution.output.response.mode, "coach");
  assert.equal(execution.output.response.outputShape, "coach_question");
  assert.equal(
    execution.output.response.response.includes("malformed twice"),
    true,
  );
  assert.equal(
    execution.workers.some(
      (worker) => worker.groupId === "revision_delivery_validation_retry",
    ),
    true,
  );
});

test("revising capability keeps claim clarification ahead of delivery fallback", async () => {
  let clarificationCalls = 0;

  const execution = await executeRevisingCapability({
    workflow: "revise_draft",
    capability: "revising",
    context: {
      memory: {
        rollingSummary: null,
        topicSummary: "launch update",
        pendingPlan: null,
        formatPreference: "shortform",
      },
      activeDraft: "the launch is live now",
      revision: {
        instruction: "add more detail",
        changeKind: "specificity_tune",
        targetText: null,
      },
      revisionActiveConstraints: ["keep it grounded"],
      effectiveContext: "assistant: draft ready",
      relevantTopicAnchors: ["launch update"],
      styleCard: null,
      maxCharacterLimit: 280,
      goal: "Audience growth",
      antiPatterns: [],
      turnDraftPreference: "balanced",
      turnFormatPreference: "shortform",
      threadPostMaxCharacterLimit: undefined,
      turnThreadFramingStyle: null,
      userMessage: "add more detail",
      groundingPacket: {
        durableFacts: [],
        turnGrounding: [],
        allowedFirstPersonClaims: [],
        allowedNumbers: [],
        forbiddenClaims: [],
        unknowns: ["missing evidence"],
        sourceMaterials: [],
      },
      feedbackMemoryNotice: null,
      nextAssistantTurnCount: 3,
      refreshRollingSummary: false,
      latestRefinementInstruction: "add more detail",
      groundingSources: [],
      groundingMode: null,
      groundingExplanation: null,
    },
    services: {
      generateRevisionDraft: async () => ({
        revisedDraft: "yesterday i closed 3 launches in toronto",
        issuesFixed: [],
        supportAsset: null,
      }),
      critiqueDrafts: async (writerOutput) => ({
        approved: true,
        finalDraft: writerOutput.draft,
        issues: [],
      }),
      buildClarificationResponse: async () => {
        clarificationCalls += 1;
        return {
          mode: "coach",
          outputShape: "coach_question",
          response: "need clarification",
          memory: { topicSummary: "launch update" },
        };
      },
    },
  });

  assert.equal(clarificationCalls, 1);
  assert.equal(execution.output.kind, "response");
  assert.equal(execution.output.response.response, "need clarification");
  assert.equal(
    execution.workers.some((worker) => worker.worker === "claim_checker"),
    true,
  );
});
