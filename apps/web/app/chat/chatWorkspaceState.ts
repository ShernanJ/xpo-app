import { normalizeWorkspaceHandle } from "../../lib/workspaceHandle.ts";

export interface ChatThreadListItemLike {
  id: string;
  title: string;
  updatedAt: string;
  createdAt?: string;
  xHandle?: string | null;
}

export interface CreatedThreadPlan {
  threadId: string;
  title: string;
  xHandle: string | null;
  createdAt: string;
  updatedAt: string;
  replaceIds: string[];
}

export interface CreatedThreadWorkspaceUpdate<T extends ChatThreadListItemLike> {
  nextActiveThreadId: string;
  nextHistoryThreadId: string;
  nextChatThreads: T[];
  threadCreatedInSession: true;
}

export interface ChatThreadStateReset {
  activeThreadId: null;
  threadCreatedInSession: false;
  messages: [];
  draftInput: "";
  conversationMemory: null;
  activeDraftEditor: null;
  editorDraftText: "";
  editorDraftPosts: [];
  errorMessage: null;
  isLeavingHero: false;
  typedAssistantLengths: Record<string, number>;
  activeDraftRevealByMessageId: Record<string, string>;
  revealedDraftMessageIds: Record<string, boolean>;
}

export interface ChatWorkspaceStateReset<TToneInputs, TStrategyInputs> {
  context: null;
  contract: null;
  messages: [];
  draftInput: "";
  errorMessage: null;
  streamStatus: null;
  isWorkspaceInitializing: false;
  analysisOpen: false;
  backfillNotice: null;
  isAnalysisScrapeRefreshing: false;
  analysisScrapeNotice: null;
  analysisScrapeCooldownUntil: null;
  activeContentFocus: null;
  toneInputs: TToneInputs;
  activeToneInputs: null;
  activeStrategyInputs: TStrategyInputs;
  activeDraftEditor: null;
  editorDraftText: "";
  editorDraftPosts: [];
  draftQueueItems: [];
  draftQueueError: null;
  editingDraftCandidateId: null;
  editingDraftCandidateText: "";
  typedAssistantLengths: Record<string, number>;
  activeDraftRevealByMessageId: Record<string, string>;
  revealedDraftMessageIds: Record<string, boolean>;
  isLeavingHero: false;
}

export type ChatWorkspaceReset<TToneInputs, TStrategyInputs> =
  | ChatThreadStateReset
  | ChatWorkspaceStateReset<TToneInputs, TStrategyInputs>;

interface ChatWorkspaceResetDefaults<TToneInputs, TStrategyInputs> {
  defaultToneInputs: TToneInputs;
  defaultStrategyInputs: TStrategyInputs;
}

export function resolveWorkspaceHandle(args: {
  searchHandle?: string | null;
  sessionHandle?: string | null;
}): string | null {
  return (
    normalizeWorkspaceHandle(args.searchHandle) ??
    normalizeWorkspaceHandle(args.sessionHandle)
  );
}

export function buildChatWorkspaceReset(scope: "thread"): ChatThreadStateReset;
export function buildChatWorkspaceReset<TToneInputs, TStrategyInputs>(
  scope: "workspace",
  defaults: ChatWorkspaceResetDefaults<TToneInputs, TStrategyInputs>,
): ChatWorkspaceStateReset<TToneInputs, TStrategyInputs>;
export function buildChatWorkspaceReset<TToneInputs, TStrategyInputs>(
  scope: "thread" | "workspace",
  defaults?: ChatWorkspaceResetDefaults<TToneInputs, TStrategyInputs>,
): ChatWorkspaceReset<TToneInputs, TStrategyInputs> {
  if (scope === "thread") {
    return {
      activeThreadId: null,
      threadCreatedInSession: false,
      messages: [],
      draftInput: "",
      conversationMemory: null,
      activeDraftEditor: null,
      editorDraftText: "",
      editorDraftPosts: [],
      errorMessage: null,
      isLeavingHero: false,
      typedAssistantLengths: {},
      activeDraftRevealByMessageId: {},
      revealedDraftMessageIds: {},
    };
  }

  if (!defaults) {
    throw new Error("Workspace resets require default tone and strategy inputs.");
  }

  return {
    context: null,
    contract: null,
    messages: [],
    draftInput: "",
    errorMessage: null,
    streamStatus: null,
    isWorkspaceInitializing: false,
    analysisOpen: false,
    backfillNotice: null,
    isAnalysisScrapeRefreshing: false,
    analysisScrapeNotice: null,
    analysisScrapeCooldownUntil: null,
    activeContentFocus: null,
    toneInputs: defaults.defaultToneInputs,
    activeToneInputs: null,
    activeStrategyInputs: defaults.defaultStrategyInputs,
    activeDraftEditor: null,
    editorDraftText: "",
    editorDraftPosts: [],
    draftQueueItems: [],
    draftQueueError: null,
    editingDraftCandidateId: null,
    editingDraftCandidateText: "",
    typedAssistantLengths: {},
    activeDraftRevealByMessageId: {},
    revealedDraftMessageIds: {},
    isLeavingHero: false,
  };
}

export function resolveCreatedThreadPlan(args: {
  newThreadId?: string | null;
  threadTitle?: string | null;
  activeThreadId: string | null;
  accountName: string | null;
  now?: Date;
}): CreatedThreadPlan | null {
  if (!args.newThreadId) {
    return null;
  }

  const timestamp = (args.now ?? new Date()).toISOString();
  return {
    threadId: args.newThreadId,
    title: args.threadTitle?.trim() || "New Chat",
    xHandle: args.accountName || null,
    createdAt: timestamp,
    updatedAt: timestamp,
    replaceIds: ["current-workspace", ...(args.activeThreadId ? [args.activeThreadId] : [])],
  };
}

export function applyCreatedThreadPlanToList<T extends ChatThreadListItemLike>(
  current: T[],
  plan: CreatedThreadPlan,
): T[] {
  const exists = current.some((thread) => plan.replaceIds.includes(thread.id));
  if (exists) {
    return current.map((thread) =>
      plan.replaceIds.includes(thread.id)
        ? ({
            ...thread,
            id: plan.threadId,
          } as T)
        : thread,
    );
  }

  return [
    {
      id: plan.threadId,
      title: plan.title,
      xHandle: plan.xHandle,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    } as T,
    ...current,
  ];
}

export function resolveCreatedThreadWorkspaceUpdate<T extends ChatThreadListItemLike>(args: {
  currentThreads: T[];
  newThreadId?: string | null;
  threadTitle?: string | null;
  activeThreadId: string | null;
  accountName: string | null;
  now?: Date;
}): CreatedThreadWorkspaceUpdate<T> | null {
  const plan = resolveCreatedThreadPlan({
    newThreadId: args.newThreadId,
    threadTitle: args.threadTitle,
    activeThreadId: args.activeThreadId,
    accountName: args.accountName,
    now: args.now,
  });

  if (!plan) {
    return null;
  }

  return {
    nextActiveThreadId: plan.threadId,
    nextHistoryThreadId: plan.threadId,
    nextChatThreads: applyCreatedThreadPlanToList(args.currentThreads, plan),
    threadCreatedInSession: true,
  };
}
