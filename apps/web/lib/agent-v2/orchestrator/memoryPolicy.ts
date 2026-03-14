import { createConversationMemorySnapshot } from "../memory/memoryStore";
import { applyMemorySaliencePolicy } from "../memory/memorySalience";
import {
  rememberFactsOnStyleCard,
  rememberSemanticCorrectionOnStyleCard,
  getDurableFactsFromStyleCard,
} from "../core/styleProfile";
import { countNewMemoryEntries } from "./feedbackMemoryNotice";
import {
} from "./sourceMaterials";
import type { ConversationServices } from "./draftPipelineHelpers.ts";
import type { V2ConversationMemory } from "../contracts/chat";
import type { VoiceStyleCard } from "../core/styleProfile";
import type { SourceMaterialAssetInput, SourceMaterialAssetRecord } from "./sourceMaterials";

export function applyMemoryPatch(
  current: V2ConversationMemory,
  patch: Partial<V2ConversationMemory>,
): V2ConversationMemory {
  return {
    ...current,
    ...patch,
    lastIdeationAngles: patch.lastIdeationAngles ?? current.lastIdeationAngles,
    activeConstraints: patch.activeConstraints ?? current.activeConstraints,
    pendingPlan: patch.pendingPlan === undefined ? current.pendingPlan : patch.pendingPlan,
    clarificationState: patch.clarificationState === undefined ? current.clarificationState : patch.clarificationState,
    rollingSummary: patch.rollingSummary === undefined ? current.rollingSummary : patch.rollingSummary,
    activeDraftRef: patch.activeDraftRef === undefined ? current.activeDraftRef : patch.activeDraftRef,
    latestRefinementInstruction: patch.latestRefinementInstruction === undefined ? current.latestRefinementInstruction : patch.latestRefinementInstruction,
    unresolvedQuestion: patch.unresolvedQuestion === undefined ? current.unresolvedQuestion : patch.unresolvedQuestion,
    clarificationQuestionsAsked: patch.clarificationQuestionsAsked === undefined ? current.clarificationQuestionsAsked : patch.clarificationQuestionsAsked,
    preferredSurfaceMode: patch.preferredSurfaceMode === undefined ? current.preferredSurfaceMode : patch.preferredSurfaceMode,
    formatPreference: patch.formatPreference === undefined ? current.formatPreference : patch.formatPreference,
  };
}

export async function saveConversationTurnMemory(args: {
  memory: V2ConversationMemory;
  patch: Partial<V2ConversationMemory> & {
    topicSummary?: string | null;
    lastIdeationAngles?: string[];
    concreteAnswerCount?: number;
    currentDraftArtifactId?: string | null;
  };
  runId?: string;
  threadId?: string;
  services: ConversationServices;
}): Promise<V2ConversationMemory> {
  const { memory, patch, runId, threadId, services } = args;

  const optimistic = applyMemoryPatch(memory, {
    conversationState: patch.conversationState,
    activeConstraints: patch.activeConstraints,
    pendingPlan: patch.pendingPlan,
    clarificationState: patch.clarificationState,
    rollingSummary: patch.rollingSummary,
    assistantTurnCount: patch.assistantTurnCount,
    activeDraftRef: patch.activeDraftRef,
    latestRefinementInstruction: patch.latestRefinementInstruction,
    unresolvedQuestion: patch.unresolvedQuestion,
    clarificationQuestionsAsked: patch.clarificationQuestionsAsked,
    preferredSurfaceMode: patch.preferredSurfaceMode,
    formatPreference: patch.formatPreference,
    lastIdeationAngles: patch.lastIdeationAngles,
    topicSummary: patch.topicSummary ?? memory.topicSummary,
    concreteAnswerCount: patch.concreteAnswerCount ?? memory.concreteAnswerCount,
    currentDraftArtifactId: patch.currentDraftArtifactId ?? memory.currentDraftArtifactId,
  });
  const optimisticSalience = applyMemorySaliencePolicy({
    topicSummary: optimistic.topicSummary,
    concreteAnswerCount: optimistic.concreteAnswerCount,
    envelope: {
      constraints: optimistic.activeConstraints,
      lastIdeationAngles: optimistic.lastIdeationAngles,
      rollingSummary: optimistic.rollingSummary,
      latestRefinementInstruction: optimistic.latestRefinementInstruction,
      unresolvedQuestion: optimistic.unresolvedQuestion,
    },
  });
  const normalizedOptimistic = {
    ...optimistic,
    topicSummary: optimisticSalience.topicSummary,
    concreteAnswerCount: optimisticSalience.concreteAnswerCount,
    activeConstraints: optimisticSalience.envelope.constraints,
    lastIdeationAngles: optimisticSalience.envelope.lastIdeationAngles,
    rollingSummary: optimisticSalience.envelope.rollingSummary,
    latestRefinementInstruction: optimisticSalience.envelope.latestRefinementInstruction,
    unresolvedQuestion: optimisticSalience.envelope.unresolvedQuestion,
  };

  const updated = await services.updateConversationMemory({
    runId,
    threadId,
    topicSummary: patch.topicSummary,
    activeConstraints: patch.activeConstraints,
    concreteAnswerCount: patch.concreteAnswerCount,
    lastDraftArtifactId: patch.currentDraftArtifactId,
    conversationState: patch.conversationState,
    pendingPlan: patch.pendingPlan,
    clarificationState: patch.clarificationState,
    rollingSummary: patch.rollingSummary,
    assistantTurnCount: patch.assistantTurnCount,
    activeDraftRef: patch.activeDraftRef,
    latestRefinementInstruction: patch.latestRefinementInstruction,
    unresolvedQuestion: patch.unresolvedQuestion,
    clarificationQuestionsAsked: patch.clarificationQuestionsAsked,
    preferredSurfaceMode: patch.preferredSurfaceMode,
    formatPreference: patch.formatPreference,
    lastIdeationAngles: patch.lastIdeationAngles,
  });

  return updated
    ? createConversationMemorySnapshot(updated as unknown as Record<string, unknown>)
    : normalizedOptimistic;
}

export async function syncStyleProfileMemory(args: {
  userId: string;
  effectiveXHandle: string;
  styleCard: VoiceStyleCard | null;
  extractedRules: string[] | null;
  extractedFacts: string[] | null;
  semanticCorrectionDetail?: string | null;
  services: ConversationServices;
}): Promise<VoiceStyleCard | null> {
  if (!args.styleCard || args.userId === "anonymous") {
    return args.styleCard;
  }

  let finalStyleCard = args.styleCard;
  let didUpdate = false;

  if (args.extractedRules && args.extractedRules.length > 0) {
    const prevRules = finalStyleCard.customGuidelines || [];
    finalStyleCard.customGuidelines = Array.from(
      new Set([...prevRules, ...args.extractedRules])
    );
    if (finalStyleCard.customGuidelines.length !== prevRules.length) {
      didUpdate = true;
    }
  }

  if (args.extractedFacts && args.extractedFacts.length > 0) {
    const prevFacts = getDurableFactsFromStyleCard(finalStyleCard);
    finalStyleCard = rememberFactsOnStyleCard(finalStyleCard, args.extractedFacts);
    const nextFacts = getDurableFactsFromStyleCard(finalStyleCard);
    if (countNewMemoryEntries(prevFacts, nextFacts) > 0) {
      didUpdate = true;
    }
  }

  if (args.semanticCorrectionDetail) {
    const prevFacts = getDurableFactsFromStyleCard(finalStyleCard);
    const prevClaims = finalStyleCard.factLedger?.forbiddenClaims || [];
    finalStyleCard = rememberSemanticCorrectionOnStyleCard(finalStyleCard, args.semanticCorrectionDetail);
    const nextFacts = getDurableFactsFromStyleCard(finalStyleCard);
    const nextClaims = finalStyleCard.factLedger?.forbiddenClaims || [];
    
    if (
      countNewMemoryEntries(prevFacts, nextFacts) > 0 ||
      countNewMemoryEntries(prevClaims, nextClaims) > 0
    ) {
      didUpdate = true;
    }
  }

  if (didUpdate) {
    await args.services.saveStyleProfile(args.userId, args.effectiveXHandle, finalStyleCard).catch((error) => {
      console.error("Failed to save style profile memory updates:", error);
    });
  }

  return finalStyleCard;
}

export async function syncAutoSourceMaterials(args: {
  userId: string;
  effectiveXHandle: string;
  styleCard: VoiceStyleCard | null;
  newAutoInputs: SourceMaterialAssetInput[];
  existingAssets: SourceMaterialAssetRecord[];
  services: ConversationServices;
}) {
  let styleCard = args.styleCard;
  
  if (args.newAutoInputs.length === 0 || args.userId === "anonymous") {
    return {
      styleCard,
      assets: args.existingAssets,
      autoSavedReport: undefined,
    };
  }

  if (styleCard) {
    styleCard = {
      ...styleCard,
      factLedger: {
        ...styleCard.factLedger,
        sourceMaterials: [
          ...(styleCard.factLedger?.sourceMaterials || []),
          ...args.newAutoInputs,
        ],
      },
    };
    await args.services.saveStyleProfile(args.userId, args.effectiveXHandle, styleCard).catch((error) =>
      console.error("Failed to save auto-captured source materials to style profile:", error),
    );
  }

  const persisted = await args.services.saveSourceMaterialAssets({
    userId: args.userId,
    xHandle: args.effectiveXHandle,
    assets: args.newAutoInputs,
  });

  const fallbackCreatedAt = new Date().toISOString();
  const autoSourceMaterialRecords =
    persisted.length > 0
      ? persisted
      : args.newAutoInputs.map((asset, index) => ({
          id: `auto-source-${index}-${fallbackCreatedAt}`,
          userId: args.userId,
          xHandle: args.effectiveXHandle || null,
          type: asset.type,
          title: asset.title,
          tags: asset.tags,
          verified: asset.verified,
          claims: asset.claims,
          snippets: asset.snippets,
          doNotClaim: asset.doNotClaim,
          lastUsedAt: null,
          createdAt: fallbackCreatedAt,
          updatedAt: fallbackCreatedAt,
        }));

  return {
    styleCard,
    assets: [...autoSourceMaterialRecords, ...args.existingAssets],
    autoSavedReport: {
      count: args.newAutoInputs.length,
      assets: autoSourceMaterialRecords.map((asset) => ({
        id: asset.id,
        title: asset.title,
        deletable: !asset.id.startsWith("auto-source-"),
      })),
    },
  };
}
