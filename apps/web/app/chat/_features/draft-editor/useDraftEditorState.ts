"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import { getXCharacterLimitForAccount, type DraftArtifactDetails } from "../../../../lib/onboarding/draftArtifacts";
import {
  addThreadDraftPost as addThreadDraftPostState,
  buildDraftEditorSerializedContent,
  buildEditableThreadPosts,
  buildDraftEditorHydrationState,
  moveThreadDraftPost as moveThreadDraftPostState,
  removeThreadDraftPost as removeThreadDraftPostState,
  splitThreadDraftPost as splitThreadDraftPostState,
  mergeThreadDraftPostDown as mergeThreadDraftPostDownState,
  ensureEditableThreadPosts,
} from "./chatDraftEditorState";
import {
  type DraftBundleLike,
  type DraftBundleOptionLike,
  type DraftPersistenceMessageLike,
  prepareDraftPromotionRequest,
  resolveDraftVersionRevertUpdate,
} from "./chatDraftPersistenceState";
import {
  resolveOpenDraftEditorState,
  type DraftDrawerSelectionLike,
  type DraftVersionBundleLike,
  type DraftVersionEntryLike,
  type DraftVersionSnapshotLike,
} from "./chatDraftSessionState";
import type { SourceMaterialAsset } from "../source-materials/sourceMaterialsState";

type DraftArtifact = DraftArtifactDetails;

interface ValidationError {
  message: string;
}

interface DraftPromotionSuccess {
  ok: true;
  data: {
    userMessage: {
      id: string;
      role: "user";
      content: string;
      createdAt: string;
    };
    assistantMessage: {
      id: string;
      role: "assistant";
      content: string;
      createdAt: string;
      draft: string;
      drafts: string[];
      draftArtifacts: DraftArtifact[];
      draftVersions: DraftVersionEntryLike[];
      activeDraftVersionId: string;
      previousVersionSnapshot: DraftVersionSnapshotLike | null;
      revisionChainId?: string;
      supportAsset: string | null;
      outputShape: string;
      replyArtifacts?: unknown | null;
    };
    promotedSourceMaterials?: {
      count: number;
      assets: SourceMaterialAsset[];
    };
  };
}

interface DraftPromotionFailure {
  ok: false;
  errors: ValidationError[];
}

type DraftPromotionResponse = DraftPromotionSuccess | DraftPromotionFailure;

interface DraftEditorMessageLike extends DraftPersistenceMessageLike {
  threadId?: string;
  content: string;
  role: "assistant" | "user";
  feedbackValue?: "up" | "down" | null;
  draftBundle?: DraftBundleLike<DraftBundleOptionLike> | null;
  promotedSourceMaterials?: {
    count: number;
    assets: SourceMaterialAsset[];
  } | null;
  replyArtifacts?: unknown | null;
}

interface CreateDraftPromotionUserMessageArgs {
  id: string;
  threadId?: string;
  content: string;
  createdAt: string;
}

interface CreateDraftPromotionAssistantMessageArgs {
  id: string;
  threadId?: string;
  content: string;
  createdAt: string;
  draft: string;
  drafts: string[];
  draftArtifacts: DraftArtifact[];
  draftVersions: DraftVersionEntryLike[];
  activeDraftVersionId: string;
  previousVersionSnapshot: DraftVersionSnapshotLike | null;
  revisionChainId?: string;
  supportAsset: string | null;
  promotedSourceMaterials?: {
    count: number;
    assets: SourceMaterialAsset[];
  } | null;
  outputShape: string;
  replyArtifacts?: unknown | null;
}

interface UseDraftEditorStateOptions<TMessage extends DraftEditorMessageLike> {
  activeDraftEditor: DraftDrawerSelectionLike | null;
  composerCharacterLimit: number;
  messages: TMessage[];
  selectedDraftVersionId: string | null;
  selectedDraftVersionContent: string;
  selectedDraftVersion: DraftVersionEntryLike | null;
  selectedDraftMessage: TMessage | null;
  selectedDraftArtifact: DraftArtifact | null | undefined;
  selectedDraftBundle: DraftVersionBundleLike | null;
  isSelectedDraftThread: boolean;
  isVerifiedAccount: boolean;
  activeThreadId: string | null;
  fetchWorkspace: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  mergeSourceMaterials: (assets: SourceMaterialAsset[]) => void;
  scrollThreadToBottom: () => void;
  setMessages: Dispatch<SetStateAction<TMessage[]>>;
  setActiveDraftEditor: (value: DraftDrawerSelectionLike | null) => void;
  setExpandedInlineThreadPreviewId: Dispatch<SetStateAction<string | null>>;
  setSelectedThreadPostByMessageId: Dispatch<SetStateAction<Record<string, number>>>;
  onErrorMessage: (message: string | null) => void;
  createPromotionUserMessage: (args: CreateDraftPromotionUserMessageArgs) => TMessage;
  createPromotionAssistantMessage: (
    args: CreateDraftPromotionAssistantMessageArgs,
  ) => TMessage;
}

export function useDraftEditorState<TMessage extends DraftEditorMessageLike>(
  options: UseDraftEditorStateOptions<TMessage>,
) {
  const {
    activeDraftEditor,
    composerCharacterLimit,
    messages,
    selectedDraftVersionId,
    selectedDraftVersionContent,
    selectedDraftVersion,
    selectedDraftMessage,
    selectedDraftArtifact,
    selectedDraftBundle,
    isSelectedDraftThread,
    isVerifiedAccount,
    activeThreadId,
    fetchWorkspace,
    mergeSourceMaterials,
    scrollThreadToBottom,
    setMessages,
    setActiveDraftEditor,
    setExpandedInlineThreadPreviewId,
    setSelectedThreadPostByMessageId,
    onErrorMessage,
    createPromotionUserMessage,
    createPromotionAssistantMessage,
  } = options;

  const [editorDraftText, setEditorDraftText] = useState("");
  const [editorDraftPosts, setEditorDraftPosts] = useState<string[]>([]);
  const [hasCopiedDraftEditorText, setHasCopiedDraftEditorText] = useState(false);
  const [copiedPreviewDraftMessageId, setCopiedPreviewDraftMessageId] = useState<string | null>(null);

  const selectedDraftThreadPostCount = useMemo(() => {
    if (!isSelectedDraftThread) {
      return 0;
    }

    return ensureEditableThreadPosts(
      editorDraftPosts.length > 0
        ? editorDraftPosts
        : buildEditableThreadPosts(selectedDraftArtifact, selectedDraftVersion?.content ?? ""),
    ).length;
  }, [
    editorDraftPosts,
    isSelectedDraftThread,
    selectedDraftArtifact,
    selectedDraftVersion?.content,
  ]);

  const draftEditorSerializedContent = useMemo(
    () =>
      buildDraftEditorSerializedContent({
        isThreadDraft: isSelectedDraftThread,
        editorDraftPosts,
        editorDraftText,
      }),
    [editorDraftPosts, editorDraftText, isSelectedDraftThread],
  );

  useEffect(() => {
    const hydratedDraftEditorState = buildDraftEditorHydrationState({
      selectedDraftVersionId,
      isThreadDraft: isSelectedDraftThread,
      artifact: selectedDraftArtifact,
      content: selectedDraftVersionContent,
    });

    setEditorDraftText(hydratedDraftEditorState.editorDraftText);
    setEditorDraftPosts(hydratedDraftEditorState.editorDraftPosts);
    setHasCopiedDraftEditorText(false);
  }, [
    activeDraftEditor?.messageId,
    activeDraftEditor?.versionId,
    isSelectedDraftThread,
    selectedDraftArtifact,
    selectedDraftVersionContent,
    selectedDraftVersionId,
  ]);

  useEffect(() => {
    const activeMessageId = activeDraftEditor?.messageId;
    if (!activeMessageId || !isSelectedDraftThread || selectedDraftThreadPostCount <= 0) {
      return;
    }

    setSelectedThreadPostByMessageId((current) => {
      const rawIndex = current[activeMessageId] ?? 0;
      const clampedIndex = Math.max(0, Math.min(selectedDraftThreadPostCount - 1, rawIndex));
      if (rawIndex === clampedIndex) {
        return current;
      }

      return {
        ...current,
        [activeMessageId]: clampedIndex,
      };
    });
  }, [
    activeDraftEditor?.messageId,
    isSelectedDraftThread,
    selectedDraftThreadPostCount,
    setSelectedThreadPostByMessageId,
  ]);

  const selectDraftBundleOption = useCallback(
    (messageId: string, optionId: string, versionId: string) => {
      setMessages((current) =>
        current.map((message) =>
          message.id !== messageId
            ? message
            : ({
                ...message,
                activeDraftVersionId: versionId,
                draftBundle: message.draftBundle
                  ? {
                      ...message.draftBundle,
                      selectedOptionId: optionId,
                    }
                  : message.draftBundle,
              } as TMessage),
        ),
      );
    },
    [setMessages],
  );

  const openDraftEditor = useCallback(
    (messageId: string, versionId?: string, threadPostIndex?: number) => {
      const openState = resolveOpenDraftEditorState({
        message: messages.find((item) => item.id === messageId) ?? null,
        fallbackCharacterLimit: composerCharacterLimit,
        versionId,
        threadPostIndex,
      });
      if (!openState) {
        return;
      }

      if (openState.shouldExpandInlineThreadPreview) {
        setExpandedInlineThreadPreviewId(messageId);
        setSelectedThreadPostByMessageId((current) => ({
          ...current,
          [messageId]: openState.selectedThreadPostIndex,
        }));
      }

      setActiveDraftEditor(openState.selection);
    },
    [
      composerCharacterLimit,
      messages,
      setActiveDraftEditor,
      setExpandedInlineThreadPreviewId,
      setSelectedThreadPostByMessageId,
    ],
  );

  const updateThreadDraftPost = useCallback((index: number, content: string) => {
    setEditorDraftPosts((current) =>
      current.map((post, postIndex) => (postIndex === index ? content : post)),
    );
  }, []);

  const moveThreadDraftPost = useCallback(
    (index: number, direction: "up" | "down") => {
      const messageId = activeDraftEditor?.messageId;
      let nextSelectedIndex: number | null = null;
      setEditorDraftPosts((current) => {
        const nextState = moveThreadDraftPostState({
          posts: current,
          index,
          direction,
        });
        if (!nextState) {
          return current;
        }

        nextSelectedIndex = nextState.selectedIndex;
        return nextState.posts;
      });
      if (messageId && nextSelectedIndex !== null) {
        setSelectedThreadPostByMessageId((current) => ({
          ...current,
          [messageId]: nextSelectedIndex!,
        }));
      }
    },
    [activeDraftEditor?.messageId, setSelectedThreadPostByMessageId],
  );

  const splitThreadDraftPost = useCallback(
    (index: number) => {
      const messageId = activeDraftEditor?.messageId;
      let nextSelectedIndex: number | null = null;
      setEditorDraftPosts((current) => {
        const nextState = splitThreadDraftPostState({
          posts: current,
          index,
        });
        if (!nextState) {
          return current;
        }

        nextSelectedIndex = nextState.selectedIndex;
        return nextState.posts;
      });
      if (messageId && nextSelectedIndex !== null) {
        setSelectedThreadPostByMessageId((current) => ({
          ...current,
          [messageId]: nextSelectedIndex!,
        }));
      }
    },
    [activeDraftEditor?.messageId, setSelectedThreadPostByMessageId],
  );

  const mergeThreadDraftPostDown = useCallback(
    (index: number) => {
      const messageId = activeDraftEditor?.messageId;
      let nextSelectedIndex: number | null = null;
      setEditorDraftPosts((current) => {
        const nextState = mergeThreadDraftPostDownState({
          posts: current,
          index,
        });
        if (!nextState) {
          return current;
        }

        nextSelectedIndex = nextState.selectedIndex;
        return nextState.posts;
      });
      if (messageId && nextSelectedIndex !== null) {
        setSelectedThreadPostByMessageId((current) => ({
          ...current,
          [messageId]: nextSelectedIndex!,
        }));
      }
    },
    [activeDraftEditor?.messageId, setSelectedThreadPostByMessageId],
  );

  const addThreadDraftPost = useCallback(
    (index?: number) => {
      const messageId = activeDraftEditor?.messageId;
      let nextSelectedIndex = 0;
      setEditorDraftPosts((current) => {
        const nextState = addThreadDraftPostState({
          posts: current,
          index,
        });
        nextSelectedIndex = nextState.selectedIndex;
        return nextState.posts;
      });
      if (messageId) {
        setSelectedThreadPostByMessageId((current) => ({
          ...current,
          [messageId]: nextSelectedIndex,
        }));
      }
    },
    [activeDraftEditor?.messageId, setSelectedThreadPostByMessageId],
  );

  const removeThreadDraftPost = useCallback(
    (index: number) => {
      const messageId = activeDraftEditor?.messageId;
      let nextSelectedIndex = 0;
      setEditorDraftPosts((current) => {
        const nextState = removeThreadDraftPostState({
          posts: current,
          index,
        });
        nextSelectedIndex = nextState.selectedIndex;
        return nextState.posts;
      });
      if (messageId) {
        setSelectedThreadPostByMessageId((current) => ({
          ...current,
          [messageId]: nextSelectedIndex,
        }));
      }
    },
    [activeDraftEditor?.messageId, setSelectedThreadPostByMessageId],
  );

  const saveDraftEditor = useCallback(async () => {
    if (
      !activeDraftEditor ||
      !selectedDraftMessage ||
      !selectedDraftVersion ||
      !activeThreadId
    ) {
      return;
    }

    const draftPromotion = prepareDraftPromotionRequest({
      activeDraftEditorRevisionChainId: activeDraftEditor.revisionChainId,
      selectedDraftMessage,
      selectedDraftVersion,
      selectedDraftArtifact,
      isSelectedDraftThread,
      editorDraftPosts,
      editorDraftText,
    });
    if (draftPromotion.status !== "ready") {
      return;
    }

    try {
      const response = await fetchWorkspace(
        `/api/creator/v2/threads/${encodeURIComponent(activeThreadId)}/draft-promotions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(draftPromotion.requestBody),
        },
      );
      if (!response.ok) {
        throw new Error("promotion failed");
      }

      const data = (await response.json()) as DraftPromotionResponse;
      if (!data.ok) {
        throw new Error(data.errors[0]?.message || "promotion failed");
      }

      setMessages((current) => [
        ...current,
        createPromotionUserMessage({
          id: data.data.userMessage.id,
          threadId: activeThreadId ?? undefined,
          content: data.data.userMessage.content,
          createdAt: data.data.userMessage.createdAt,
        }),
        createPromotionAssistantMessage({
          id: data.data.assistantMessage.id,
          threadId: activeThreadId ?? undefined,
          content: data.data.assistantMessage.content,
          createdAt: data.data.assistantMessage.createdAt,
          draft: data.data.assistantMessage.draft,
          drafts: data.data.assistantMessage.drafts,
          draftArtifacts: data.data.assistantMessage.draftArtifacts,
          draftVersions: data.data.assistantMessage.draftVersions,
          activeDraftVersionId: data.data.assistantMessage.activeDraftVersionId,
          previousVersionSnapshot: data.data.assistantMessage.previousVersionSnapshot,
          revisionChainId: data.data.assistantMessage.revisionChainId,
          supportAsset: data.data.assistantMessage.supportAsset,
          promotedSourceMaterials: data.data.promotedSourceMaterials ?? null,
          outputShape: data.data.assistantMessage.outputShape,
          replyArtifacts: data.data.assistantMessage.replyArtifacts ?? null,
        }),
      ]);
      if (data.data.promotedSourceMaterials?.assets?.length) {
        mergeSourceMaterials(data.data.promotedSourceMaterials.assets);
      }
      setActiveDraftEditor({
        messageId: data.data.assistantMessage.id,
        versionId: data.data.assistantMessage.activeDraftVersionId,
        revisionChainId: data.data.assistantMessage.revisionChainId,
      });
      scrollThreadToBottom();
    } catch {
      onErrorMessage("The draft could not be promoted yet.");
    }
  }, [
    activeDraftEditor,
    activeThreadId,
    createPromotionAssistantMessage,
    createPromotionUserMessage,
    editorDraftPosts,
    editorDraftText,
    fetchWorkspace,
    isSelectedDraftThread,
    mergeSourceMaterials,
    onErrorMessage,
    scrollThreadToBottom,
    selectedDraftArtifact,
    selectedDraftMessage,
    selectedDraftVersion,
    setActiveDraftEditor,
    setMessages,
  ]);

  const revertToSelectedDraftVersion = useCallback(async () => {
    if (!selectedDraftVersion || !selectedDraftMessage) {
      return;
    }

    const revertUpdate = resolveDraftVersionRevertUpdate({
      activeDraftEditorRevisionChainId: activeDraftEditor?.revisionChainId,
      selectedDraftMessage,
      selectedDraftVersion,
      selectedDraftBundleVersions: selectedDraftBundle?.versions,
      isSelectedDraftThread,
      fallbackCharacterLimit: getXCharacterLimitForAccount(isVerifiedAccount),
    });
    if (!revertUpdate) {
      return;
    }

    setMessages((current) =>
      current.map((message) =>
        message.id !== selectedDraftMessage.id
          ? message
          : ({
              ...message,
              draft: revertUpdate.nextDraftCollections.draft,
              drafts: revertUpdate.nextDraftCollections.drafts,
              draftArtifacts: revertUpdate.nextDraftCollections.draftArtifacts,
              draftVersions: revertUpdate.nextDraftVersions,
              activeDraftVersionId: selectedDraftVersion.id,
              draftBundle: revertUpdate.nextDraftBundle,
              revisionChainId: revertUpdate.revisionChainId,
            } as TMessage),
      ),
    );

    setActiveDraftEditor({
      messageId: selectedDraftMessage.id,
      versionId: selectedDraftVersion.id,
      revisionChainId: revertUpdate.revisionChainId,
    });

    if (!activeThreadId) {
      return;
    }

    try {
      const response = await fetchWorkspace(
        `/api/creator/v2/threads/${encodeURIComponent(activeThreadId)}/messages/${encodeURIComponent(selectedDraftMessage.id)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            draftVersions: revertUpdate.nextDraftVersions,
            activeDraftVersionId: selectedDraftVersion.id,
            draft: revertUpdate.nextDraftCollections.draft,
            drafts: revertUpdate.nextDraftCollections.drafts,
            draftArtifacts: revertUpdate.nextDraftCollections.draftArtifacts,
            draftBundle: revertUpdate.nextDraftBundle,
            revisionChainId: revertUpdate.revisionChainId,
          }),
        },
      );
      if (!response.ok) {
        throw new Error("persist failed");
      }
    } catch {
      onErrorMessage("The current version could not be updated yet.");
    }
  }, [
    activeDraftEditor?.revisionChainId,
    activeThreadId,
    fetchWorkspace,
    isSelectedDraftThread,
    isVerifiedAccount,
    onErrorMessage,
    selectedDraftBundle,
    selectedDraftMessage,
    selectedDraftVersion,
    setActiveDraftEditor,
    setMessages,
  ]);

  const copyDraftEditor = useCallback(async (serializedContent: string) => {
    if (!serializedContent.trim()) {
      return;
    }

    try {
      await navigator.clipboard.writeText(serializedContent);
      setHasCopiedDraftEditorText(true);
      window.setTimeout(() => {
        setHasCopiedDraftEditorText(false);
      }, 2200);
    } catch {
      onErrorMessage("Copy failed. Try selecting the text manually.");
    }
  }, [onErrorMessage]);

  const shareDraftEditorToX = useCallback(() => {
    window.open("https://x.com/compose/post", "_blank", "noopener,noreferrer");
  }, []);

  const copyPreviewDraft = useCallback(async (messageId: string, content: string) => {
    const nextContent = content.trim();
    if (!nextContent) {
      return;
    }

    try {
      await navigator.clipboard.writeText(nextContent);
      setCopiedPreviewDraftMessageId(messageId);
      window.setTimeout(() => {
        setCopiedPreviewDraftMessageId((current) =>
          current === messageId ? null : current,
        );
      }, 2200);
    } catch {
      onErrorMessage("Copy failed. Try selecting the text manually.");
    }
  }, [onErrorMessage]);

  return {
    editorDraftText,
    setEditorDraftText,
    editorDraftPosts,
    setEditorDraftPosts,
    selectedDraftThreadPostCount,
    draftEditorSerializedContent,
    hasCopiedDraftEditorText,
    copiedPreviewDraftMessageId,
    selectDraftBundleOption,
    openDraftEditor,
    updateThreadDraftPost,
    moveThreadDraftPost,
    splitThreadDraftPost,
    mergeThreadDraftPostDown,
    addThreadDraftPost,
    removeThreadDraftPost,
    saveDraftEditor,
    revertToSelectedDraftVersion,
    copyDraftEditor,
    shareDraftEditorToX,
    copyPreviewDraft,
  };
}
