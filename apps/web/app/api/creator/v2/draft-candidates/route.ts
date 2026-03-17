import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth/serverSession";
import { manageConversationTurn } from "@/lib/agent-v2/runtime/conversationManager";
import { buildCreatorProfileHintsFromCreatorProfile } from "@/lib/agent-v2/grounding/creatorProfileHints";
import { serializeDraftReviewCandidate } from "@/lib/content/contentHub";
import { buildCreatorAgentContext } from "@/lib/onboarding/strategy/agentContext";
import { getXCharacterLimitForAccount } from "@/lib/onboarding/shared/draftArtifacts";
import { readLatestOnboardingRunByHandle } from "@/lib/onboarding/store/onboardingRunStore";
import type { DraftFormatPreference } from "@/lib/agent-v2/contracts/chat";
import { buildInitialDraftVersionPayload } from "../chat/_lib/request/routeLogic";
import {
  resolveOwnedThreadForWorkspace,
  resolveWorkspaceHandleForRequest,
} from "@/lib/workspaceHandle.server";
import {
  enforceSessionMutationRateLimit,
  parseJsonBody,
  requireAllowedOrigin,
} from "@/lib/security/requestValidation";

interface DraftCandidatesRequest extends Record<string, unknown> {
  count?: unknown;
  threadId?: unknown;
  runId?: unknown;
}

interface DraftQueueBrief {
  title: string;
  prompt: string;
  formatPreference: DraftFormatPreference;
  sourcePlaybook: string;
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
    version: 1,
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

function extractLineSeed(value: string): string | null {
  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines[0] || null;
}

function buildDraftQueueBriefs(args: {
  context: ReturnType<typeof buildCreatorAgentContext>;
  count: number;
}): DraftQueueBrief[] {
  const creatorProfile = args.context.creatorProfile;
  const recommendedAngles = creatorProfile.strategy.recommendedAngles.slice(0, 2);
  const experimentFocus = creatorProfile.playbook.experimentFocus.slice(0, 2);
  const bestAnchor = creatorProfile.examples.bestPerforming[0] || creatorProfile.examples.voiceAnchors[0];
  const bestAnchorSeed = bestAnchor ? extractLineSeed(bestAnchor.text) : null;
  const briefs: DraftQueueBrief[] = [];

  for (const angle of recommendedAngles) {
    briefs.push({
      title: angle.slice(0, 80),
      prompt: `draft a post about ${angle}. keep it in my voice and make it feel native to x.`,
      formatPreference: "shortform",
      sourcePlaybook: "recommended_angle",
    });
  }

  if (experimentFocus[0]) {
    briefs.push({
      title: experimentFocus[0].slice(0, 80),
      prompt: `draft a post about ${experimentFocus[0]}. keep it concrete and tied to what i usually talk about.`,
      formatPreference: "shortform",
      sourcePlaybook: "experiment_focus",
    });
  }

  const threadSeed = recommendedAngles[0] || experimentFocus[0] || bestAnchorSeed;
  if (threadSeed) {
    briefs.push({
      title: `thread: ${threadSeed}`.slice(0, 80),
      prompt: `draft a thread about ${threadSeed}. keep it in my voice, 4 to 6 posts, and make each post fit on x.`,
      formatPreference: "thread",
      sourcePlaybook: "thread_playbook",
    });
  }

  if (bestAnchorSeed) {
    briefs.push({
      title: `angle from ${bestAnchorSeed}`.slice(0, 80),
      prompt: `draft a post in the same territory as this recent theme: ${bestAnchorSeed}. keep it fresh and not too close to the original wording.`,
      formatPreference:
        creatorProfile.playbook.cadence.threadBias === "high" ? "thread" : "shortform",
      sourcePlaybook: "best_anchor",
    });
  }

  const deduped = new Map<string, DraftQueueBrief>();
  for (const brief of briefs) {
    const key = `${brief.formatPreference}:${brief.title.toLowerCase()}`;
    if (!deduped.has(key)) {
      deduped.set(key, brief);
    }
  }

  return Array.from(deduped.values()).slice(0, args.count);
}

export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, errors: [{ field: "auth", message: "Unauthorized" }] }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const threadId = searchParams.get("threadId");
  const workspaceHandle = await resolveWorkspaceHandleForRequest({
    request,
    session,
  });
  if (!workspaceHandle.ok) {
    return workspaceHandle.response;
  }

  if (threadId) {
    const ownedThread = await resolveOwnedThreadForWorkspace({
      threadId,
      userId: session.user.id,
      xHandle: workspaceHandle.xHandle,
    });
    if (!ownedThread.ok) {
      return ownedThread.response;
    }
  }

  const candidates = await prisma.draftCandidate.findMany({
    where: {
      userId: session.user.id,
      xHandle: workspaceHandle.xHandle,
      ...(threadId ? { threadId } : {}),
    },
    include: {
      folder: true,
    },
    orderBy: { createdAt: "desc" },
    take: 40,
  });

  return NextResponse.json({
    ok: true,
    data: {
      candidates: candidates.map(serializeDraftReviewCandidate),
    },
  });
}

export async function POST(request: NextRequest) {
  const originError = requireAllowedOrigin(request);
  if (originError) {
    return originError;
  }

  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, errors: [{ field: "auth", message: "Unauthorized" }] }, { status: 401 });
  }

  const rateLimitError = await enforceSessionMutationRateLimit(request, {
    userId: session.user.id,
    scope: "creator:v2_draft_candidates",
    user: {
      limit: 10,
      windowMs: 10 * 60 * 1000,
      message: "Too many draft candidate generation requests. Please wait before trying again.",
    },
    ip: {
      limit: 20,
      windowMs: 10 * 60 * 1000,
      message: "Too many draft candidate generation requests from this network. Please wait before trying again.",
    },
  });
  if (rateLimitError) {
    return rateLimitError;
  }
  const bodyResult = await parseJsonBody<DraftCandidatesRequest | null>(request, {
    maxBytes: 16 * 1024,
    allowEmpty: true,
  });
  if (!bodyResult.ok) {
    return bodyResult.response;
  }
  const body = bodyResult.value ?? {};

  const count =
    typeof body.count === "number" && Number.isFinite(body.count)
      ? Math.max(1, Math.min(5, Math.round(body.count)))
      : 4;
  const workspaceHandle = await resolveWorkspaceHandleForRequest({
    request,
    session,
  });
  if (!workspaceHandle.ok) {
    return workspaceHandle.response;
  }

  const activeHandle = workspaceHandle.xHandle;
  const threadId = typeof body.threadId === "string" && body.threadId.trim() ? body.threadId.trim() : null;
  const requestedRunId = typeof body.runId === "string" && body.runId.trim() ? body.runId.trim() : null;

  if (threadId) {
    const ownedThread = await resolveOwnedThreadForWorkspace({
      threadId,
      userId: session.user.id,
      xHandle: activeHandle,
    });
    if (!ownedThread.ok) {
      return ownedThread.response;
    }
  }

  const storedRun = requestedRunId
    ? await prisma.onboardingRun.findUnique({ where: { id: requestedRunId } }).then((run) => {
        const runHandle =
          run?.input && typeof run.input === "object" && !Array.isArray(run.input)
            ? (run.input as { account?: string }).account
            : null;
        if (!run || run.userId !== session.user.id || runHandle?.trim().replace(/^@+/, "").toLowerCase() !== activeHandle) {
          return null;
        }

        return {
          runId: run.id,
          input: run.input,
          result: run.result,
        };
      })
    : await readLatestOnboardingRunByHandle(session.user.id, activeHandle);

  if (!storedRun) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "runId", message: "No onboarding run found for this profile." }] },
      { status: 404 },
    );
  }

  const context = buildCreatorAgentContext({
    runId: storedRun.runId,
    onboarding: storedRun.result as Parameters<typeof buildCreatorAgentContext>[0]["onboarding"],
  });
  const threadPostMaxCharacterLimit = getXCharacterLimitForAccount(
    Boolean(context.creatorProfile.identity.isVerified),
  );
  const creatorProfileHints = buildCreatorProfileHintsFromCreatorProfile({
    creatorProfile: context.creatorProfile,
    preferredOutputShape:
      context.creatorProfile.playbook.cadence.threadBias === "high"
        ? "thread_seed"
        : context.creatorProfile.voice.averageLengthBand === "long"
          ? "long_form_post"
          : "short_form_post",
  });

  const briefs = buildDraftQueueBriefs({ context, count });
  const scratchMemoryRecord = buildScratchMemoryRecord({
    userId: session.user.id,
    runId: storedRun.runId,
    threadId,
  });
  const createdCandidates = [];

  for (const brief of briefs) {
    const result = await manageConversationTurn(
      {
        userId: session.user.id,
        xHandle: activeHandle,
        runId: storedRun.runId,
        userMessage: brief.prompt,
        recentHistory: `user: ${brief.prompt}`,
        explicitIntent: "draft",
        formatPreference: brief.formatPreference,
        creatorProfileHints,
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

    if (result.mode !== "draft" || !result.data?.draft) {
      continue;
    }

    const payload = buildInitialDraftVersionPayload({
      draft: result.data.draft,
      outputShape: result.outputShape,
      supportAsset: result.data.supportAsset || null,
      selectedDraftContext: null,
      groundingSources: result.data.groundingSources ?? [],
      voiceTarget: result.data.voiceTarget ?? null,
      noveltyNotes: result.data.noveltyNotes ?? [],
      threadPostMaxCharacterLimit,
      threadFramingStyle: result.data.threadFramingStyle ?? null,
    });
    const artifact = payload.draftArtifacts[0] || null;
    if (!artifact) {
      continue;
    }

    const created = await prisma.draftCandidate.create({
      data: {
        userId: session.user.id,
        xHandle: activeHandle,
        threadId,
        runId: storedRun.runId,
        title: brief.title,
        sourcePrompt: brief.prompt,
        sourcePlaybook: brief.sourcePlaybook,
        outputShape: result.outputShape,
        status: "DRAFT",
        draftVersionId: payload.activeDraftVersionId ?? null,
        basedOnVersionId: payload.draftVersions?.[0]?.basedOnVersionId ?? null,
        revisionChainId: payload.revisionChainId ?? null,
        artifact: artifact as unknown as Prisma.InputJsonValue,
        voiceTarget: result.data.voiceTarget
          ? (result.data.voiceTarget as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        noveltyNotes: (result.data.noveltyNotes ?? []) as unknown as Prisma.InputJsonValue,
      },
      include: {
        folder: true,
      },
    });
    createdCandidates.push(serializeDraftReviewCandidate(created));
  }

  return NextResponse.json({
    ok: true,
    data: {
      candidates: createdCandidates,
    },
  });
}
