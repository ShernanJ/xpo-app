import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/serverSession";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db";
import { recordProductEvent } from "@/lib/productEvents";
import { isMissingSourceMaterialAssetTableError } from "@/lib/agent-v2/persistence/prismaGuards";
import {
  buildSourceMaterialIdentityKey,
  serializeSourceMaterialAsset,
} from "@/lib/agent-v2/grounding/sourceMaterials";
import { buildPromotedDraftSourceMaterialInputs } from "@/lib/agent-v2/grounding/sourceMaterialSeeds";
import {
  buildDraftArtifact,
  computeXWeightedCharacterCount,
  type DraftArtifactDetails,
} from "@/lib/onboarding/shared/draftArtifacts";
import {
  resolveOwnedThreadForWorkspace,
  resolveWorkspaceHandleForRequest,
} from "@/lib/workspaceHandle.server";
import {
  markSupersededDraftVersions,
  syncIndexedContentFromChatMessage,
} from "@/lib/content/contentHub";
import {
  enforceSessionMutationRateLimit,
  parseJsonBody,
  requireAllowedOrigin,
} from "@/lib/security/requestValidation";

type DraftVersionSource = "assistant_generated" | "assistant_revision" | "manual_save";

interface DraftVersionEntry {
  id: string;
  content: string;
  source: DraftVersionSource;
  createdAt: string;
  basedOnVersionId: string | null;
  weightedCharacterCount: number;
  maxCharacterLimit: number;
  supportAsset: string | null;
  artifact?: DraftArtifactDetails;
}

interface DraftVersionSnapshot {
  messageId: string;
  versionId: string;
  content: string;
  source: DraftVersionSource;
  createdAt: string;
  maxCharacterLimit?: number;
  revisionChainId?: string;
}

interface DraftPromotionRequest extends Record<string, unknown> {
  content?: unknown;
  outputShape?: unknown;
  supportAsset?: unknown;
  maxCharacterLimit?: unknown;
  revisionChainId?: unknown;
  basedOn?: unknown;
  posts?: unknown;
  replyPlan?: unknown;
  voiceTarget?: unknown;
  noveltyNotes?: unknown;
  groundingSources?: unknown;
  groundingMode?: unknown;
  groundingExplanation?: unknown;
  threadFramingStyle?: unknown;
  replySourcePreview?: unknown;
}

function resolveDraftArtifactKind(
  outputShape: string,
): DraftArtifactDetails["kind"] | null {
  switch (outputShape) {
    case "short_form_post":
    case "long_form_post":
    case "thread_seed":
    case "reply_candidate":
    case "quote_candidate":
      return outputShape;
    default:
      return null;
  }
}

function buildDraftArtifactWithLimit(params: {
  id: string;
  title: string;
  kind: DraftArtifactDetails["kind"];
  content: string;
  supportAsset: string | null;
  maxCharacterLimit: number;
  groundingSources?: DraftArtifactDetails["groundingSources"];
  groundingMode?: DraftArtifactDetails["groundingMode"];
  groundingExplanation?: DraftArtifactDetails["groundingExplanation"];
  posts?: string[];
  replyPlan?: string[];
  voiceTarget?: DraftArtifactDetails["voiceTarget"];
  noveltyNotes?: string[];
  threadFramingStyle?: DraftArtifactDetails["threadFramingStyle"];
  replySourcePreview?: DraftArtifactDetails["replySourcePreview"];
}): DraftArtifactDetails {
  const artifact = buildDraftArtifact({
    id: params.id,
    title: params.title,
    kind: params.kind,
    content: params.content,
    supportAsset: params.supportAsset,
    ...(params.groundingSources?.length ? { groundingSources: params.groundingSources } : {}),
    ...(params.groundingMode ? { groundingMode: params.groundingMode } : {}),
    ...(params.groundingExplanation ? { groundingExplanation: params.groundingExplanation } : {}),
    ...(params.posts?.length ? { posts: params.posts } : {}),
    ...(params.replyPlan?.length ? { replyPlan: params.replyPlan } : {}),
    ...(params.voiceTarget ? { voiceTarget: params.voiceTarget } : {}),
    ...(params.noveltyNotes?.length ? { noveltyNotes: params.noveltyNotes } : {}),
    ...(params.threadFramingStyle ? { threadFramingStyle: params.threadFramingStyle } : {}),
    ...(params.replySourcePreview !== undefined
      ? { replySourcePreview: params.replySourcePreview ?? null }
      : {}),
    ...(params.kind === "thread_seed"
      ? {
          threadPostMaxCharacterLimit: Math.max(
            280,
            Math.floor(params.maxCharacterLimit / 6),
          ),
        }
      : {}),
  });

  if (artifact.maxCharacterLimit === params.maxCharacterLimit) {
    return artifact;
  }

  return {
    ...artifact,
    maxCharacterLimit: params.maxCharacterLimit,
    isWithinXLimit: artifact.weightedCharacterCount <= params.maxCharacterLimit,
  };
}

function parseBasedOn(value: unknown): DraftVersionSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const messageId = typeof candidate.messageId === "string" ? candidate.messageId.trim() : "";
  const versionId = typeof candidate.versionId === "string" ? candidate.versionId.trim() : "";
  const content = typeof candidate.content === "string" ? candidate.content.trim() : "";

  if (!messageId || !versionId || !content) {
    return null;
  }

  const source =
    candidate.source === "assistant_generated" ||
    candidate.source === "assistant_revision" ||
    candidate.source === "manual_save"
      ? candidate.source
      : "manual_save";
  const createdAt =
    typeof candidate.createdAt === "string" && candidate.createdAt.trim()
      ? candidate.createdAt.trim()
      : new Date().toISOString();
  const maxCharacterLimit =
    typeof candidate.maxCharacterLimit === "number" && candidate.maxCharacterLimit > 0
      ? candidate.maxCharacterLimit
      : undefined;
  const revisionChainId =
    typeof candidate.revisionChainId === "string" && candidate.revisionChainId.trim()
      ? candidate.revisionChainId.trim()
      : undefined;

  return {
    messageId,
    versionId,
    content,
    source,
    createdAt,
    ...(maxCharacterLimit ? { maxCharacterLimit } : {}),
    ...(revisionChainId ? { revisionChainId } : {}),
  };
}

function buildVersionId(): string {
  return `draft-version-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildRevisionChainId(seed?: string): string {
  const normalizedSeed = typeof seed === "string" ? seed.trim() : "";
  if (normalizedSeed) {
    return normalizedSeed.startsWith("revision-chain-")
      ? normalizedSeed
      : `revision-chain-${normalizedSeed}`;
  }

  return `revision-chain-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const originError = requireAllowedOrigin(request);
  if (originError) {
    return originError;
  }

  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "auth", message: "Unauthorized" }] },
      { status: 401 },
    );
  }

  const rateLimitError = await enforceSessionMutationRateLimit(request, {
    userId: session.user.id,
    scope: "creator:v2_draft_promotions",
    user: {
      limit: 20,
      windowMs: 5 * 60 * 1000,
      message: "Too many draft promotions. Please wait before trying again.",
    },
    ip: {
      limit: 50,
      windowMs: 5 * 60 * 1000,
      message: "Too many draft promotions from this network. Please wait before trying again.",
    },
  });
  if (rateLimitError) {
    return rateLimitError;
  }
  const bodyResult = await parseJsonBody<DraftPromotionRequest>(request, {
    maxBytes: 128 * 1024,
  });
  if (!bodyResult.ok) {
    return bodyResult.response;
  }
  const body = bodyResult.value;

  const content = typeof body.content === "string" ? body.content.trim() : "";
  const outputShape = typeof body.outputShape === "string" ? body.outputShape.trim() : "";
  const supportAsset = typeof body.supportAsset === "string" ? body.supportAsset : null;
  const maxCharacterLimit =
    typeof body.maxCharacterLimit === "number" && body.maxCharacterLimit > 0
      ? body.maxCharacterLimit
      : 280;
  const posts = Array.isArray(body.posts)
    ? body.posts
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
  const replyPlan = Array.isArray(body.replyPlan)
    ? body.replyPlan
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
  const voiceTarget =
    body.voiceTarget && typeof body.voiceTarget === "object" && !Array.isArray(body.voiceTarget)
      ? (body.voiceTarget as DraftArtifactDetails["voiceTarget"])
      : null;
  const noveltyNotes = Array.isArray(body.noveltyNotes)
    ? body.noveltyNotes
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
  const groundingSources = Array.isArray(body.groundingSources)
    ? body.groundingSources
        .filter((entry): entry is DraftArtifactDetails["groundingSources"][number] =>
          Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
        )
        .map((entry) => ({
          type: entry.type,
          title: entry.title,
          claims: Array.isArray(entry.claims)
            ? entry.claims.filter((claim): claim is string => typeof claim === "string").slice(0, 2)
            : [],
          snippets: Array.isArray(entry.snippets)
            ? entry.snippets.filter((snippet): snippet is string => typeof snippet === "string").slice(0, 2)
            : [],
        }))
    : [];
  const groundingMode =
    body.groundingMode === "saved_sources" ||
    body.groundingMode === "current_chat" ||
    body.groundingMode === "mixed" ||
    body.groundingMode === "safe_framework"
      ? body.groundingMode
      : null;
  const groundingExplanation =
    typeof body.groundingExplanation === "string" && body.groundingExplanation.trim()
      ? body.groundingExplanation.trim()
      : null;
  const threadFramingStyle =
    body.threadFramingStyle === "none" ||
    body.threadFramingStyle === "soft_signal" ||
    body.threadFramingStyle === "numbered"
      ? body.threadFramingStyle
      : null;
  const replySourcePreview =
    body.replySourcePreview &&
    typeof body.replySourcePreview === "object" &&
    !Array.isArray(body.replySourcePreview)
      ? (body.replySourcePreview as DraftArtifactDetails["replySourcePreview"])
      : null;
  const basedOn = parseBasedOn(body.basedOn);
  const revisionChainId = buildRevisionChainId(
    typeof body.revisionChainId === "string" ? body.revisionChainId : basedOn?.revisionChainId,
  );
  const draftKind = resolveDraftArtifactKind(outputShape);

  if (!content || !draftKind || !basedOn) {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ field: "payload", message: "A valid draft payload is required." }],
      },
      { status: 400 },
    );
  }

  try {
    const workspaceHandle = await resolveWorkspaceHandleForRequest({
      request,
      session,
    });
    if (!workspaceHandle.ok) {
      return workspaceHandle.response;
    }

    const { threadId } = await params;
    const ownedThread = await resolveOwnedThreadForWorkspace({
      threadId,
      userId: session.user.id,
      xHandle: workspaceHandle.xHandle,
    });
    if (!ownedThread.ok) {
      return ownedThread.response;
    }
    const thread = ownedThread.thread;

    const versionId = buildVersionId();
    const createdAt = new Date().toISOString();
    const artifact = buildDraftArtifactWithLimit({
      id: `${thread.id}-${versionId}`,
      title: "Draft",
      kind: draftKind,
      content,
      supportAsset,
      maxCharacterLimit,
      ...(groundingSources.length ? { groundingSources } : {}),
      ...(groundingMode ? { groundingMode } : {}),
      ...(groundingExplanation ? { groundingExplanation } : {}),
      ...(posts.length ? { posts } : {}),
      ...(replyPlan.length ? { replyPlan } : {}),
      ...(voiceTarget ? { voiceTarget } : {}),
      ...(noveltyNotes.length ? { noveltyNotes } : {}),
      ...(threadFramingStyle ? { threadFramingStyle } : {}),
      ...(replySourcePreview ? { replySourcePreview } : {}),
    });
    const draftVersion: DraftVersionEntry = {
      id: versionId,
      content,
      source: "manual_save",
      createdAt,
      basedOnVersionId: basedOn.versionId,
      weightedCharacterCount: computeXWeightedCharacterCount(content),
      maxCharacterLimit,
      supportAsset,
      artifact,
    };

    const userContent = "make this the current version";
    const assistantContent = "made this the current version. take a look.";
    const assistantMessageData = {
      reply: assistantContent,
      angles: [],
      quickReplies: [],
      plan: null,
      draft: content,
      drafts: [content],
      draftArtifacts: [artifact] as unknown as Prisma.JsonValue,
      draftVersions: [draftVersion] as unknown as Prisma.JsonValue,
      activeDraftVersionId: versionId,
      previousVersionSnapshot: basedOn as unknown as Prisma.JsonValue,
      revisionChainId,
      supportAsset,
      outputShape: draftKind,
      whyThisWorks: [],
      watchOutFor: [],
      debug: {
        formatExemplar: null,
        topicAnchors: [],
        pinnedVoiceReferences: [],
        pinnedEvidenceReferences: [],
        evidencePack: {
          sourcePostIds: [],
          entities: [],
          metrics: [],
          proofPoints: [],
          storyBeats: [],
          constraints: [],
          requiredEvidenceCount: 0,
        },
        formatBlueprint: "",
        formatSkeleton: "",
        outputShapeRationale: "",
        draftDiagnostics: [],
      },
      source: "deterministic",
      model: "manual-draft-promotion",
      mode: "full_generation",
    } satisfies Prisma.InputJsonValue;

    const [userMessage, assistantMessage] = await prisma.$transaction([
      prisma.chatMessage.create({
        data: {
          threadId: thread.id,
          role: "user",
          content: userContent,
        },
      }),
      prisma.chatMessage.create({
        data: {
          threadId: thread.id,
          role: "assistant",
          content: assistantContent,
          data: assistantMessageData,
        },
      }),
    ]);

    await prisma.chatThread.update({
      where: { id: thread.id },
      data: {
        updatedAt: new Date(),
      },
    });

    await markSupersededDraftVersions({
      userId: session.user.id,
      xHandle: workspaceHandle.xHandle,
      revisionChainId,
      basedOnVersionId: basedOn.versionId,
      exceptDraftVersionIds: [versionId],
    });
    await syncIndexedContentFromChatMessage({
      messageId: assistantMessage.id,
      threadId: thread.id,
      userId: session.user.id,
      xHandle: workspaceHandle.xHandle,
      threadTitle: thread.title,
      data: assistantMessageData,
      sourcePrompt: userContent,
      sourcePlaybook: "draft_promotion",
    });

    const promotedSourceMaterialAssets = await (async () => {
      const xHandle = workspaceHandle.xHandle;
      if (!xHandle || groundingSources.length === 0) {
        return [];
      }

      const inputs = buildPromotedDraftSourceMaterialInputs({
        title: artifact.title,
        content,
        groundingSources,
      });
      if (inputs.length === 0) {
        return [];
      }

      try {
        const existing = await prisma.sourceMaterialAsset.findMany({
          where: {
            userId: session.user.id,
            xHandle,
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
        const created = [];

        for (const input of inputs) {
          const key = buildSourceMaterialIdentityKey(input);
          if (existingKeys.has(key)) {
            continue;
          }

          existingKeys.add(key);
          const record = await prisma.sourceMaterialAsset.create({
            data: {
              userId: session.user.id,
              xHandle,
              type: input.type,
              title: input.title,
              tags: input.tags as unknown as Prisma.InputJsonValue,
              verified: true,
              claims: input.claims as unknown as Prisma.InputJsonValue,
              snippets: input.snippets as unknown as Prisma.InputJsonValue,
              doNotClaim: input.doNotClaim as unknown as Prisma.InputJsonValue,
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
    })();

    void recordProductEvent({
      userId: session.user.id,
      xHandle: workspaceHandle.xHandle,
      threadId: thread.id,
      messageId: assistantMessage.id,
      eventType: "draft_promoted",
      properties: {
        outputShape: draftKind,
        groundingMode: artifact.groundingMode || null,
        groundingSourceCount: artifact.groundingSources?.length || 0,
        promotedSourceMaterialCount: promotedSourceMaterialAssets.length,
      },
    }).catch((eventError) => console.error("Failed to record draft_promoted event:", eventError));

    return NextResponse.json({
      ok: true,
      data: {
        userMessage: {
          id: userMessage.id,
          role: "user",
          content: userContent,
          createdAt: userMessage.createdAt.toISOString(),
        },
        assistantMessage: {
          id: assistantMessage.id,
          role: "assistant",
          content: assistantContent,
          createdAt: assistantMessage.createdAt.toISOString(),
          draft: content,
          drafts: [content],
          draftArtifacts: [artifact],
          draftVersions: [draftVersion],
          activeDraftVersionId: versionId,
          previousVersionSnapshot: basedOn,
          revisionChainId,
          supportAsset,
          outputShape: draftKind,
          source: "deterministic" as const,
          model: "manual-draft-promotion",
        },
        promotedSourceMaterials: {
          count: promotedSourceMaterialAssets.length,
          assets: promotedSourceMaterialAssets,
        },
      },
    });
  } catch (error) {
    console.error("POST draft promotion error:", error);
    return NextResponse.json(
      { ok: false, errors: [{ field: "server", message: "Failed to promote the draft." }] },
      { status: 500 },
    );
  }
}
