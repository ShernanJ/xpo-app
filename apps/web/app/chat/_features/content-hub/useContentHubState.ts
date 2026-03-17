"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import type {
  ContentHubMutationResponse,
  ContentHubViewMode,
  ContentItemRecord,
  ContentItemsResponse,
  ContentStatus,
  FolderCreateResponse,
  FolderRecord,
  FoldersResponse,
} from "./contentHubTypes";
import { filterContentItems } from "./contentHubViewState";

interface ValidationError {
  message?: string;
}

interface FailureResponse {
  ok: false;
  errors?: ValidationError[];
}

interface UseContentHubStateOptions {
  open: boolean;
  fetchWorkspace: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

function readErrorMessage(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === "object" &&
    "errors" in payload &&
    Array.isArray((payload as { errors?: unknown[] }).errors)
  ) {
    const firstError = (payload as { errors?: Array<{ message?: string }> }).errors?.[0];
    if (firstError?.message) {
      return firstError.message;
    }
  }

  return fallback;
}

function findFolderById(folders: FolderRecord[], folderId: string | null) {
  if (!folderId) {
    return null;
  }

  return folders.find((folder) => folder.id === folderId) ?? null;
}

function applyOptimisticItemUpdate(
  item: ContentItemRecord,
  payload: {
    status?: ContentStatus;
    folderId?: string | null;
  },
  folders: FolderRecord[],
): ContentItemRecord {
  const nextStatus = payload.status ?? item.status;
  const nextFolderId = payload.folderId !== undefined ? payload.folderId : item.folderId;
  const nextFolder =
    payload.folderId !== undefined ? findFolderById(folders, nextFolderId ?? null) : item.folder;

  return {
    ...item,
    status: nextStatus,
    folderId: nextFolderId ?? null,
    folder: nextFolder,
    reviewStatus:
      payload.status === "PUBLISHED"
        ? item.reviewStatus === "posted" || item.reviewStatus === "observed"
          ? item.reviewStatus
          : "posted"
        : payload.status === "DRAFT"
          ? "pending"
          : item.reviewStatus,
    publishedTweetId: payload.status === "DRAFT" ? null : item.publishedTweetId,
    postedAt:
      payload.status === "DRAFT"
        ? null
        : payload.status === "PUBLISHED"
          ? item.postedAt ?? new Date().toISOString()
          : item.postedAt,
  };
}

export function useContentHubState(options: UseContentHubStateOptions) {
  const { open, fetchWorkspace } = options;
  const [items, setItems] = useState<ContentItemRecord[]>([]);
  const [folders, setFolders] = useState<FolderRecord[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ContentHubViewMode>("date");
  const [searchQuery, setSearchQuery] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [actionById, setActionById] = useState<Record<string, string>>({});
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderColor, setNewFolderColor] = useState("#27272a");
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [mobilePane, setMobilePane] = useState<"browse" | "preview">("browse");
  const [isPending, startTransition] = useTransition();

  const loadContentHub = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const [itemsResponse, foldersResponse] = await Promise.all([
        fetchWorkspace("/api/creator/v2/content", {
          method: "GET",
        }),
        fetchWorkspace("/api/creator/v2/folders", {
          method: "GET",
        }),
      ]);
      const itemsPayload = (await itemsResponse.json()) as
        | ContentItemsResponse
        | FailureResponse;
      const foldersPayload = (await foldersResponse.json()) as
        | FoldersResponse
        | FailureResponse;

      if (!itemsResponse.ok || !itemsPayload.ok) {
        throw new Error(readErrorMessage(itemsPayload, "Failed to load content items."));
      }
      if (!foldersResponse.ok || !foldersPayload.ok) {
        throw new Error(readErrorMessage(foldersPayload, "Failed to load folders."));
      }

      setItems(itemsPayload.data.items);
      setFolders(foldersPayload.data.folders);
    } catch (error) {
      setItems([]);
      setFolders([]);
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to load posts and threads.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [fetchWorkspace]);

  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setSelectedItemId(null);
      setMobilePane("browse");
      setNotice(null);
      setErrorMessage(null);
      setDraggingItemId(null);
      return;
    }

    void loadContentHub();
  }, [loadContentHub, open]);

  const filteredItems = useMemo(
    () => filterContentItems(items, searchQuery),
    [items, searchQuery],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    if (filteredItems.length === 0) {
      setSelectedItemId(null);
      setMobilePane("browse");
      return;
    }

    if (!selectedItemId || !filteredItems.some((item) => item.id === selectedItemId)) {
      setSelectedItemId(filteredItems[0]?.id ?? null);
    }
  }, [filteredItems, open, selectedItemId]);

  const selectedItem = useMemo(
    () => filteredItems.find((item) => item.id === selectedItemId) ?? null,
    [filteredItems, selectedItemId],
  );

  const updateItem = useCallback(
    async (
      itemId: string,
      payload: {
        status?: ContentStatus;
        folderId?: string | null;
      },
      actionLabel: string,
    ) => {
      const previousItems = items;
      setActionById((current) => ({ ...current, [itemId]: actionLabel }));
      setErrorMessage(null);
      setNotice(null);
      setItems((current) =>
        current.map((item) =>
          item.id === itemId ? applyOptimisticItemUpdate(item, payload, folders) : item,
        ),
      );

      try {
        const response = await fetchWorkspace(
          `/api/creator/v2/content/${encodeURIComponent(itemId)}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          },
        );
        const result = (await response.json()) as
          | ContentHubMutationResponse
          | FailureResponse;

        if (!response.ok || !result.ok) {
          throw new Error(readErrorMessage(result, "Failed to update content item."));
        }

        setItems((current) =>
          current.map((item) => (item.id === itemId ? result.data.item : item)),
        );
        setNotice("Content updated.");
      } catch (error) {
        setItems(previousItems);
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to update content item.",
        );
      } finally {
        setActionById((current) => {
          const next = { ...current };
          delete next[itemId];
          return next;
        });
      }
    },
    [fetchWorkspace, folders, items],
  );

  const createFolder = useCallback(async () => {
    const name = newFolderName.trim();
    if (!name) {
      setErrorMessage("Folder name is required.");
      return false;
    }

    setIsCreatingFolder(true);
    setErrorMessage(null);
    setNotice(null);

    try {
      const response = await fetchWorkspace("/api/creator/v2/folders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          color: newFolderColor,
        }),
      });
      const result = (await response.json()) as FolderCreateResponse | FailureResponse;
      if (!response.ok || !result.ok) {
        throw new Error(readErrorMessage(result, "Failed to create folder."));
      }

      setFolders((current) => [...current, result.data.folder]);
      setNewFolderName("");
      setNotice(`Created folder "${result.data.folder.name}".`);
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create folder.");
      return false;
    } finally {
      setIsCreatingFolder(false);
    }
  }, [fetchWorkspace, newFolderColor, newFolderName]);

  const selectItem = useCallback((itemId: string) => {
    setSelectedItemId(itemId);
    setMobilePane("preview");
  }, []);

  const showBrowsePane = useCallback(() => {
    setMobilePane("browse");
  }, []);

  return {
    items,
    folders,
    filteredItems,
    selectedItem,
    selectedItemId,
    setSelectedItemId,
    selectItem,
    viewMode,
    setViewMode: (nextViewMode: ContentHubViewMode) => {
      startTransition(() => {
        setViewMode(nextViewMode);
      });
    },
    searchQuery,
    setSearchQuery: (value: string) => {
      startTransition(() => {
        setSearchQuery(value);
      });
    },
    errorMessage,
    notice,
    isLoading,
    isPending,
    actionById,
    updateItem,
    isCreatingFolder,
    createFolder,
    newFolderName,
    setNewFolderName,
    newFolderColor,
    setNewFolderColor,
    draggingItemId,
    setDraggingItemId,
    mobilePane,
    showBrowsePane,
    setMobilePane,
  };
}
