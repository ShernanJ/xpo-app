import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@/lib/generated/prisma/client";
import { authOptions } from "@/lib/auth/authOptions";
import { prisma } from "@/lib/db";
import {
  buildDraftArtifact,
  computeXWeightedCharacterCount,
  type DraftArtifactDetails,
} from "@/lib/onboarding/draftArtifacts";

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
}): DraftArtifactDetails {
  const artifact = buildDraftArtifact({
    id: params.id,
    title: params.title,
    kind: params.kind,
    content: params.content,
    supportAsset: params.supportAsset,
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
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "auth", message: "Unauthorized" }] },
      { status: 401 },
    );
  }

  let body: DraftPromotionRequest;

  try {
    body = (await request.json()) as DraftPromotionRequest;
  } catch {
    return NextResponse.json(
      { ok: false, errors: [{ field: "body", message: "Request body must be valid JSON." }] },
      { status: 400 },
    );
  }

  const content = typeof body.content === "string" ? body.content.trim() : "";
  const outputShape = typeof body.outputShape === "string" ? body.outputShape.trim() : "";
  const supportAsset = typeof body.supportAsset === "string" ? body.supportAsset : null;
  const maxCharacterLimit =
    typeof body.maxCharacterLimit === "number" && body.maxCharacterLimit > 0
      ? body.maxCharacterLimit
      : 280;
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
    const { threadId } = await params;

    const thread = await prisma.chatThread.findUnique({
      where: { id: threadId },
    });

    if (!thread || thread.userId !== session.user.id) {
      return NextResponse.json(
        { ok: false, errors: [{ field: "threadId", message: "Thread not found or unauthorized." }] },
        { status: 404 },
      );
    }

    const versionId = buildVersionId();
    const createdAt = new Date().toISOString();
    const artifact = buildDraftArtifactWithLimit({
      id: `${thread.id}-${versionId}`,
      title: "Draft",
      kind: draftKind,
      content,
      supportAsset,
      maxCharacterLimit,
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
    };

    const userContent = "make this the current version";
    const assistantContent = "made this the current version. take a look.";

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
          data: {
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
          } as Prisma.InputJsonValue,
        },
      }),
    ]);

    await prisma.chatThread.update({
      where: { id: thread.id },
      data: {
        updatedAt: new Date(),
      },
    });

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
