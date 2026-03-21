import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth/serverSession";
import { normalizeWorkspaceHandle } from "@/lib/workspaceHandle";
import { readWorkspaceHandleStateForUser } from "@/lib/userHandles.server";
import {
  enforceSessionMutationRateLimit,
  parseJsonBody,
  requireAllowedOrigin,
} from "@/lib/security/requestValidation";

export async function GET() {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const handleState = await readWorkspaceHandleStateForUser({
      userId: session.user.id,
      sessionActiveHandle: session.user.activeXHandle,
    });

    return NextResponse.json({
      ok: true,
      data: {
        activeHandle: handleState.activeHandle,
        handles: handleState.handles,
      },
    });
  } catch (error) {
    console.error("Failed to fetch user handles:", error);
    return NextResponse.json({ ok: false, error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const originError = requireAllowedOrigin(req);
  if (originError) {
    return originError;
  }

  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const rateLimitError = await enforceSessionMutationRateLimit(req, {
    userId: session.user.id,
    scope: "creator:profile_handles",
    user: {
      limit: 20,
      windowMs: 5 * 60 * 1000,
      message: "Too many handle updates. Please wait before trying again.",
    },
    ip: {
      limit: 50,
      windowMs: 5 * 60 * 1000,
      message: "Too many handle updates from this network. Please wait before trying again.",
    },
  });
  if (rateLimitError) {
    return rateLimitError;
  }

  try {
    const bodyResult = await parseJsonBody<{ handle?: unknown }>(req, {
      maxBytes: 4 * 1024,
    });
    if (!bodyResult.ok) {
      return bodyResult.response;
    }
    const normalizedHandle =
      typeof bodyResult.value.handle === "string"
        ? normalizeWorkspaceHandle(bodyResult.value.handle)
        : null;

    if (!normalizedHandle) {
      return NextResponse.json({ ok: false, error: "Handle is required" }, { status: 400 });
    }

    const handleState = await readWorkspaceHandleStateForUser({
      userId: session.user.id,
      sessionActiveHandle: session.user.activeXHandle,
    });
    if (!handleState.handles.includes(normalizedHandle)) {
      return NextResponse.json({ ok: false, error: "Handle not found." }, { status: 404 });
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { activeXHandle: normalizedHandle },
    });

    return NextResponse.json({
      ok: true,
      data: {
        activeHandle: normalizedHandle,
        handles: handleState.handles,
      },
    });
  } catch (error) {
    console.error("Failed to update active handle:", error);
    return NextResponse.json({ ok: false, error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const originError = requireAllowedOrigin(req);
  if (originError) {
    return originError;
  }

  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const rateLimitError = await enforceSessionMutationRateLimit(req, {
    userId: session.user.id,
    scope: "creator:profile_handles",
    user: {
      limit: 20,
      windowMs: 5 * 60 * 1000,
      message: "Too many handle updates. Please wait before trying again.",
    },
    ip: {
      limit: 50,
      windowMs: 5 * 60 * 1000,
      message: "Too many handle updates from this network. Please wait before trying again.",
    },
  });
  if (rateLimitError) {
    return rateLimitError;
  }

  try {
    const bodyResult = await parseJsonBody<{ handle?: unknown }>(req, {
      maxBytes: 4 * 1024,
    });
    if (!bodyResult.ok) {
      return bodyResult.response;
    }

    const normalizedHandle =
      typeof bodyResult.value.handle === "string"
        ? normalizeWorkspaceHandle(bodyResult.value.handle)
        : null;

    if (!normalizedHandle) {
      return NextResponse.json({ ok: false, error: "Handle is required" }, { status: 400 });
    }

    const activeHandle = normalizeWorkspaceHandle(session.user.activeXHandle ?? null);
    if (normalizedHandle === activeHandle) {
      return NextResponse.json(
        { ok: false, error: "The active handle cannot be removed from settings." },
        { status: 400 },
      );
    }

    const handleState = await readWorkspaceHandleStateForUser({
      userId: session.user.id,
      sessionActiveHandle: session.user.activeXHandle,
    });
    if (!handleState.handles.includes(normalizedHandle)) {
      return NextResponse.json({ ok: false, error: "Handle not found." }, { status: 404 });
    }

    const onboardingRuns = await prisma.onboardingRun.findMany({
      where: { userId: session.user.id },
      select: { id: true, input: true },
    });
    const onboardingRunIds = onboardingRuns
      .filter((run) => {
        const input = run.input as { account?: string } | null;
        return normalizeWorkspaceHandle(input?.account ?? null) === normalizedHandle;
      })
      .map((run) => run.id);

    await prisma.$transaction(async (tx) => {
      await tx.productEvent.deleteMany({
        where: { userId: session.user.id, xHandle: normalizedHandle },
      });
      await tx.replyGoldenExample.deleteMany({
        where: { userId: session.user.id, xHandle: normalizedHandle },
      });
      await tx.replyOpportunity.deleteMany({
        where: { userId: session.user.id, xHandle: normalizedHandle },
      });
      await tx.feedbackSubmission.deleteMany({
        where: { userId: session.user.id, xHandle: normalizedHandle },
      });
      await tx.sourceMaterialAsset.deleteMany({
        where: { userId: session.user.id, xHandle: normalizedHandle },
      });
      await tx.voiceProfile.deleteMany({
        where: { userId: session.user.id, xHandle: normalizedHandle },
      });
      await tx.post.deleteMany({
        where: { userId: session.user.id, xHandle: normalizedHandle },
      });
      await tx.draftCandidate.deleteMany({
        where: { userId: session.user.id, xHandle: normalizedHandle },
      });
      await tx.chatThread.deleteMany({
        where: { userId: session.user.id, xHandle: normalizedHandle },
      });

      if (onboardingRunIds.length > 0) {
        await tx.onboardingRun.deleteMany({
          where: {
            id: {
              in: onboardingRunIds,
            },
          },
        });
      }

      await tx.userHandle.deleteMany({
        where: {
          userId: session.user.id,
          xHandle: normalizedHandle,
        },
      });
    });

    const nextHandleState = await readWorkspaceHandleStateForUser({
      userId: session.user.id,
      sessionActiveHandle: session.user.activeXHandle,
    });

    return NextResponse.json({
      ok: true,
      data: {
        activeHandle: nextHandleState.activeHandle,
        handles: nextHandleState.handles,
      },
    });
  } catch (error) {
    console.error("Failed to remove handle:", error);
    return NextResponse.json({ ok: false, error: "Internal Server Error" }, { status: 500 });
  }
}
