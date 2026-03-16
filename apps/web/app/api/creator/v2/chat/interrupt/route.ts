import { NextRequest, NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth/serverSession";
import { normalizeClientTurnId } from "@/lib/agent-v2/contracts/chatTransport";

import { requestTurnCancellation } from "../_lib/control/routeTurnControl";

interface InterruptRequestBody extends Record<string, unknown> {
  runId?: unknown;
  clientTurnId?: unknown;
  threadId?: unknown;
}

export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "auth", message: "Unauthorized" }] },
      { status: 401 },
    );
  }

  let body: InterruptRequestBody;
  try {
    body = (await request.json()) as InterruptRequestBody;
  } catch {
    return NextResponse.json(
      { ok: false, errors: [{ field: "body", message: "Request body must be valid JSON." }] },
      { status: 400 },
    );
  }

  const runId = typeof body.runId === "string" ? body.runId.trim() : "";
  const clientTurnId = normalizeClientTurnId(body.clientTurnId);
  const threadId = typeof body.threadId === "string" ? body.threadId.trim() : "";

  if (!runId || !clientTurnId) {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ field: "payload", message: "runId and clientTurnId are required." }],
      },
      { status: 400 },
    );
  }

  const status = await requestTurnCancellation({
    userId: session.user.id,
    runId,
    clientTurnId,
    threadId: threadId || null,
  });

  return NextResponse.json({
    ok: true,
    data: {
      status,
    },
  });
}
