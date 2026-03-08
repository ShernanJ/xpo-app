import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth/serverSession";
import { manageConversationTurn } from "@/lib/agent-v2/orchestrator/conversationManager";
import { buildDraftArtifact, type DraftArtifactDetails } from "@/lib/onboarding/draftArtifacts";

interface CandidatePatchRequest extends Record<string, unknown> {
  action?: unknown;
  content?: unknown;
  rejectionReason?: unknown;
  observedMetrics?: unknown;
}

function serializeCandidate(candidate: {
  id: string;
  title: string;
  sourcePrompt: string;
  sourcePlaybook: string | null;
  outputShape: string;
  status: string;
  artifact: unknown;
  voiceTarget: unknown;
  noveltyNotes: unknown;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  approvedAt: Date | null;
  editedAt: Date | null;
  postedAt: Date | null;
  observedAt: Date | null;
  observedMetrics: unknown;
}) {
  return {
    id: candidate.id,
    title: candidate.title,
    sourcePrompt: candidate.sourcePrompt,
    sourcePlaybook: candidate.sourcePlaybook,
    outputShape: candidate.outputShape,
    status: candidate.status,
    artifact: candidate.artifact,
    voiceTarget: candidate.voiceTarget,
    noveltyNotes: candidate.noveltyNotes,
    rejectionReason: candidate.rejectionReason,
    createdAt: candidate.createdAt.toISOString(),
    updatedAt: candidate.updatedAt.toISOString(),
    approvedAt: candidate.approvedAt?.toISOString() ?? null,
    editedAt: candidate.editedAt?.toISOString() ?? null,
    postedAt: candidate.postedAt?.toISOString() ?? null,
    observedAt: candidate.observedAt?.toISOString() ?? null,
    observedMetrics: candidate.observedMetrics ?? null,
  };
}

function parseArtifact(value: unknown): DraftArtifactDetails | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as DraftArtifactDetails;
}

function rebuildArtifact(args: {
  candidateId: string;
  artifact: DraftArtifactDetails;
  content: string;
}): DraftArtifactDetails {
  return buildDraftArtifact({
    id: args.artifact.id || args.candidateId,
    title: args.artifact.title || "Draft",
    kind: args.artifact.kind,
    content: args.content,
    supportAsset: args.artifact.supportAsset || null,
    posts: args.artifact.kind === "thread_seed" ? args.content.split(/\n\s*---\s*\n/g) : undefined,
    replyPlan: args.artifact.replyPlan || [],
    voiceTarget: args.artifact.voiceTarget || null,
    noveltyNotes: args.artifact.noveltyNotes || [],
  });
}

function resolveArtifactKindFromOutputShape(
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

function buildScratchMemoryRecord(args: {
  userId: string;
  runId: string;
  threadId?: string | null;
}) {
  const now = new Date();
  return {
    id: "scratch-memory",
    userId: args.userId,
    threadId: args.threadId ?? null,
    runId: args.runId,
    topicSummary: null,
    activeConstraints: {
      constraints: [],
      conversationState: "collecting_context",
      pendingPlan: null,
      clarificationState: null,
      lastIdeationAngles: [],
      rollingSummary: null,
      assistantTurnCount: 0,
      activeDraftRef: null,
      latestRefinementInstruction: null,
      unresolvedQuestion: null,
      clarificationQuestionsAsked: 0,
      preferredSurfaceMode: null,
      formatPreference: null,
    } as Prisma.JsonValue,
    concreteAnswerCount: 0,
    lastDraftArtifactId: null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, errors: [{ field: "auth", message: "Unauthorized" }] }, { status: 401 });
  }

  let body: CandidatePatchRequest;
  try {
    body = (await request.json()) as CandidatePatchRequest;
  } catch {
    return NextResponse.json(
      { ok: false, errors: [{ field: "body", message: "Request body must be valid JSON." }] },
      { status: 400 },
    );
  }

  const action = typeof body.action === "string" ? body.action.trim() : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const rejectionReason =
    typeof body.rejectionReason === "string" ? body.rejectionReason.trim() : null;

  const { candidateId } = await params;
  const candidate = await prisma.draftCandidate.findUnique({
    where: { id: candidateId },
  });

  if (!candidate || candidate.userId !== session.user.id) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "candidateId", message: "Draft candidate not found." }] },
      { status: 404 },
    );
  }

  const now = new Date();
  const currentArtifact = parseArtifact(candidate.artifact);
  if (!currentArtifact) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "artifact", message: "Stored artifact is invalid." }] },
      { status: 409 },
    );
  }

  if (action === "approve") {
    const updated = await prisma.draftCandidate.update({
      where: { id: candidate.id },
      data: {
        status: "approved",
        approvedAt: now,
      },
    });

    return NextResponse.json({ ok: true, data: { candidate: serializeCandidate(updated) } });
  }

  if (action === "reject") {
    const updated = await prisma.draftCandidate.update({
      where: { id: candidate.id },
      data: {
        status: "rejected",
        rejectionReason: rejectionReason || "Rejected from the draft inbox.",
      },
    });

    return NextResponse.json({ ok: true, data: { candidate: serializeCandidate(updated) } });
  }

  if (action === "edit") {
    if (!content) {
      return NextResponse.json(
        { ok: false, errors: [{ field: "content", message: "Edited content is required." }] },
        { status: 400 },
      );
    }

    const nextArtifact = rebuildArtifact({
      candidateId: candidate.id,
      artifact: currentArtifact,
      content,
    });
    const updated = await prisma.draftCandidate.update({
      where: { id: candidate.id },
      data: {
        status: "edited",
        editedAt: now,
        artifact: nextArtifact as unknown as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({ ok: true, data: { candidate: serializeCandidate(updated) } });
  }

  if (action === "posted") {
    const updated = await prisma.draftCandidate.update({
      where: { id: candidate.id },
      data: {
        status: "posted",
        postedAt: now,
      },
    });

    return NextResponse.json({ ok: true, data: { candidate: serializeCandidate(updated) } });
  }

  if (action === "observed") {
    const updated = await prisma.draftCandidate.update({
      where: { id: candidate.id },
      data: {
        status: "observed",
        observedAt: now,
        observedMetrics:
          body.observedMetrics && typeof body.observedMetrics === "object"
            ? (body.observedMetrics as Prisma.InputJsonValue)
            : Prisma.JsonNull,
      },
    });

    return NextResponse.json({ ok: true, data: { candidate: serializeCandidate(updated) } });
  }

  if (action === "regenerate") {
    if (!candidate.runId || !candidate.xHandle) {
      return NextResponse.json(
        { ok: false, errors: [{ field: "candidate", message: "Candidate is missing generation context." }] },
        { status: 409 },
      );
    }

    const scratchMemoryRecord = buildScratchMemoryRecord({
      userId: session.user.id,
      runId: candidate.runId,
      threadId: candidate.threadId,
    });

    const nextResult = await manageConversationTurn(
      {
        userId: session.user.id,
        xHandle: candidate.xHandle,
        runId: candidate.runId,
        userMessage: candidate.sourcePrompt,
        recentHistory: `user: ${candidate.sourcePrompt}`,
        explicitIntent: "draft",
        formatPreference:
          candidate.outputShape === "thread_seed"
            ? "thread"
            : candidate.outputShape === "long_form_post"
              ? "longform"
              : "shortform",
      },
      {
        async getConversationMemory() {
          return scratchMemoryRecord;
        },
        async createConversationMemory() {
          return scratchMemoryRecord;
        },
        async updateConversationMemory() {
          return scratchMemoryRecord;
        },
      },
    );

    if (nextResult.mode !== "draft" || !nextResult.data?.draft) {
      return NextResponse.json(
        { ok: false, errors: [{ field: "candidate", message: "Could not regenerate this candidate yet." }] },
        { status: 409 },
      );
    }

    const regeneratedArtifact = buildDraftArtifact({
      id: currentArtifact.id,
      title: currentArtifact.title,
      kind: resolveArtifactKindFromOutputShape(nextResult.outputShape) ?? currentArtifact.kind,
      content: nextResult.data.draft,
      supportAsset: nextResult.data.supportAsset || currentArtifact.supportAsset || null,
      voiceTarget: nextResult.data.voiceTarget || currentArtifact.voiceTarget || null,
      noveltyNotes: nextResult.data.noveltyNotes || currentArtifact.noveltyNotes || [],
    });

    const updated = await prisma.draftCandidate.update({
      where: { id: candidate.id },
      data: {
        status: "pending",
        artifact: regeneratedArtifact as unknown as Prisma.InputJsonValue,
        voiceTarget:
          nextResult.data.voiceTarget || currentArtifact.voiceTarget
            ? ((nextResult.data.voiceTarget ||
                currentArtifact.voiceTarget) as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        noveltyNotes: (nextResult.data.noveltyNotes ||
          currentArtifact.noveltyNotes ||
          []) as unknown as Prisma.InputJsonValue,
        rejectionReason: null,
      },
    });

    return NextResponse.json({ ok: true, data: { candidate: serializeCandidate(updated) } });
  }

  return NextResponse.json(
    { ok: false, errors: [{ field: "action", message: "Unsupported candidate action." }] },
    { status: 400 },
  );
}
