"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { resolveCreatedThreadWorkspaceUpdate } from "../workspace/chatWorkspaceState";

export interface ChatThreadListItem {
  id: string;
  title: string;
  updatedAt: string;
}

interface ThreadDeleteTarget {
  id: string;
  title: string;
}

interface UseChatThreadStateOptions {
  accountName: string | null;
  initialThreadId: string | null;
  editingTitle: string;
  threadToDelete: ThreadDeleteTarget | null;
  setEditingThreadId: (value: string | null) => void;
  clearThreadToDelete: () => void;
  fetchWorkspace: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  buildWorkspaceChatHref: (threadId?: string | null) => string;
  onErrorMessage: (message: string | null) => void;
}

export function useChatThreadState(options: UseChatThreadStateOptions) {
  const {
    accountName,
    initialThreadId,
    editingTitle,
    threadToDelete,
    setEditingThreadId,
    clearThreadToDelete,
    fetchWorkspace,
    buildWorkspaceChatHref,
    onErrorMessage,
  } = options;

  const [activeThreadId, setActiveThreadId] = useState<string | null>(initialThreadId);
  const [chatThreads, setChatThreads] = useState<ChatThreadListItem[]>([]);
  const [threadStateResetVersion, setThreadStateResetVersion] = useState(0);
  const chatThreadsRef = useRef(chatThreads);
  const threadCreatedInSessionRef = useRef(false);

  useEffect(() => {
    chatThreadsRef.current = chatThreads;
  }, [chatThreads]);

  useEffect(() => {
    if (!accountName) {
      return;
    }

    let isActive = true;

    async function loadThreads() {
      try {
        const response = await fetchWorkspace("/api/creator/v2/threads");
        const data = (await response.json().catch(() => null)) as
          | {
              ok?: boolean;
              data?: {
                threads?: ChatThreadListItem[];
              };
            }
          | null;

        if (!isActive || !data?.ok || !data.data?.threads) {
          return;
        }

        setChatThreads(data.data.threads);
      } catch (error) {
        if (isActive) {
          console.error("Failed to fetch threads:", error);
        }
      }
    }

    void loadThreads();

    return () => {
      isActive = false;
    };
  }, [accountName, fetchWorkspace]);

  const handleRenameSubmit = useCallback(
    async (threadId: string) => {
      if (!editingTitle.trim()) {
        setEditingThreadId(null);
        return;
      }

      const cleanTitle = editingTitle.trim();
      setChatThreads((current) =>
        current.map((thread) =>
          thread.id === threadId ? { ...thread, title: cleanTitle } : thread,
        ),
      );
      setEditingThreadId(null);

      try {
        await fetchWorkspace(`/api/creator/v2/threads/${threadId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: cleanTitle }),
        });
      } catch (error) {
        console.error("Failed to rename thread", error);
      }
    },
    [editingTitle, fetchWorkspace, setEditingThreadId],
  );

  const confirmDeleteThread = useCallback(async () => {
    if (!threadToDelete) {
      return;
    }

    const deletingThread = threadToDelete;

    try {
      const response = await fetchWorkspace(`/api/creator/v2/threads/${deletingThread.id}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok || data?.data?.deleted !== true) {
        throw new Error("Failed to delete thread");
      }

      setChatThreads((current) => current.filter((thread) => thread.id !== deletingThread.id));

      if (activeThreadId === deletingThread.id) {
        setActiveThreadId(null);
        threadCreatedInSessionRef.current = false;
        window.history.replaceState({}, "", buildWorkspaceChatHref(null));
        setThreadStateResetVersion((current) => current + 1);
      }
    } catch (error) {
      console.error("Failed to delete thread", error);
      onErrorMessage("Failed to delete the chat. Try again.");
    } finally {
      clearThreadToDelete();
    }
  }, [
    activeThreadId,
    buildWorkspaceChatHref,
    clearThreadToDelete,
    fetchWorkspace,
    onErrorMessage,
    threadToDelete,
  ]);

  const syncThreadTitle = useCallback((threadId: string, title: string) => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      return;
    }

    setChatThreads((current) =>
      current.map((thread) =>
        thread.id === threadId
          ? {
              ...thread,
              title: cleanTitle,
              updatedAt: new Date().toISOString(),
            }
          : thread,
      ),
    );
  }, []);

  const applyCreatedThreadWorkspaceUpdate = useCallback(
    (newThreadId?: string | null, threadTitle?: string | null) => {
      const createdThreadUpdate = resolveCreatedThreadWorkspaceUpdate({
        currentThreads: chatThreadsRef.current,
        newThreadId,
        threadTitle,
        activeThreadId,
        accountName,
      });
      if (!createdThreadUpdate) {
        return;
      }

      setActiveThreadId(createdThreadUpdate.nextActiveThreadId);
      threadCreatedInSessionRef.current = createdThreadUpdate.threadCreatedInSession;
      window.history.replaceState(
        {},
        "",
        buildWorkspaceChatHref(createdThreadUpdate.nextHistoryThreadId),
      );
      setChatThreads(createdThreadUpdate.nextChatThreads);
    },
    [accountName, activeThreadId, buildWorkspaceChatHref],
  );

  return {
    activeThreadId,
    setActiveThreadId,
    chatThreads,
    threadCreatedInSessionRef,
    threadStateResetVersion,
    handleRenameSubmit,
    confirmDeleteThread,
    syncThreadTitle,
    applyCreatedThreadWorkspaceUpdate,
  };
}
