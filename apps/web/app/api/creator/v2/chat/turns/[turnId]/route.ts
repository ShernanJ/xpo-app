import { NextRequest, NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth/serverSession";

import { readTurnProgressById } from "../../_lib/control/routeTurnControl";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ turnId: string }> },
) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "auth", message: "Unauthorized" }] },
      { status: 401 },
    );
  }

  const { turnId } = await params;
  const turn = await readTurnProgressById({
    turnId,
    userId: session.user.id,
  });

  if (!turn) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "turn", message: "Turn not found." }] },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    data: {
      turn: {
        turnId: turn.id,
        threadId: turn.threadId,
        status: turn.status,
        progressStepId: turn.progressStepId,
        progressLabel: turn.progressLabel,
        progressExplanation: turn.progressExplanation,
        assistantMessageId: turn.assistantMessageId,
        userMessageId: turn.userMessageId,
        errorCode: turn.errorCode,
        errorMessage: turn.errorMessage,
        startedAt: turn.startedAt?.toISOString() ?? null,
        heartbeatAt: turn.heartbeatAt?.toISOString() ?? null,
        failedAt: turn.failedAt?.toISOString() ?? null,
        completedAt: turn.completedAt?.toISOString() ?? null,
        createdAt: turn.createdAt.toISOString(),
        updatedAt: turn.updatedAt.toISOString(),
      },
    },
  });
}
