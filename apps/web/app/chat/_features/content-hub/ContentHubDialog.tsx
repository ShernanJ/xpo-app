"use client";

import { useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  Columns3,
  ExternalLink,
  FolderPlus,
  List,
  Search,
  X,
} from "lucide-react";

import { SplitDialog } from "@/components/ui/split-dialog";
import { buildChatWorkspaceUrl } from "@/lib/workspaceHandle";

import type { ContentHubAuthorIdentity, ContentStatus } from "./contentHubTypes";
import { MinimalXPostPreview } from "./MinimalXPostPreview";
import { useContentHubState } from "./useContentHubState";
import {
  buildPublishedTweetHref,
  formatContentTimestamp,
  getContentStatusLabel,
  getPrimaryArtifactText,
  groupContentItemsByDate,
  groupContentItemsByStatus,
} from "./contentHubViewState";

interface ContentHubDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fetchWorkspace: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  initialHandle: string | null;
  identity: ContentHubAuthorIdentity;
  isVerifiedAccount: boolean;
}

const STATUS_PILL_CLASSNAME: Record<ContentStatus, string> = {
  DRAFT: "border-white/10 bg-white/[0.05] text-zinc-300",
  PUBLISHED: "border-white/12 bg-white/[0.08] text-white",
  ARCHIVED: "border-white/10 bg-white/[0.03] text-zinc-400",
};

export function ContentHubDialog(props: ContentHubDialogProps) {
  const { open, onOpenChange, fetchWorkspace, initialHandle, identity, isVerifiedAccount } = props;
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [dropTargetStatus, setDropTargetStatus] = useState<ContentStatus | null>(null);
  const {
    folders,
    filteredItems,
    selectedItem,
    selectItem,
    viewMode,
    setViewMode,
    searchQuery,
    setSearchQuery,
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
    draggingItemId,
    setDraggingItemId,
    mobilePane,
    showBrowsePane,
  } = useContentHubState({
    open,
    fetchWorkspace,
  });

  const dateGroups = useMemo(
    () => groupContentItemsByDate(filteredItems),
    [filteredItems],
  );
  const statusGroups = useMemo(
    () => groupContentItemsByStatus(filteredItems),
    [filteredItems],
  );
  const mobileDialogPane =
    mobilePane === "preview" && selectedItem ? "right" : "left";
  const selectedItemAction = selectedItem ? actionById[selectedItem.id] ?? null : null;

  async function handleMoveItem(nextStatus: ContentStatus) {
    if (!selectedItem || selectedItem.status === nextStatus) {
      return;
    }

    await updateItem(
      selectedItem.id,
      { status: nextStatus },
      `move-${nextStatus.toLowerCase()}`,
    );
  }

  async function handleDropStatus(nextStatus: ContentStatus) {
    if (!draggingItemId) {
      return;
    }

    const draggingItem = filteredItems.find((item) => item.id === draggingItemId);
    setDraggingItemId(null);
    setDropTargetStatus(null);

    if (!draggingItem || draggingItem.status === nextStatus) {
      return;
    }

    await updateItem(
      draggingItem.id,
      { status: nextStatus },
      `move-${nextStatus.toLowerCase()}`,
    );
  }

  const headerSlot =
    mobilePane === "preview" && selectedItem ? (
      <div className="flex h-14 items-center justify-between gap-3">
        <button
          type="button"
          onClick={showBrowsePane}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/[0.05] hover:text-white md:hidden"
          aria-label="Back to content list"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{selectedItem.title}</p>
          <p className="truncate text-xs text-zinc-500">
            {getContentStatusLabel(selectedItem.status)}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/[0.05] hover:text-white"
          aria-label="Close posts and threads"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    ) : (
      <div className="flex h-14 items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2">
          <Search className="h-4 w-4 shrink-0 text-zinc-500" />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search posts & threads"
            className="w-full bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
          />
        </div>

        <div className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1 md:inline-flex">
          <button
            type="button"
            onClick={() => setViewMode("date")}
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition ${
              viewMode === "date"
                ? "bg-white text-black"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <List className="h-3.5 w-3.5" />
            <span>Date</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("status")}
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition ${
              viewMode === "status"
                ? "bg-white text-black"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Columns3 className="h-3.5 w-3.5" />
            <span>Status</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/[0.05] hover:text-white"
          aria-label="Close posts and threads"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );

  return (
    <SplitDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Posts & Threads"
      description="Browse current posts and threads from your chat drafts."
      headerSlot={headerSlot}
      mobilePane={mobileDialogPane}
      initialFocusRef={searchInputRef}
      leftPane={
        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b border-white/10 px-4 py-3 md:hidden">
            <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1">
              <button
                type="button"
                onClick={() => setViewMode("date")}
                className={`inline-flex flex-1 items-center justify-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  viewMode === "date"
                    ? "bg-white text-black"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <List className="h-3.5 w-3.5" />
                <span>Date</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("status")}
                className={`inline-flex flex-1 items-center justify-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  viewMode === "status"
                    ? "bg-white text-black"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <Columns3 className="h-3.5 w-3.5" />
                <span>Status</span>
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {errorMessage ? (
              <div className="mb-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                {errorMessage}
              </div>
            ) : null}
            {notice ? (
              <div className="mb-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                {notice}
              </div>
            ) : null}

            {!initialHandle ? (
              <div className="flex h-full items-center justify-center rounded-[1.25rem] border border-dashed border-white/10 px-6 text-center text-sm text-zinc-500">
                Connect an active X handle first to browse posts and threads.
              </div>
            ) : isLoading ? (
              <div className="flex h-full items-center justify-center rounded-[1.25rem] border border-white/10 bg-white/[0.03] px-6 text-sm text-zinc-500">
                Loading posts and threads...
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-[1.25rem] border border-dashed border-white/10 px-6 text-center text-sm text-zinc-500">
                {searchQuery.trim()
                  ? "No posts or threads matched your search."
                  : "No posts or threads have been generated for this workspace yet."}
              </div>
            ) : viewMode === "date" ? (
              <div className="space-y-3">
                {dateGroups.map((group) => (
                  <section key={group.label}>
                    <div className="px-3 pb-1.5 pt-2 text-sm text-zinc-500">{group.label}</div>
                    <div className="space-y-1">
                      {group.items.map((item) => {
                        const isSelected = selectedItem?.id === item.id;

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => selectItem(item.id)}
                            className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${
                              isSelected
                                ? "bg-white/[0.08]"
                                : "hover:bg-white/[0.04]"
                            }`}
                          >
                            <span className="truncate text-sm text-white">{item.title}</span>
                            <span className="flex items-center gap-2 text-xs text-zinc-500">
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[11px] ${STATUS_PILL_CLASSNAME[item.status]}`}
                              >
                                {getContentStatusLabel(item.status)}
                              </span>
                              <span className="hidden whitespace-nowrap sm:inline">
                                {formatContentTimestamp(item.createdAt)}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="h-full overflow-x-auto">
                <div className="grid min-h-full auto-cols-[82%] grid-flow-col gap-3 md:grid-cols-3 md:grid-flow-row">
                  {statusGroups.map((group) => (
                    <section
                      key={group.status}
                      onDragOver={(event) => {
                        if (!draggingItemId) {
                          return;
                        }
                        event.preventDefault();
                        setDropTargetStatus(group.status);
                      }}
                      onDragLeave={() => {
                        setDropTargetStatus((current) =>
                          current === group.status ? null : current,
                        );
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        void handleDropStatus(group.status);
                      }}
                      className={`flex min-h-0 flex-col rounded-[1.25rem] border bg-white/[0.02] p-2 transition ${
                        dropTargetStatus === group.status
                          ? "border-white/25"
                          : "border-white/10"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 px-2 py-2">
                        <span className="text-sm font-medium text-white">{group.label}</span>
                        <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-zinc-500">
                          {group.items.length}
                        </span>
                      </div>
                      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
                        {group.items.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-white/10 px-3 py-6 text-center text-xs text-zinc-600">
                            Drop a post here
                          </div>
                        ) : (
                          group.items.map((item) => (
                            <div
                              key={item.id}
                              draggable
                              onDragStart={() => setDraggingItemId(item.id)}
                              onDragEnd={() => {
                                setDraggingItemId(null);
                                setDropTargetStatus(null);
                              }}
                              className="cursor-grab active:cursor-grabbing"
                            >
                              <button
                                type="button"
                                onClick={() => selectItem(item.id)}
                                className={`block w-full rounded-[1.25rem] text-left transition ${
                                  selectedItem?.id === item.id
                                    ? "ring-1 ring-white/20"
                                    : ""
                                }`}
                              >
                                <MinimalXPostPreview
                                  item={item}
                                  identity={identity}
                                  isVerifiedAccount={isVerifiedAccount}
                                  variant="compact"
                                />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      }
      rightPane={
        <div className="flex h-full min-h-0 flex-col">
          {selectedItem ? (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
                <div className="space-y-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                      @{initialHandle}
                    </p>
                    <h3 className="mt-2 text-lg font-semibold text-white">
                      {selectedItem.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-zinc-500">
                      Created {formatContentTimestamp(selectedItem.createdAt)}
                    </p>
                  </div>

                  <MinimalXPostPreview
                    item={selectedItem}
                    identity={identity}
                    isVerifiedAccount={isVerifiedAccount}
                    variant="full"
                  />
                </div>
              </div>

              <div className="border-t border-white/10 px-4 py-4 sm:px-5">
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {(["DRAFT", "PUBLISHED", "ARCHIVED"] as ContentStatus[]).map((status) => (
                      <button
                        key={status}
                        type="button"
                        disabled={
                          selectedItem.status === status || Boolean(selectedItemAction)
                        }
                        onClick={() => {
                          void handleMoveItem(status);
                        }}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                          selectedItem.status === status
                            ? "border-white/15 bg-white text-black"
                            : "border-white/10 text-zinc-300 hover:bg-white/[0.05] hover:text-white"
                        } disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        {selectedItemAction === `move-${status.toLowerCase()}`
                          ? "Saving"
                          : getContentStatusLabel(status)}
                      </button>
                    ))}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <label className="space-y-2">
                      <span className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                        Folder
                      </span>
                      <select
                        value={selectedItem.folderId ?? ""}
                        disabled={Boolean(selectedItemAction)}
                        onChange={(event) => {
                          void updateItem(
                            selectedItem.id,
                            { folderId: event.target.value || null },
                            "folder",
                          );
                        }}
                        className="w-full rounded-2xl border border-white/10 bg-[#101010] px-3 py-2.5 text-sm text-white outline-none transition focus:border-white/20"
                      >
                        <option value="">No folder</option>
                        {folders.map((folder) => (
                          <option key={folder.id} value={folder.id}>
                            {folder.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="flex flex-wrap items-end justify-end gap-2">
                      {selectedItem.threadId ? (
                        <a
                          href={buildChatWorkspaceUrl({
                            threadId: selectedItem.threadId,
                            xHandle: initialHandle,
                            messageId: selectedItem.messageId,
                          })}
                          onClick={() => onOpenChange(false)}
                          className="inline-flex items-end justify-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.05] hover:text-white"
                        >
                          <span>Open in Chat</span>
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      ) : null}
                      {selectedItem.publishedTweetId && initialHandle ? (
                        <a
                          href={buildPublishedTweetHref(initialHandle, selectedItem.publishedTweetId)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-end justify-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.05] hover:text-white"
                        >
                          <span>View Live Post</span>
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      type="text"
                      value={newFolderName}
                      onChange={(event) => setNewFolderName(event.target.value)}
                      placeholder="Create folder"
                      className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-[#101010] px-3 py-2.5 text-sm text-white outline-none transition focus:border-white/20"
                    />
                    <button
                      type="button"
                      disabled={isCreatingFolder}
                      onClick={() => {
                        void createFolder();
                      }}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <FolderPlus className="h-4 w-4" />
                      <span>{isCreatingFolder ? "Creating" : "Create Folder"}</span>
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center px-8 text-center text-sm text-zinc-500">
              Select a post or thread to preview and organize it.
            </div>
          )}
        </div>
      }
    />
  );
}
