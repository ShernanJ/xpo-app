export interface ThreadHistoryMessageLike {
  id: string;
  threadId?: string;
  role: "assistant" | "user";
  content: string;
  createdAt?: string;
  feedbackValue?: "up" | "down" | null;
}

export interface ThreadHistoryHydrationResult<TMessage extends ThreadHistoryMessageLike> {
  messages: TMessage[];
  shouldJumpToBottom: boolean;
}

interface RawThreadHistoryMessage<TMessage extends ThreadHistoryMessageLike> {
  id: string;
  role: TMessage["role"];
  content: string;
  createdAt?: unknown;
  threadId?: unknown;
  feedbackValue?: unknown;
  data?: Partial<TMessage> | null;
}

export function resolveThreadHistoryHydration<TMessage extends ThreadHistoryMessageLike>(args: {
  rawMessages: Array<RawThreadHistoryMessage<TMessage>>;
  activeThreadId: string | null;
  shouldJumpToBottomAfterSwitch: boolean;
}): ThreadHistoryHydrationResult<TMessage> {
  return {
    messages: args.rawMessages.map(
      (message) =>
        ({
          id: message.id,
          role: message.role,
          content: message.content,
          createdAt:
            typeof message.createdAt === "string" ? message.createdAt : undefined,
          ...(message.data || {}),
          threadId:
            typeof message.threadId === "string"
              ? message.threadId
              : args.activeThreadId ?? undefined,
          feedbackValue:
            message.feedbackValue === "up" || message.feedbackValue === "down"
              ? message.feedbackValue
              : null,
        }) as TMessage,
    ),
    shouldJumpToBottom: args.shouldJumpToBottomAfterSwitch,
  };
}
