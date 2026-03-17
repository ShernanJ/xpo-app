"use client";

export interface SidebarThreadItem {
  id: string;
  label: string;
}

export type SidebarThreadSectionId = "today" | "earlier";

export interface SidebarThreadSection {
  id: SidebarThreadSectionId;
  label: string;
  items: SidebarThreadItem[];
  hiddenCount: number;
  revealCount: number;
  isExpandable: boolean;
  isExpanded: boolean;
}

interface ResolveSidebarThreadSectionsParams {
  hasWorkspace: boolean;
  chatThreads: Array<{ id: string; title: string; updatedAt: string }>;
  activeThreadId: string | null;
  sidebarSearchQuery: string;
  earlierThreadsVisibleCount?: number;
  now?: Date;
}

const COLLAPSED_EARLIER_THREAD_LIMIT = 3;
const EARLIER_THREAD_PAGE_SIZE = 3;

function getThreadTimestamp(updatedAt: string): number {
  const parsedDate = new Date(updatedAt);
  return Number.isNaN(parsedDate.getTime()) ? 0 : parsedDate.getTime();
}

function isSameLocalCalendarDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function isThreadUpdatedToday(updatedAt: string, now: Date): boolean {
  const parsedDate = new Date(updatedAt);
  if (Number.isNaN(parsedDate.getTime())) {
    return false;
  }

  return isSameLocalCalendarDay(parsedDate, now);
}

function mapSidebarThreadItem(thread: { id: string; title: string }): SidebarThreadItem {
  return {
    id: thread.id,
    label: thread.title || "Chat",
  };
}

function resolveCollapsedEarlierItems(params: {
  items: SidebarThreadItem[];
  activeThreadId: string | null;
  visibleCount: number;
}): Pick<SidebarThreadSection, "items" | "hiddenCount" | "revealCount" | "isExpandable"> {
  const previewIds = new Set(params.items.slice(0, params.visibleCount).map((item) => item.id));

  if (params.activeThreadId) {
    previewIds.add(params.activeThreadId);
  }

  const visibleItems = params.items.filter((item) => previewIds.has(item.id));
  const hiddenCount = Math.max(params.items.length - visibleItems.length, 0);

  return {
    items: visibleItems,
    hiddenCount,
    revealCount: Math.min(hiddenCount, EARLIER_THREAD_PAGE_SIZE),
    isExpandable: hiddenCount > 0,
  };
}

export function resolveSidebarThreadSections(
  params: ResolveSidebarThreadSectionsParams,
): SidebarThreadSection[] {
  const {
    hasWorkspace,
    chatThreads,
    activeThreadId,
    sidebarSearchQuery,
    earlierThreadsVisibleCount = COLLAPSED_EARLIER_THREAD_LIMIT,
    now = new Date(),
  } = params;
  if (!hasWorkspace) {
    return [];
  }

  const trimmedQuery = sidebarSearchQuery.trim().toLowerCase();
  const isSearching = trimmedQuery.length > 0;
  const filteredThreads = (isSearching
    ? chatThreads.filter((thread) =>
        (thread.title || "Chat").toLowerCase().includes(trimmedQuery),
      )
    : chatThreads
  ).toSorted((left, right) => getThreadTimestamp(right.updatedAt) - getThreadTimestamp(left.updatedAt));

  if (!isSearching && filteredThreads.length === 0) {
    return [
      {
        id: "today",
        label: "Today",
        items: [
          {
            id: activeThreadId ?? "current-workspace",
            label: "New Chat",
          },
        ],
        hiddenCount: 0,
        revealCount: 0,
        isExpandable: false,
        isExpanded: false,
      },
    ];
  }

  const todayItems: SidebarThreadItem[] = [];
  const earlierItems: SidebarThreadItem[] = [];

  for (const thread of filteredThreads) {
    if (isThreadUpdatedToday(thread.updatedAt, now)) {
      todayItems.push(mapSidebarThreadItem(thread));
      continue;
    }

    earlierItems.push(mapSidebarThreadItem(thread));
  }

  const sections: SidebarThreadSection[] = [];

  if (todayItems.length > 0) {
    sections.push({
      id: "today",
      label: "Today",
      items: todayItems,
      hiddenCount: 0,
      revealCount: 0,
      isExpandable: false,
      isExpanded: false,
    });
  }

  if (earlierItems.length > 0) {
    if (isSearching) {
      sections.push({
        id: "earlier",
        label: "Earlier",
        items: earlierItems,
        hiddenCount: 0,
        revealCount: 0,
        isExpandable: false,
        isExpanded: false,
      });
    } else {
      const collapsedEarlierSection = resolveCollapsedEarlierItems({
        items: earlierItems,
        activeThreadId,
        visibleCount: Math.max(earlierThreadsVisibleCount, COLLAPSED_EARLIER_THREAD_LIMIT),
      });

      sections.push({
        id: "earlier",
        label: "Earlier",
        items: collapsedEarlierSection.items,
        hiddenCount: collapsedEarlierSection.hiddenCount,
        revealCount: collapsedEarlierSection.revealCount,
        isExpandable: collapsedEarlierSection.isExpandable,
        isExpanded:
          !collapsedEarlierSection.isExpandable &&
          earlierThreadsVisibleCount > COLLAPSED_EARLIER_THREAD_LIMIT,
      });
    }
  }

  return sections;
}

export function resolveAccountAvatarFallback(params: {
  accountName: string | null;
  sessionEmail: string | null;
}): string {
  return (
    params.accountName?.slice(0, 1).toUpperCase() ??
    params.sessionEmail?.slice(0, 1).toUpperCase() ??
    "X"
  );
}

export function resolveAccountProfileAriaLabel(params: {
  accountName: string | null;
  sessionEmail: string | null;
}): string {
  return `${params.accountName ?? params.sessionEmail ?? "X"} profile photo`;
}

export type WorkspaceChromeToolKey =
  | "source_materials"
  | "profile_breakdown"
  | "growth_guide";

export const WORKSPACE_CHROME_TOOLS: Array<{
  key: WorkspaceChromeToolKey;
  label: string;
}> = [
  { key: "source_materials", label: "Saved context" },
  { key: "profile_breakdown", label: "Profile breakdown" },
  { key: "growth_guide", label: "Growth guide" },
];
