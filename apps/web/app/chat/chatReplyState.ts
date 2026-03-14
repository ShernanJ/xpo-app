export type ChatResultOutputShape =
  | "coach_question"
  | "ideation_angles"
  | "planning_outline"
  | "short_form_post"
  | "long_form_post"
  | "thread_seed"
  | "reply_candidate"
  | "quote_candidate";

export type ChatResultSurfaceMode =
  | "answer_directly"
  | "ask_one_question"
  | "revise_and_return"
  | "offer_options"
  | "generate_full_output";

export interface DraftVersionSnapshotLike {
  messageId: string;
  versionId: string;
}

export interface DraftVersionEntryLike {
  id: string;
}

export interface DraftDrawerSelectionLike {
  messageId: string;
  versionId: string;
  revisionChainId?: string;
}
export {
  applyCreatedThreadPlanToList,
  resolveCreatedThreadPlan,
  type ChatThreadListItemLike,
  type CreatedThreadPlan,
} from "./chatWorkspaceState.ts";

export interface ChatReplyResultLike<
  TQuickReply,
  TPlan,
  TDraftArtifact,
  TDraftVersion extends DraftVersionEntryLike,
  TDraftBundle,
  TPreviousVersion,
  TReplyArtifacts,
  TReplyParse,
  TContextPacket,
  TMemory,
  TBilling,
> {
  reply: string;
  angles: unknown[];
  quickReplies?: TQuickReply[];
  plan?: TPlan | null;
  draft?: string | null;
  drafts: string[];
  draftArtifacts: TDraftArtifact[];
  draftVersions?: TDraftVersion[];
  activeDraftVersionId?: string;
  draftBundle?: TDraftBundle | null;
  previousVersionSnapshot?: TPreviousVersion | null;
  revisionChainId?: string;
  supportAsset: string | null;
  autoSavedSourceMaterials?: {
    count: number;
    assets: Array<{
      id: string;
      title: string;
      deletable: boolean;
    }>;
  } | null;
  outputShape: ChatResultOutputShape;
  surfaceMode?: ChatResultSurfaceMode;
  replyArtifacts?: TReplyArtifacts | null;
  replyParse?: TReplyParse | null;
  contextPacket?: TContextPacket | null;
  newThreadId?: string;
  messageId?: string;
  threadTitle?: string;
  billing?: TBilling;
  memory?: TMemory | null;
}

export interface AssistantChatMessageLike<
  TQuickReply,
  TPlan,
  TDraftArtifact,
  TDraftVersion,
  TDraftBundle,
  TPreviousVersion,
  TReplyArtifacts,
  TReplyParse,
  TContextPacket,
> {
  id: string;
  threadId?: string;
  role: "assistant";
  content: string;
  createdAt: string;
  angles: unknown[];
  plan: TPlan | null;
  draft: string | null;
  drafts: string[];
  draftArtifacts: TDraftArtifact[];
  draftVersions?: TDraftVersion[];
  activeDraftVersionId?: string;
  draftBundle: TDraftBundle | null;
  previousVersionSnapshot: TPreviousVersion | null;
  revisionChainId?: string;
  supportAsset: string | null;
  autoSavedSourceMaterials?: {
    count: number;
    assets: Array<{
      id: string;
      title: string;
      deletable: boolean;
    }>;
  } | null;
  outputShape: ChatResultOutputShape;
  surfaceMode?: ChatResultSurfaceMode;
  replyArtifacts: TReplyArtifacts | null;
  replyParse: TReplyParse | null;
  contextPacket: TContextPacket | null;
  feedbackValue: null;
  quickReplies?: TQuickReply[];
}

interface BuildAssistantMessageFromChatResultArgs<
  TQuickReply,
  TPlan,
  TDraftArtifact,
  TDraftVersion extends DraftVersionEntryLike,
  TDraftBundle,
  TPreviousVersion,
  TReplyArtifacts,
  TReplyParse,
  TContextPacket,
  TMemory,
  TBilling,
> {
  result: ChatReplyResultLike<
    TQuickReply,
    TPlan,
    TDraftArtifact,
    TDraftVersion,
    TDraftBundle,
    TPreviousVersion,
    TReplyArtifacts,
    TReplyParse,
    TContextPacket,
    TMemory,
    TBilling
  >;
  activeThreadId: string | null;
  existingMessageCount: number;
  trimmedPrompt: string;
  artifactKind?: string | null;
  defaultQuickReplies?: TQuickReply[];
  now?: Date;
}

export function buildAssistantMessageFromChatResult<
  TQuickReply,
  TPlan,
  TDraftArtifact,
  TDraftVersion extends DraftVersionEntryLike,
  TDraftBundle,
  TPreviousVersion,
  TReplyArtifacts,
  TReplyParse,
  TContextPacket,
  TMemory,
  TBilling,
>(
  args: BuildAssistantMessageFromChatResultArgs<
    TQuickReply,
    TPlan,
    TDraftArtifact,
    TDraftVersion,
    TDraftBundle,
    TPreviousVersion,
    TReplyArtifacts,
    TReplyParse,
    TContextPacket,
    TMemory,
    TBilling
  >,
): AssistantChatMessageLike<
  TQuickReply,
  TPlan,
  TDraftArtifact,
  TDraftVersion,
  TDraftBundle,
  TPreviousVersion,
  TReplyArtifacts,
  TReplyParse,
  TContextPacket
> {
  const createdAt = (args.now ?? new Date()).toISOString();
  const quickReplies =
    args.result.quickReplies && args.result.quickReplies.length > 0
      ? args.result.quickReplies
      : args.existingMessageCount === 0 &&
          !args.trimmedPrompt &&
          args.artifactKind !== "selected_angle"
        ? args.defaultQuickReplies
        : undefined;

  return {
    id: args.result.messageId ?? `assistant-${(args.now ?? new Date()).getTime() + 1}`,
    threadId: args.result.newThreadId ?? args.activeThreadId ?? undefined,
    role: "assistant",
    content: args.result.reply,
    createdAt,
    angles: args.result.angles,
    plan: args.result.plan ?? null,
    draft: args.result.draft || null,
    drafts: args.result.drafts,
    draftArtifacts: args.result.draftArtifacts,
    draftVersions: args.result.draftVersions,
    activeDraftVersionId: args.result.activeDraftVersionId,
    draftBundle: args.result.draftBundle ?? null,
    previousVersionSnapshot: args.result.previousVersionSnapshot ?? null,
    revisionChainId: args.result.revisionChainId,
    supportAsset: args.result.supportAsset,
    autoSavedSourceMaterials: args.result.autoSavedSourceMaterials ?? null,
    outputShape: args.result.outputShape,
    surfaceMode: args.result.surfaceMode,
    replyArtifacts: args.result.replyArtifacts ?? null,
    replyParse: args.result.replyParse ?? null,
    contextPacket: args.result.contextPacket ?? null,
    feedbackValue: null,
    quickReplies,
  };
}

export function resolveNextDraftEditorSelection<
  TDraftVersion extends DraftVersionEntryLike,
>(args: {
  result: {
    messageId?: string;
    activeDraftVersionId?: string;
    draft?: string | null;
    draftVersions?: TDraftVersion[];
    revisionChainId?: string;
  };
  selectedDraftContext: DraftVersionSnapshotLike | null;
  mode: "json" | "stream";
}): DraftDrawerSelectionLike | null {
  if (!args.selectedDraftContext || !args.result.messageId) {
    return null;
  }

  if (args.mode === "stream") {
    if (!args.result.activeDraftVersionId || !args.result.draft) {
      return null;
    }

    return {
      messageId: args.result.messageId,
      versionId: args.result.activeDraftVersionId,
      revisionChainId: args.result.revisionChainId,
    };
  }

  const nextDraftVersionId =
    args.result.activeDraftVersionId ??
    (args.result.draftVersions && args.result.draftVersions.length > 0
      ? args.result.draftVersions[args.result.draftVersions.length - 1]?.id
      : null);

  if (!nextDraftVersionId) {
    return null;
  }

  return {
    messageId: args.result.messageId,
    versionId: nextDraftVersionId,
    revisionChainId: args.result.revisionChainId,
  };
}

interface ChatStreamStatusEvent {
  type: "status";
  message: string;
}

interface ChatStreamResultEvent<TResult> {
  type: "result";
  data: TResult;
}

interface ChatStreamErrorEvent {
  type: "error";
  message: string;
}

type ChatStreamEvent<TResult> =
  | ChatStreamStatusEvent
  | ChatStreamResultEvent<TResult>
  | ChatStreamErrorEvent;

export async function readChatResponseStream<TResult>(args: {
  body: ReadableStream<Uint8Array>;
  onStatus?: (message: string) => void;
}): Promise<TResult> {
  const reader = args.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let streamedResult: TResult | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      const event = JSON.parse(line) as ChatStreamEvent<TResult>;
      if (event.type === "status") {
        args.onStatus?.(event.message);
        continue;
      }
      if (event.type === "result") {
        streamedResult = event.data;
        continue;
      }
      throw new Error(event.message);
    }
  }

  if (buffer.trim()) {
    const event = JSON.parse(buffer.trim()) as ChatStreamEvent<TResult>;
    if (event.type === "status") {
      args.onStatus?.(event.message);
    } else if (event.type === "result") {
      streamedResult = event.data;
    } else {
      throw new Error(event.message);
    }
  }

  if (!streamedResult) {
    throw new Error("The chat stream finished without a result.");
  }

  return streamedResult;
}
