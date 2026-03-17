import { NextRequest } from "next/server";

import type { CreatorChatTransportRequest } from "@/lib/agent-v2/contracts/chatTransport";
import { isMonetizationEnabled } from "@/lib/billing/monetization";

import "../../route";
import {
  claimNextExecutableTurn,
  claimTurnExecutionLease,
  markTurnCancelled,
  markTurnCompleted,
  markTurnFailed,
} from "../control/routeTurnControl";
import { getChatRouteHandler } from "../routeHandlerRegistry";

const DEFAULT_CHAT_TURN_LEASE_MS = Math.max(
  5_000,
  Number.parseInt(process.env.CHAT_TURN_LEASE_MS ?? "30000", 10) || 30_000,
);

interface StoredChatTurnRequestPayload {
  body?: CreatorChatTransportRequest;
  activeHandle?: string | null;
}

function buildWorkerLeaseOwner() {
  const pid = typeof process.pid === "number" ? process.pid : "na";
  return `worker:${pid}:${Date.now().toString(36)}`;
}

function resolveInternalAppUrl() {
  const raw =
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "http://localhost:3000";

  try {
    return new URL(raw).origin;
  } catch {
    return "http://localhost:3000";
  }
}

function extractStoredTurnPayload(value: unknown): StoredChatTurnRequestPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const payload = value as Record<string, unknown>;
  const body =
    payload.body && typeof payload.body === "object" && !Array.isArray(payload.body)
      ? (payload.body as CreatorChatTransportRequest)
      : null;
  const activeHandle =
    typeof payload.activeHandle === "string" && payload.activeHandle.trim()
      ? payload.activeHandle.trim()
      : null;

  if (!body) {
    return null;
  }

  return {
    body,
    activeHandle,
  };
}

function buildResumeRequest(payload: StoredChatTurnRequestPayload) {
  const headers = new Headers({
    "content-type": "application/json",
    origin: resolveInternalAppUrl(),
  });

  if (
    !(
      typeof payload.body?.workspaceHandle === "string" &&
      payload.body.workspaceHandle.trim()
    ) &&
    payload.activeHandle
  ) {
    headers.set("x-workspace-handle", payload.activeHandle);
  }

  return new NextRequest(`${resolveInternalAppUrl()}/api/creator/v2/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload.body),
  });
}

async function readResponsePayload(response: Response) {
  try {
    return (await response.clone().json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function resolveResponseMessage(payload: Record<string, unknown> | null) {
  const errors = payload?.errors;
  if (!Array.isArray(errors)) {
    return "The turn failed before completion.";
  }

  const firstError = errors.find(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      typeof (entry as Record<string, unknown>).message === "string",
  ) as { message?: string } | undefined;

  return firstError?.message?.trim() || "The turn failed before completion.";
}

const handleChatRouteRequest = getChatRouteHandler();

async function finalizeClaimedTurn(args: {
  turn: {
    id: string;
    userId: string;
    runId: string;
    clientTurnId: string;
  };
  response: Response;
}) {
  const payload = await readResponsePayload(args.response);
  const code =
    payload && typeof payload.code === "string" ? payload.code : null;
  const data =
    payload && payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
      ? (payload.data as Record<string, unknown>)
      : null;
  const assistantMessageId =
    data && typeof data.messageId === "string" ? data.messageId : null;

  if (args.response.ok) {
    await markTurnCompleted({
      userId: args.turn.userId,
      runId: args.turn.runId,
      clientTurnId: args.turn.clientTurnId,
      turnId: args.turn.id,
      assistantMessageId,
    });
    return {
      ok: true as const,
      status: "completed" as const,
    };
  }

  if (code === "TURN_CANCELLED") {
    await markTurnCancelled({
      userId: args.turn.userId,
      runId: args.turn.runId,
      clientTurnId: args.turn.clientTurnId,
      turnId: args.turn.id,
    });
    return {
      ok: true as const,
      status: "cancelled" as const,
    };
  }

  await markTurnFailed({
    userId: args.turn.userId,
    runId: args.turn.runId,
    clientTurnId: args.turn.clientTurnId,
    turnId: args.turn.id,
    errorCode: code ?? "TURN_FAILED",
    errorMessage: resolveResponseMessage(payload),
  });

  return {
    ok: false as const,
    status: "failed" as const,
  };
}

export async function processChatTurnById(args: {
  turnId: string;
  userId: string;
  leaseOwner?: string;
  leaseMs?: number;
}) {
  const leaseOwner = args.leaseOwner ?? buildWorkerLeaseOwner();
  const leaseMs = Math.max(5_000, args.leaseMs ?? DEFAULT_CHAT_TURN_LEASE_MS);
  const claimedTurn = await claimTurnExecutionLease({
    turnId: args.turnId,
    userId: args.userId,
    leaseOwner,
    leaseMs,
  });

  if (!claimedTurn?.runId || !claimedTurn.clientTurnId) {
    return {
      ok: false as const,
      claimed: false,
      status: "missing" as const,
    };
  }

  const payload = extractStoredTurnPayload(claimedTurn.requestPayload);
  if (!payload?.body) {
    await markTurnFailed({
      userId: claimedTurn.userId,
      runId: claimedTurn.runId,
      clientTurnId: claimedTurn.clientTurnId,
      turnId: claimedTurn.id,
      errorCode: "INVALID_TURN_PAYLOAD",
      errorMessage: "The queued chat turn payload is missing or invalid.",
    });
    return {
      ok: false as const,
      claimed: true,
      status: "failed" as const,
    };
  }

  const response = await handleChatRouteRequest({
    request: buildResumeRequest(payload),
    body: payload.body as CreatorChatTransportRequest & Record<string, unknown>,
    monetizationEnabled: isMonetizationEnabled(),
    userId: claimedTurn.userId,
    turnControl: {
      turnId: claimedTurn.id,
      existingUserMessageId: claimedTurn.userMessageId,
      leaseOwner,
      leaseMs,
    },
  });

  const finalized = await finalizeClaimedTurn({
    turn: {
      id: claimedTurn.id,
      userId: claimedTurn.userId,
      runId: claimedTurn.runId,
      clientTurnId: claimedTurn.clientTurnId,
    },
    response,
  });

  return {
    ok: finalized.ok,
    claimed: true,
    turnId: claimedTurn.id,
    status: finalized.status,
  };
}

export async function processNextQueuedChatTurn(args?: {
  leaseOwner?: string;
  leaseMs?: number;
}) {
  const leaseOwner = args?.leaseOwner ?? buildWorkerLeaseOwner();
  const leaseMs = Math.max(5_000, args?.leaseMs ?? DEFAULT_CHAT_TURN_LEASE_MS);
  const turn = await claimNextExecutableTurn({
    leaseOwner,
    leaseMs,
  });

  if (!turn) {
    return {
      ok: true as const,
      jobId: null,
      status: "idle" as const,
    };
  }

  return processChatTurnById({
    turnId: turn.id,
    userId: turn.userId,
    leaseOwner,
    leaseMs,
  });
}
