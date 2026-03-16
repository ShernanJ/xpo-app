import { NextRequest, NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth/serverSession";
import { normalizeClientTurnId } from "@/lib/agent-v2/contracts/chatTransport";

import { requestTurnCancellation } from "../_lib/control/routeTurnControl";
import { consumeRateLimit } from "@/lib/security/rateLimit";
import {
  buildErrorResponse,
  getRequestIp,
  parseJsonBody,
  requireAllowedOrigin,
} from "@/lib/security/requestValidation";

interface InterruptRequestBody extends Record<string, unknown> {
  turnId?: unknown;
  runId?: unknown;
  clientTurnId?: unknown;
  threadId?: unknown;
}

export async function POST(request: NextRequest) {
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

  const rateLimit = await consumeRateLimit({
    key: `creator:v2_chat_interrupt:user:${session.user.id}:${getRequestIp(request)}`,
    limit: 20,
    windowMs: 60 * 1000,
  });
  if (!rateLimit.ok) {
    return buildErrorResponse({
      status: 429,
      field: "rate",
      message: "Too many interrupt requests. Please wait a moment before trying again.",
      extras: {
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
    });
  }

  const bodyResult = await parseJsonBody<InterruptRequestBody>(request, {
    maxBytes: 8 * 1024,
  });
  if (!bodyResult.ok) {
    return bodyResult.response;
  }
  const body = bodyResult.value;

  const turnId = typeof body.turnId === "string" ? body.turnId.trim() : "";
  const runId = typeof body.runId === "string" ? body.runId.trim() : "";
  const clientTurnId = normalizeClientTurnId(body.clientTurnId);
  const threadId = typeof body.threadId === "string" ? body.threadId.trim() : "";

  if (!turnId && (!runId || !clientTurnId)) {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ field: "payload", message: "turnId or runId + clientTurnId are required." }],
      },
      { status: 400 },
    );
  }

  const status = await requestTurnCancellation({
    turnId: turnId || null,
    userId: session.user.id,
    runId: runId || null,
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
