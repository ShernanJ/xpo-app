import type { ChatRouteResponseData } from "./routeLogic.ts";

interface ThreadMessageSnapshot {
  id: string;
  role: string;
  data: unknown;
  createdAt?: Date | string;
}

export interface DuplicateTurnReplay {
  assistantMessageId: string;
  mappedData: ChatRouteResponseData;
}

export interface DuplicateTurnLookupDeps {
  listThreadMessages: (args: {
    threadId: string;
  }) => Promise<ThreadMessageSnapshot[]>;
}

function readStoredClientTurnId(data: unknown): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }

  const record = data as {
    version?: unknown;
    clientTurnId?: unknown;
  };
  if (record.version !== "user_context_v2") {
    return null;
  }

  return typeof record.clientTurnId === "string" && record.clientTurnId.trim().length > 0
    ? record.clientTurnId
    : null;
}

function isStoredAssistantMessageData(data: unknown): data is ChatRouteResponseData {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return false;
  }

  const record = data as {
    reply?: unknown;
    outputShape?: unknown;
    surfaceMode?: unknown;
    memory?: unknown;
    requestTrace?: {
      clientTurnId?: unknown;
    } | null;
  };

  return (
    typeof record.reply === "string" &&
    typeof record.outputShape === "string" &&
    typeof record.surfaceMode === "string" &&
    typeof record.memory === "object" &&
    record.memory !== null &&
    typeof record.requestTrace?.clientTurnId !== "undefined"
  );
}

function orderMessagesAscending(messages: ThreadMessageSnapshot[]): ThreadMessageSnapshot[] {
  return [...messages].sort((left, right) => {
    const leftTime =
      left.createdAt instanceof Date
        ? left.createdAt.getTime()
        : typeof left.createdAt === "string"
          ? new Date(left.createdAt).getTime()
          : Number.NaN;
    const rightTime =
      right.createdAt instanceof Date
        ? right.createdAt.getTime()
        : typeof right.createdAt === "string"
          ? new Date(right.createdAt).getTime()
          : Number.NaN;

    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return leftTime - rightTime;
    }

    return 0;
  });
}

export function findDuplicateTurnReplayInMessages(args: {
  clientTurnId: string;
  messages: ThreadMessageSnapshot[];
}): DuplicateTurnReplay | null {
  const messages = orderMessagesAscending(args.messages);

  for (let index = 0; index < messages.length; index += 1) {
    const candidate = messages[index];
    if (candidate.role !== "user") {
      continue;
    }

    if (readStoredClientTurnId(candidate.data) !== args.clientTurnId) {
      continue;
    }

    for (let cursor = index + 1; cursor < messages.length; cursor += 1) {
      const nextMessage = messages[cursor];
      if (nextMessage.role === "user") {
        break;
      }

      if (nextMessage.role === "assistant" && isStoredAssistantMessageData(nextMessage.data)) {
        return {
          assistantMessageId: nextMessage.id,
          mappedData: nextMessage.data,
        };
      }
    }
  }

  return null;
}

export async function findDuplicateTurnReplay(
  args: {
    threadId: string;
    clientTurnId: string;
  },
  deps: DuplicateTurnLookupDeps,
): Promise<DuplicateTurnReplay | null> {
  const messages = await deps.listThreadMessages({
    threadId: args.threadId,
  });

  return findDuplicateTurnReplayInMessages({
    clientTurnId: args.clientTurnId,
    messages,
  });
}
