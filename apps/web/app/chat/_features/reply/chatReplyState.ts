import type { SelectedAngleFormatHint } from "../../../../lib/agent-v2/contracts/turnContract.ts";
import type { ChatStreamEvent, ChatStreamProgressEventData } from "../../../../lib/chat/chatStream.ts";
import { sanitizeChatStreamProgressEventData } from "../../../../lib/chat/chatStream.ts";
import type { ChatMediaAttachmentRef, ImageTurnContext } from "../../../../lib/chat/chatMedia.ts";

export type ChatResultOutputShape =
  | "coach_question"
  | "ideation_angles"
  | "planning_outline"
  | "profile_analysis"
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
} from "../workspace/chatWorkspaceState.ts";
import { resolveCreatedThreadPlan, type CreatedThreadPlan } from "../workspace/chatWorkspaceState.ts";

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
  ideationFormatHint?: SelectedAngleFormatHint | null;
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
  mediaAttachments?: ChatMediaAttachmentRef[];
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
  profileAnalysisArtifact?: unknown | null;
  imageTurnContext?: ImageTurnContext | null;
  newThreadId?: string;
  turnId?: string;
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
  ideationFormatHint?: SelectedAngleFormatHint | null;
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
  mediaAttachments?: ChatMediaAttachmentRef[];
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
  profileAnalysisArtifact?: unknown | null;
  imageTurnContext?: ImageTurnContext | null;
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

interface ResolveAssistantReplySuccessStateArgs<
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
> extends BuildAssistantMessageFromChatResultArgs<
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
  > {
  selectedDraftContext: DraftVersionSnapshotLike | null;
  mode: "json" | "stream";
  accountName: string | null;
}

export interface AssistantReplySuccessState<
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
  TBilling,
> {
  assistantMessage: AssistantChatMessageLike<
    TQuickReply,
    TPlan,
    TDraftArtifact,
    TDraftVersion,
    TDraftBundle,
    TPreviousVersion,
    TReplyArtifacts,
    TReplyParse,
    TContextPacket
  >;
  nextDraftEditor: DraftDrawerSelectionLike | null;
  nextConversationMemory: TMemory | null;
  nextBilling: TBilling | null;
  createdThreadPlan: CreatedThreadPlan | null;
  nextThreadTitle:
    | {
        threadId: string;
        title: string;
      }
    | null;
}

type ResolveAssistantReplyPlanArgs<
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
> = Omit<
    ResolveAssistantReplySuccessStateArgs<
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
    "existingMessageCount"
  >;

export interface AssistantReplyPlan<
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
  TBilling,
> {
  buildAssistantMessage: (
    existingMessageCount: number,
  ) => AssistantChatMessageLike<
    TQuickReply,
    TPlan,
    TDraftArtifact,
    TDraftVersion,
    TDraftBundle,
    TPreviousVersion,
    TReplyArtifacts,
    TReplyParse,
    TContextPacket
  >;
  nextDraftEditor: DraftDrawerSelectionLike | null;
  nextConversationMemory: TMemory | null;
  nextBilling: TBilling | null;
  createdThreadPlan: CreatedThreadPlan | null;
  nextThreadTitle:
    | {
        threadId: string;
        title: string;
      }
    | null;
}

interface ValidationErrorLike {
  message: string;
}

interface AssistantReplyFailureLike<TBillingSnapshot> {
  ok: false;
  errors: ValidationErrorLike[];
  data?: {
    billing?: TBillingSnapshot;
  } | null;
}

interface AssistantReplySuccessEnvelope<
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
  ok: true;
  data: ChatReplyResultLike<
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
}

export type AssistantReplyJsonOutcome<
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
  TFailureBillingSnapshot,
> =
  | {
      kind: "success";
      replyPlan: AssistantReplyPlan<
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
    }
  | {
      kind: "failure";
      errorMessage: string;
      nextBillingSnapshot: TFailureBillingSnapshot | null;
      shouldOpenPricingModal: boolean;
    };

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
    ...(args.result.ideationFormatHint
      ? { ideationFormatHint: args.result.ideationFormatHint }
      : {}),
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
    mediaAttachments: args.result.mediaAttachments,
    autoSavedSourceMaterials: args.result.autoSavedSourceMaterials ?? null,
    outputShape: args.result.outputShape,
    surfaceMode: args.result.surfaceMode,
    replyArtifacts: args.result.replyArtifacts ?? null,
    replyParse: args.result.replyParse ?? null,
    contextPacket: args.result.contextPacket ?? null,
    profileAnalysisArtifact: args.result.profileAnalysisArtifact ?? null,
    imageTurnContext: args.result.imageTurnContext ?? null,
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

export function resolveAssistantReplySuccessState<
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
  args: ResolveAssistantReplySuccessStateArgs<
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
): AssistantReplySuccessState<
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
> {
  const replyPlan = resolveAssistantReplyPlan(args);

  return {
    assistantMessage: replyPlan.buildAssistantMessage(args.existingMessageCount),
    nextDraftEditor: replyPlan.nextDraftEditor,
    nextConversationMemory: replyPlan.nextConversationMemory,
    nextBilling: replyPlan.nextBilling,
    createdThreadPlan: replyPlan.createdThreadPlan,
    nextThreadTitle: replyPlan.nextThreadTitle,
  };
}

export function resolveAssistantReplyPlan<
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
  args: ResolveAssistantReplyPlanArgs<
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
): AssistantReplyPlan<
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
> {
  const nextDraftEditor = resolveNextDraftEditorSelection({
    result: args.result,
    selectedDraftContext: args.selectedDraftContext,
    mode: args.mode,
  });
  const createdThreadPlan = resolveCreatedThreadPlan({
    newThreadId: args.result.newThreadId,
    threadTitle: args.result.threadTitle,
    activeThreadId: args.activeThreadId,
    accountName: args.accountName,
    now: args.now,
  });
  const responseThreadId = args.result.newThreadId ?? args.activeThreadId;

  return {
    buildAssistantMessage: (existingMessageCount) =>
      buildAssistantMessageFromChatResult({
        ...args,
        existingMessageCount,
      }),
    nextDraftEditor,
    nextConversationMemory: args.result.memory ?? null,
    nextBilling: args.result.billing ?? null,
    createdThreadPlan,
    nextThreadTitle:
      responseThreadId && args.result.threadTitle
        ? {
            threadId: responseThreadId,
            title: args.result.threadTitle,
          }
        : null,
  };
}

export function resolveAssistantReplyJsonOutcome<
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
  TFailureBillingSnapshot,
>(
  args: {
    responseOk: boolean;
    responseStatus: number;
    response: {
      ok: boolean;
      errors?: ValidationErrorLike[];
      data?: unknown;
    };
    failureMessage: string;
    replyPlanArgs: Omit<
      ResolveAssistantReplyPlanArgs<
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
      "result"
    >;
  },
): AssistantReplyJsonOutcome<
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
  TBilling,
  TFailureBillingSnapshot
> {
  if (!args.responseOk || !args.response.ok) {
    const failure = args.response as AssistantReplyFailureLike<TFailureBillingSnapshot>;

    return {
      kind: "failure",
      errorMessage: failure.errors?.[0]?.message ?? args.failureMessage,
      nextBillingSnapshot: failure.data?.billing ?? null,
      shouldOpenPricingModal:
        args.responseStatus === 402 || args.responseStatus === 403,
    };
  }

  return {
    kind: "success",
    replyPlan: resolveAssistantReplyPlan({
      ...args.replyPlanArgs,
      result: (
        args.response as AssistantReplySuccessEnvelope<
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
        >
      ).data,
    }),
  };
}

export async function readChatResponseStream<TResult>(args: {
  body: ReadableStream<Uint8Array>;
  onStatus?: (message: string) => void;
  onProgress?: (data: ChatStreamProgressEventData) => void;
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
      if (event.type === "progress") {
        const sanitized = sanitizeChatStreamProgressEventData(event.data);
        if (sanitized) {
          args.onProgress?.(sanitized);
        }
        continue;
      }
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
    if (event.type === "progress") {
      const sanitized = sanitizeChatStreamProgressEventData(event.data);
      if (sanitized) {
        args.onProgress?.(sanitized);
      }
    } else if (event.type === "status") {
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
