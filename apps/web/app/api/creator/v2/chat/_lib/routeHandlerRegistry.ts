import type { NextRequest } from "next/server";

import type { CreatorChatTransportRequest } from "@/lib/agent-v2/contracts/chatTransport";
import type { ChatStreamProgressEventData } from "@/lib/chat/chatStream";

export interface RegisteredChatTurnExecutionControl {
  turnId?: string | null;
  existingUserMessageId?: string | null;
  leaseOwner?: string | null;
  leaseMs?: number;
}

export interface RegisteredChatRouteHandlerArgs {
  request: NextRequest;
  body: CreatorChatTransportRequest & Record<string, unknown>;
  monetizationEnabled: boolean;
  userId: string;
  onProgress?: (data: ChatStreamProgressEventData) => Promise<void> | void;
  turnControl?: RegisteredChatTurnExecutionControl;
}

type RegisteredChatRouteHandler = (
  args: RegisteredChatRouteHandlerArgs,
) => Promise<Response>;

declare global {
  var __creatorChatRouteHandler: RegisteredChatRouteHandler | undefined;
}

export function registerChatRouteHandler(handler: RegisteredChatRouteHandler) {
  globalThis.__creatorChatRouteHandler = handler;
}

export function getChatRouteHandler() {
  if (!globalThis.__creatorChatRouteHandler) {
    throw new Error("Chat route handler is not registered.");
  }

  return globalThis.__creatorChatRouteHandler;
}
