"use client";

import {
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Check,
  ChevronLeft,
  Columns3,
  ExternalLink,
  Folder,
  List,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";

import { SplitDialog } from "@/components/ui/split-dialog";
import { buildChatWorkspaceUrl } from "@/lib/workspaceHandle";

import type {
  ContentHubAuthorIdentity,
  ContentHubContentType,
  ContentHubViewMode,
  ContentItemSummaryRecord,
  ContentStatus,
  FolderRecord,
} from "./contentHubTypes";
import { MinimalXPostPreview } from "./MinimalXPostPreview";
import { useContentHubState } from "./useContentHubState";
import {
  NO_GROUP_LABEL,
  buildPublishedTweetHref,
  formatContentTimestamp,
  getContentStatusLabel,
  groupContentItemsByDate,
  groupContentItemsByGroup,
  groupContentItemsByStatus,
  sortFoldersByName,
} from "./contentHubViewState";

export interface ContentHubDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fetchWorkspace: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  initialHandle: string | null;
  identity: ContentHubAuthorIdentity;
  isVerifiedAccount: boolean;
}

interface ContentHubInlineDialogProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  initialFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
  layerClassName?: string;
}

interface ContentHubListItemButtonProps {
  item: ContentItemSummaryRecord;
  isSelected: boolean;
  onSelect: (itemId: string) => void;
}

const STATUS_PILL_CLASSNAME: Record<ContentStatus, string> = {
  DRAFT: "border-white/10 bg-white/[0.05] text-zinc-300",
  PUBLISHED: "border-white/12 bg-white/[0.08] text-white",
  ARCHIVED: "border-white/10 bg-white/[0.03] text-zinc-400",
};

const STATUS_OPTIONS: ContentStatus[] = ["DRAFT", "PUBLISHED", "ARCHIVED"];
const ADD_NEW_GROUP_VALUE = "__add_new_group__";
const VIEW_MODE_OPTIONS: Array<{
  value: ContentHubViewMode;
  label: string;
  icon: LucideIcon;
}> = [
  { value: "date", label: "Date", icon: List },
  { value: "status", label: "Status", icon: Columns3 },
  { value: "group", label: "Group", icon: Folder },
];

function formatGroupItemCount(count: number, contentType: ContentHubContentType) {
  if (contentType === "replies") {
    return count === 1 ? "1 reply" : `${count} replies`;
  }

  return count === 1 ? "1 post/thread" : `${count} posts/threads`;
}

function ContentHubInlineDialog(props: ContentHubInlineDialogProps) {
  const {
    open,
    title,
    description,
    onClose,
    initialFocusRef,
    children,
    layerClassName,
  } = props;
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const focusTarget = initialFocusRef?.current ?? panelRef.current;
    focusTarget?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [initialFocusRef, onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className={[
        "fixed inset-0 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-[2px]",
        layerClassName ?? "z-[110]",
      ]
        .filter(Boolean)
        .join(" ")}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className="flex max-h-[calc(100dvh-3rem)] w-full max-w-md flex-col overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#0F0F0F] shadow-[0_24px_80px_rgba(0,0,0,0.55)] focus:outline-none"
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div>
            <h3 id={titleId} className="text-lg font-semibold text-white">
              {title}
            </h3>
            {description ? (
              <p id={descriptionId} className="mt-1.5 text-sm leading-6 text-zinc-400">
                {description}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/[0.05] hover:text-white"
            aria-label={`Close ${title}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function ContentHubListItemButton(props: ContentHubListItemButtonProps) {
  const { item, isSelected, onSelect } = props;

  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${
        isSelected ? "bg-white/[0.08]" : "hover:bg-white/[0.04]"
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
}

export function ContentHubDialog(props: ContentHubDialogProps) {
  const { open, onOpenChange, fetchWorkspace, initialHandle, identity, isVerifiedAccount } = props;
  const searchInputRef = useRef<HTMLInputElement>(null);
  const createGroupInputRef = useRef<HTMLInputElement>(null);
  const [dropTargetStatus, setDropTargetStatus] = useState<ContentStatus | null>(null);
  const [isCreateGroupDialogOpen, setIsCreateGroupDialogOpen] = useState(false);
  const [createGroupName, setCreateGroupName] = useState("");
  const [createGroupAssignmentItemId, setCreateGroupAssignmentItemId] = useState<string | null>(
    null,
  );
  const [isManageGroupsDialogOpen, setIsManageGroupsDialogOpen] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");
  const [deleteConfirmationGroupId, setDeleteConfirmationGroupId] = useState<string | null>(null);
  const {
    folders,
    filteredItems,
    selectedItem,
    selectedItemSummary,
    selectedItemId,
    selectItem,
    contentType,
    setContentType,
    viewMode,
    setViewMode,
    searchQuery,
    setSearchQuery,
    errorMessage,
    clearMessages,
    isLoading,
    actionById,
    updateItem,
    isCreatingFolder,
    createFolder,
    folderActionById,
    renameFolder,
    deleteFolder,
    draggingItemId,
    setDraggingItemId,
    mobilePane,
    showBrowsePane,
    isSelectedItemLoading,
  } = useContentHubState({
    open,
    fetchWorkspace,
  });

  const sortedFolders = useMemo(() => sortFoldersByName(folders), [folders]);
  const dateGroups = useMemo(
    () => groupContentItemsByDate(filteredItems),
    [filteredItems],
  );
  const statusGroups = useMemo(
    () => groupContentItemsByStatus(filteredItems),
    [filteredItems],
  );
  const groupGroups = useMemo(
    () => groupContentItemsByGroup(filteredItems, sortedFolders),
    [filteredItems, sortedFolders],
  );
  const activeItem = selectedItem ?? selectedItemSummary;
  const isReplyTab = contentType === "replies";
  const contentCollectionLabel = isReplyTab ? "Replies" : "Posts & Threads";
  const contentCollectionDescription = isReplyTab
    ? "Browse saved reply drafts and their source tweets."
    : "Browse current posts and threads from your chat drafts.";
  const isPreviewPaneVisibleOnMobile =
    mobilePane === "preview" && Boolean(selectedItemSummary);
  const mobileDialogPane =
    isPreviewPaneVisibleOnMobile ? "right" : "left";
  const selectedItemAction = activeItem ? actionById[activeItem.id] ?? null : null;

  useEffect(() => {
    if (!open) {
      setIsCreateGroupDialogOpen(false);
      setCreateGroupName("");
      setCreateGroupAssignmentItemId(null);
      setIsManageGroupsDialogOpen(false);
      setEditingGroupId(null);
      setEditingGroupName("");
      setDeleteConfirmationGroupId(null);
    }
  }, [open]);

  function closeCreateGroupDialog() {
    setIsCreateGroupDialogOpen(false);
    setCreateGroupName("");
    setCreateGroupAssignmentItemId(null);
  }

  function openCreateGroupDialog(assignItemId: string | null) {
    clearMessages();
    setCreateGroupAssignmentItemId(assignItemId);
    setCreateGroupName("");
    setIsCreateGroupDialogOpen(true);
  }

  function closeManageGroupsDialog() {
    setIsManageGroupsDialogOpen(false);
    setEditingGroupId(null);
    setEditingGroupName("");
    setDeleteConfirmationGroupId(null);
  }

  function beginRenameGroup(folder: FolderRecord) {
    clearMessages();
    setDeleteConfirmationGroupId((current) =>
      current === folder.id ? null : current,
    );
    setEditingGroupId(folder.id);
    setEditingGroupName(folder.name);
  }

  function cancelRenameGroup() {
    setEditingGroupId(null);
    setEditingGroupName("");
  }

  async function handleMoveItem(nextStatus: ContentStatus) {
    if (!activeItem || activeItem.status === nextStatus) {
      return;
    }

    await updateItem(
      activeItem.id,
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

  async function handleCreateGroupSubmit() {
    const createdGroup = await createFolder(createGroupName);
    if (!createdGroup) {
      return;
    }

    const assignItemId = createGroupAssignmentItemId;
    if (assignItemId) {
      const didAssign = await updateItem(
        assignItemId,
        { folderId: createdGroup.id },
        "group",
      );
      if (!didAssign) {
        return;
      }
    }

    closeCreateGroupDialog();
  }

  async function handleRenameGroupSubmit(folderId: string) {
    const renamedGroup = await renameFolder(folderId, editingGroupName);
    if (!renamedGroup) {
      return;
    }

    if (activeItem?.folderId === folderId) {
      setEditingGroupName(renamedGroup.name);
    }

    cancelRenameGroup();
  }

  async function handleDeleteGroup(folderId: string) {
    const deletedGroup = await deleteFolder(folderId);
    if (!deletedGroup) {
      return;
    }

    if (editingGroupId === folderId) {
      cancelRenameGroup();
    }
    if (deleteConfirmationGroupId === folderId) {
      setDeleteConfirmationGroupId(null);
    }
  }

  function renderSectionedList(
    groups: Array<{ id?: string | null; label: string; items: ContentItemSummaryRecord[] }>,
  ) {
    return (
      <div className="space-y-3">
        {groups.map((group) => (
          <section key={group.id ?? group.label}>
            <div className="px-3 pb-1.5 pt-2 text-sm text-zinc-500">{group.label}</div>
            <div className="space-y-1">
              {group.items.map((item) => (
                <ContentHubListItemButton
                  key={item.id}
                  item={item}
                  isSelected={selectedItemId === item.id}
                  onSelect={selectItem}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  }

  const viewModeToggle = (
    <div className="flex w-full items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1 md:w-auto">
      {VIEW_MODE_OPTIONS.map((option) => {
        const Icon = option.icon;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setViewMode(option.value)}
            className={`inline-flex flex-1 items-center justify-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition md:flex-none ${
              viewMode === option.value
                ? "bg-white text-black"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );

  const contentTypeToggle = (
    <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1">
      {(
        [
          { value: "posts_threads", label: "Posts & Threads" },
          { value: "replies", label: "Replies" },
        ] as const
      ).map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => setContentType(option.value)}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
            contentType === option.value
              ? "bg-white text-black"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );

  function renderBackButton() {
    return (
      <button
        type="button"
        onClick={showBrowsePane}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/[0.05] hover:text-white"
        aria-label="Back to content list"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
    );
  }

  function renderCloseButton(className?: string) {
    return (
      <button
        type="button"
        onClick={() => onOpenChange(false)}
        className={[
          "h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/[0.05] hover:text-white",
          className ?? "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label={isReplyTab ? "Close replies" : "Close posts and threads"}
      >
        <X className="h-4 w-4" />
      </button>
    );
  }

  const headerSlot = (
    <div className="py-3">
      <div className="flex items-center justify-between gap-3 md:hidden">
        <div className="flex min-w-0 items-center gap-2">
          {isPreviewPaneVisibleOnMobile ? renderBackButton() : null}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">
              {contentCollectionLabel}
            </p>
            <p className="text-[11px] text-zinc-500">
              {isPreviewPaneVisibleOnMobile
                ? "Preview your selected draft"
                : isReplyTab
                  ? "Browse and organize reply drafts"
                  : "Browse and organize drafts"}
            </p>
          </div>
        </div>
        {renderCloseButton("inline-flex")}
      </div>

      <div className="mt-3 md:hidden">{contentTypeToggle}</div>

      <div className="mt-3 flex items-center gap-3 md:mt-0">
        <div className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2">
          <Search className="h-4 w-4 shrink-0 text-zinc-500" />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={isReplyTab ? "Search replies" : "Search posts & threads"}
            className="w-full bg-transparent text-[16px] leading-6 text-zinc-200 outline-none sm:text-sm sm:leading-normal placeholder:text-zinc-500"
          />
        </div>

        <div className="hidden md:flex">{contentTypeToggle}</div>
        <div className="hidden md:flex">{viewModeToggle}</div>

        {renderCloseButton("hidden md:inline-flex")}
      </div>

      <div className="mt-3 md:hidden">{viewModeToggle}</div>
    </div>
  );

  return (
    <>
      <SplitDialog
        open={open}
        onOpenChange={onOpenChange}
        title={contentCollectionLabel}
        description={contentCollectionDescription}
        headerSlot={headerSlot}
        mobilePane={mobileDialogPane}
        initialFocusRef={searchInputRef}
        resizable
        defaultLeftPaneWidth={54}
        minLeftPaneWidth={38}
        maxLeftPaneWidth={72}
        leftPane={
          <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {errorMessage ? (
                <div className="mb-3 flex items-start justify-between gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                  <span className="min-w-0 flex-1">{errorMessage}</span>
                  <button
                    type="button"
                    onClick={clearMessages}
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-red-100/80 transition hover:bg-red-500/15 hover:text-red-50"
                    aria-label="Dismiss warning"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null}

              {!initialHandle ? (
                <div className="flex h-full items-center justify-center rounded-[1.25rem] border border-dashed border-white/10 px-6 text-center text-sm text-zinc-500">
                  {isReplyTab
                    ? "Connect an active X handle first to browse replies."
                    : "Connect an active X handle first to browse posts and threads."}
                </div>
              ) : isLoading ? (
                <div className="flex h-full items-center justify-center rounded-[1.25rem] border border-white/10 bg-white/[0.03] px-6 text-sm text-zinc-500">
                  {isReplyTab ? "Loading replies..." : "Loading posts and threads..."}
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="flex h-full items-center justify-center rounded-[1.25rem] border border-dashed border-white/10 px-6 text-center text-sm text-zinc-500">
                  {searchQuery.trim()
                    ? isReplyTab
                      ? "No replies matched your search."
                      : "No posts or threads matched your search."
                    : isReplyTab
                      ? "No replies have been generated for this workspace yet."
                      : "No posts or threads have been generated for this workspace yet."}
                </div>
              ) : viewMode === "date" ? (
                renderSectionedList(dateGroups)
              ) : viewMode === "group" ? (
                renderSectionedList(groupGroups)
              ) : (
                <div className="h-full overflow-x-auto">
                  <div className="grid min-h-full auto-cols-[82%] grid-flow-col gap-3 md:auto-cols-[minmax(240px,1fr)] md:grid-cols-none md:grid-flow-col">
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
                              {isReplyTab ? "Drop a reply here" : "Drop a post here"}
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
                                    selectedItemId === item.id
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
          <div className="relative flex h-full min-h-0 flex-col">
            {activeItem ? (
              <>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
                  <div className="space-y-4 pb-20">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-[999_1_18rem]">
                        <div className="flex items-start gap-2">
                          <h3 className="min-w-0 flex-1 text-lg font-semibold text-white">
                            {activeItem.title}
                          </h3>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-zinc-500">
                          Created {formatContentTimestamp(activeItem.createdAt)}
                        </p>
                      </div>

                      <div className="min-w-0 max-w-full flex-[1_1_17.5rem]">
                        <div className="space-y-1.5">
                          <label className="grid grid-cols-[46px_minmax(0,1fr)] items-center gap-1.5">
                            <span className="text-[11px] font-medium text-zinc-500">
                              Status:
                            </span>
                            <select
                              aria-label="Status:"
                              value={activeItem.status}
                              disabled={Boolean(selectedItemAction)}
                              onChange={(event) => {
                                void handleMoveItem(event.target.value as ContentStatus);
                              }}
                              className="w-full rounded-lg border border-white/10 bg-[#101010] px-2.5 py-1.5 text-xs text-white outline-none transition focus:border-white/20"
                            >
                              {STATUS_OPTIONS.map((status) => (
                                <option key={status} value={status}>
                                  {getContentStatusLabel(status)}
                                </option>
                              ))}
                            </select>
                          </label>

                          <div className="grid grid-cols-[46px_minmax(0,1fr)] items-center gap-1.5">
                            <span className="text-[11px] font-medium text-zinc-500">
                              Group:
                            </span>
                            <div className="flex min-w-0 items-center gap-1.5">
                              <label className="min-w-0 flex-1">
                                <span className="sr-only">Group:</span>
                                <select
                                  aria-label="Group:"
                                  value={activeItem.folderId ?? ""}
                                  disabled={Boolean(selectedItemAction)}
                                  onChange={(event) => {
                                    if (event.target.value === ADD_NEW_GROUP_VALUE) {
                                      openCreateGroupDialog(activeItem.id);
                                      return;
                                    }

                                    void updateItem(
                                      activeItem.id,
                                      { folderId: event.target.value || null },
                                      "group",
                                    );
                                  }}
                                  className="w-full rounded-lg border border-white/10 bg-[#101010] px-2.5 py-1.5 text-xs text-white outline-none transition focus:border-white/20"
                                >
                                  <option value="">{NO_GROUP_LABEL}</option>
                                  {sortedFolders.map((folder) => (
                                    <option key={folder.id} value={folder.id}>
                                      {folder.name}
                                    </option>
                                  ))}
                                  <option value={ADD_NEW_GROUP_VALUE}>Add New Group</option>
                                </select>
                              </label>

                              <button
                                type="button"
                                onClick={() => {
                                  clearMessages();
                                  setIsManageGroupsDialogOpen(true);
                                }}
                                className="shrink-0 rounded-full border border-white/10 px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 transition hover:bg-white/[0.05] hover:text-white"
                              >
                                Manage Groups
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {selectedItem ? (
                      <MinimalXPostPreview
                        item={selectedItem}
                        identity={identity}
                        isVerifiedAccount={isVerifiedAccount}
                        variant="full"
                      />
                    ) : (
                      <div className="rounded-[1.5rem] border border-white/10 bg-black/40 p-4">
                        <div className="space-y-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium text-white">
                              Loading full preview...
                            </p>
                            {isSelectedItemLoading ? (
                              <span className="text-xs text-zinc-500">Fetching details</span>
                            ) : null}
                          </div>
                          <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-300">
                            {activeItem.preview.primaryText || "Preparing preview content..."}
                          </p>
                          <div className="grid gap-2">
                            <div className="h-3 rounded-full bg-white/6" />
                            <div className="h-3 w-5/6 rounded-full bg-white/6" />
                            <div className="h-3 w-2/3 rounded-full bg-white/6" />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {activeItem.threadId ? (
                  <a
                    href={buildChatWorkspaceUrl({
                      threadId: activeItem.threadId,
                      xHandle: initialHandle,
                      messageId: activeItem.messageId,
                    })}
                    onClick={() => onOpenChange(false)}
                    aria-label="Open in Chat"
                    title="Open in Chat"
                    className="absolute bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-10 inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-[#101010]/95 text-zinc-200 shadow-[0_12px_30px_rgba(0,0,0,0.45)] transition hover:bg-white/[0.08] hover:text-white"
                  >
                    <ExternalLink className="h-4 w-4" />
                    <span className="sr-only">Open in Chat</span>
                  </a>
                ) : activeItem.publishedTweetId && initialHandle ? (
                  <a
                    href={buildPublishedTweetHref(initialHandle, activeItem.publishedTweetId)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="View Live Post"
                    title="View Live Post"
                    className="absolute bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-10 inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-[#101010]/95 text-zinc-200 shadow-[0_12px_30px_rgba(0,0,0,0.45)] transition hover:bg-white/[0.08] hover:text-white"
                  >
                    <ExternalLink className="h-4 w-4" />
                    <span className="sr-only">View Live Post</span>
                  </a>
                ) : null}
              </>
            ) : (
              <div className="flex h-full items-center justify-center px-8 text-center text-sm text-zinc-500">
                {isReplyTab
                  ? "Select a reply to preview and organize it."
                  : "Select a post or thread to preview and organize it."}
              </div>
            )}
          </div>
        }
      />

      <ContentHubInlineDialog
        open={isCreateGroupDialogOpen}
        title="Add Group"
        description={`Create a new group and keep your ${
          isReplyTab ? "replies" : "posts and threads"
        } easier to organize.`}
        onClose={closeCreateGroupDialog}
        initialFocusRef={createGroupInputRef}
        layerClassName="z-[115]"
      >
        <div className="space-y-4 px-5 py-4">
          {errorMessage ? (
            <div className="flex items-start justify-between gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-100">
              <span className="min-w-0 flex-1">{errorMessage}</span>
              <button
                type="button"
                onClick={clearMessages}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-red-100/80 transition hover:bg-red-500/15 hover:text-red-50"
                aria-label="Dismiss warning"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}

          <label className="block space-y-2">
            <span className="text-sm font-medium text-zinc-300">Group name</span>
            <input
              ref={createGroupInputRef}
              type="text"
              value={createGroupName}
              onChange={(event) => setCreateGroupName(event.target.value)}
              placeholder="Enter group name"
              className="w-full rounded-2xl border border-white/10 bg-[#101010] px-3 py-2.5 text-sm text-white outline-none transition focus:border-white/20"
            />
          </label>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeCreateGroupDialog}
              className="rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/[0.05] hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isCreatingFolder}
              onClick={() => {
                void handleCreateGroupSubmit();
              }}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              <span>{isCreatingFolder ? "Saving" : "Save"}</span>
            </button>
          </div>
        </div>
      </ContentHubInlineDialog>

      <ContentHubInlineDialog
        open={isManageGroupsDialogOpen}
        title="Manage Groups"
        description={`Rename, add, or delete groups. Deleting a group moves its ${
          isReplyTab ? "replies" : "posts and threads"
        } to No Group.`}
        onClose={closeManageGroupsDialog}
      >
        <div className="space-y-4 px-5 py-4">
          {errorMessage ? (
            <div className="flex items-start justify-between gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-100">
              <span className="min-w-0 flex-1">{errorMessage}</span>
              <button
                type="button"
                onClick={clearMessages}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-red-100/80 transition hover:bg-red-500/15 hover:text-red-50"
                aria-label="Dismiss warning"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => openCreateGroupDialog(null)}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.05] hover:text-white"
            >
              <Plus className="h-4 w-4" />
              <span>Add Group</span>
            </button>
          </div>

          {sortedFolders.length === 0 ? (
            <div className="rounded-[1.25rem] border border-dashed border-white/10 px-5 py-8 text-center text-sm text-zinc-500">
              No groups yet. Create one to organize your {isReplyTab ? "replies" : "posts and threads"}.
            </div>
          ) : (
            <div className="space-y-3">
              {sortedFolders.map((folder) => {
                const groupAction = folderActionById[folder.id] ?? null;
                const isEditing = editingGroupId === folder.id;
                const isDeleteConfirming = deleteConfirmationGroupId === folder.id;

                return (
                  <div
                    key={folder.id}
                    className="rounded-[1.25rem] border border-white/10 bg-white/[0.02] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        {isEditing ? (
                          <label className="block space-y-2">
                            <span className="sr-only">Rename group</span>
                            <input
                              type="text"
                              value={editingGroupName}
                              onChange={(event) => setEditingGroupName(event.target.value)}
                              className="w-full rounded-2xl border border-white/10 bg-[#101010] px-3 py-2.5 text-sm text-white outline-none transition focus:border-white/20"
                            />
                          </label>
                        ) : (
                          <p className="truncate text-sm font-medium text-white">
                            {folder.name}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-zinc-500">
                          {formatGroupItemCount(folder.itemCount, contentType)}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              onClick={cancelRenameGroup}
                              className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.05] hover:text-white"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={groupAction === "rename"}
                              onClick={() => {
                                void handleRenameGroupSubmit(folder.id);
                              }}
                              className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white px-3 py-1.5 text-xs font-medium text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <Check className="h-3.5 w-3.5" />
                              <span>{groupAction === "rename" ? "Saving" : "Save"}</span>
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => beginRenameGroup(folder)}
                              className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.05] hover:text-white"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              <span>Rename</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setDeleteConfirmationGroupId((current) =>
                                  current === folder.id ? null : folder.id,
                                )
                              }
                              className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.05] hover:text-white"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>Delete</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {isDeleteConfirming ? (
                      <div className="mt-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-3 py-3">
                        <p className="text-sm text-amber-100">
                          Delete this group? {formatGroupItemCount(folder.itemCount, contentType)} will move to {NO_GROUP_LABEL}.
                        </p>
                        <div className="mt-3 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmationGroupId(null)}
                            className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.05] hover:text-white"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={groupAction === "delete"}
                            onClick={() => {
                              void handleDeleteGroup(folder.id);
                            }}
                            className="inline-flex items-center gap-1 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>{groupAction === "delete" ? "Deleting" : "Delete Group"}</span>
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </ContentHubInlineDialog>
    </>
  );
}
