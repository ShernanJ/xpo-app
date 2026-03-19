import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../db";
import {
  controlTurn,
} from "../agents/controller";
import {
  generateCoachReply,
  generatePostAnalysis,
  generateReplyGuidance,
} from "../agents/coach";
import { generatePlan } from "../agents/planner";
import { generateIdeasMenu } from "../agents/ideator";
import { generateDrafts } from "../agents/writer";
import { critiqueDrafts } from "../agents/critic";
import { generateRevisionDraft } from "../agents/reviser";
import { extractStyleRules } from "../agents/styleExtractor";
import { extractCoreFacts } from "../agents/factExtractor";
import { extractAntiPattern } from "../agents/antiPatternExtractor";
import {
  createConversationMemory,
  getConversationMemory,
  updateConversationMemory,
} from "../memory/memoryStore";
import { retrieveAnchors } from "../core/retrieval";
import { generateStyleProfile, saveStyleProfile } from "../core/styleProfile";
import { checkDeterministicNovelty } from "../core/noveltyGate";
import { loadHistoricalTextWorkers } from "../workers/historicalTextWorkers.ts";
import {
  buildSourceMaterialIdentityKey,
  serializeSourceMaterialAsset,
  type SourceMaterialAssetInput,
  type SourceMaterialAssetRecord,
} from "../grounding/sourceMaterials.ts";
import {
  isMissingDraftCandidateTableError,
  isMissingSourceMaterialAssetTableError,
} from "../persistence/prismaGuards.ts";
import type { CapabilityName, RuntimeWorkerExecution } from "./runtimeContracts.ts";

export interface StoredOnboardingRun {
  id?: string;
  input: unknown;
  result: unknown;
}

export interface ConversationServices {
  controlTurn: typeof controlTurn;
  generateCoachReply: typeof generateCoachReply;
  generateReplyGuidance: typeof generateReplyGuidance;
  generatePostAnalysis: typeof generatePostAnalysis;
  generatePlan: typeof generatePlan;
  generateIdeasMenu: typeof generateIdeasMenu;
  generateDrafts: typeof generateDrafts;
  critiqueDrafts: typeof critiqueDrafts;
  generateRevisionDraft: typeof generateRevisionDraft;
  extractStyleRules: typeof extractStyleRules;
  extractCoreFacts: typeof extractCoreFacts;
  extractAntiPattern: typeof extractAntiPattern;
  getConversationMemory: typeof getConversationMemory;
  createConversationMemory: typeof createConversationMemory;
  updateConversationMemory: typeof updateConversationMemory;
  retrieveAnchors: typeof retrieveAnchors;
  generateStyleProfile: typeof generateStyleProfile;
  saveStyleProfile: typeof saveStyleProfile;
  checkDeterministicNovelty: typeof checkDeterministicNovelty;
  getOnboardingRun: (runId?: string) => Promise<StoredOnboardingRun | null>;
  loadHistoricalTexts: (args: {
    userId: string;
    xHandle?: string | null;
    capability: CapabilityName;
  }) => Promise<{
    texts: string[];
    workerExecutions: RuntimeWorkerExecution[];
  }>;
  getHistoricalPosts: (args: {
    userId: string;
    xHandle?: string | null;
  }) => Promise<string[]>;
  getSourceMaterialAssets: (args: {
    userId: string;
    xHandle?: string | null;
  }) => Promise<SourceMaterialAssetRecord[]>;
  markSourceMaterialAssetsUsed: (assetIds: string[]) => Promise<void>;
  saveSourceMaterialAssets: (args: {
    userId: string;
    xHandle?: string | null;
    assets: SourceMaterialAssetInput[];
  }) => Promise<SourceMaterialAssetRecord[]>;
  shouldIncludeRoutingTrace: () => boolean;
}

export function normalizeHandleForContext(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(/^@+/, "").toLowerCase();
  return normalized || null;
}

export function createDefaultConversationServices(): ConversationServices {
  const loadHistoricalTexts = async (args: {
    userId: string;
    xHandle?: string | null;
    capability: CapabilityName;
  }) => {
    const normalizedHandle = normalizeHandleForContext(args.xHandle);

    return loadHistoricalTextWorkers({
      userId: args.userId,
      xHandle: normalizedHandle,
      capability: args.capability,
      loadPosts: ({ userId, xHandle }) =>
        prisma.post.findMany({
          where: {
            userId,
            ...(xHandle ? { xHandle } : {}),
          },
          orderBy: { createdAt: "desc" },
          take: 100,
          select: { text: true },
        }),
      loadDraftCandidates: ({ userId, xHandle }) =>
        prisma.draftCandidate
          .findMany({
            where: {
              userId,
              ...(xHandle ? { xHandle } : {}),
              reviewStatus: {
                in: ["pending", "approved", "edited", "posted", "observed"],
              },
            },
            orderBy: { createdAt: "desc" },
            take: 40,
            select: { artifact: true },
          })
          .catch((error) => {
            if (isMissingDraftCandidateTableError(error)) {
              return [];
            }

            throw error;
          }),
    });
  };

  return {
    controlTurn,
    generateCoachReply,
    generateReplyGuidance,
    generatePostAnalysis,
    generatePlan,
    generateIdeasMenu,
    generateDrafts,
    critiqueDrafts,
    generateRevisionDraft,
    extractStyleRules,
    extractCoreFacts,
    extractAntiPattern,
    getConversationMemory,
    createConversationMemory,
    updateConversationMemory,
    retrieveAnchors,
    generateStyleProfile,
    saveStyleProfile,
    checkDeterministicNovelty,
    async getOnboardingRun(runId?: string) {
      if (!runId) {
        return null;
      }

      const record = await prisma.onboardingRun.findUnique({ where: { id: runId } });
      return (record as unknown as StoredOnboardingRun | null) || null;
    },
    async getHistoricalPosts(args: { userId: string; xHandle?: string | null }) {
      const result = await loadHistoricalTexts({
        ...args,
        capability: "shared",
      });

      return result.texts;
    },
    loadHistoricalTexts,
    async getSourceMaterialAssets(args: { userId: string; xHandle?: string | null }) {
      const normalizedHandle = normalizeHandleForContext(args.xHandle);

      try {
        const assets = await prisma.sourceMaterialAsset.findMany({
          where: {
            userId: args.userId,
            ...(normalizedHandle ? { xHandle: normalizedHandle } : {}),
          },
          orderBy: [
            { verified: "desc" },
            { lastUsedAt: "desc" },
            { updatedAt: "desc" },
          ],
          take: 40,
        });

        return assets.map(serializeSourceMaterialAsset);
      } catch (error) {
        if (isMissingSourceMaterialAssetTableError(error)) {
          return [];
        }

        throw error;
      }
    },
    async markSourceMaterialAssetsUsed(assetIds: string[]) {
      if (assetIds.length === 0) {
        return;
      }

      try {
        await prisma.sourceMaterialAsset.updateMany({
          where: { id: { in: assetIds } },
          data: { lastUsedAt: new Date() },
        });
      } catch (error) {
        if (isMissingSourceMaterialAssetTableError(error)) {
          return;
        }

        throw error;
      }
    },
    async saveSourceMaterialAssets(args: {
      userId: string;
      xHandle?: string | null;
      assets: SourceMaterialAssetInput[];
    }) {
      const normalizedHandle = normalizeHandleForContext(args.xHandle);
      if (args.assets.length === 0) {
        return [];
      }

      try {
        const existing = await prisma.sourceMaterialAsset.findMany({
          where: {
            userId: args.userId,
            ...(normalizedHandle ? { xHandle: normalizedHandle } : {}),
          },
        });
        const existingKeys = new Set(
          existing.map((asset) =>
            buildSourceMaterialIdentityKey({
              type: asset.type,
              title: asset.title,
              claims: Array.isArray(asset.claims) ? (asset.claims as string[]) : [],
              snippets: Array.isArray(asset.snippets) ? (asset.snippets as string[]) : [],
            }),
          ),
        );
        const created: SourceMaterialAssetRecord[] = [];

        for (const asset of args.assets) {
          const key = buildSourceMaterialIdentityKey(asset);
          if (existingKeys.has(key)) {
            continue;
          }

          existingKeys.add(key);
          const record = await prisma.sourceMaterialAsset.create({
            data: {
              userId: args.userId,
              ...(normalizedHandle ? { xHandle: normalizedHandle } : {}),
              type: asset.type,
              title: asset.title,
              tags: asset.tags as unknown as Prisma.JsonArray,
              verified: asset.verified,
              claims: asset.claims as unknown as Prisma.JsonArray,
              snippets: asset.snippets as unknown as Prisma.JsonArray,
              doNotClaim: asset.doNotClaim as unknown as Prisma.JsonArray,
            },
          });
          created.push(serializeSourceMaterialAsset(record));
        }

        return created;
      } catch (error) {
        if (isMissingSourceMaterialAssetTableError(error)) {
          return [];
        }

        throw error;
      }
    },
    shouldIncludeRoutingTrace() {
      return false;
    },
  };
}
