"use client";

export interface SidebarThreadItem {
  id: string;
  label: string;
  meta: string;
}

export interface SidebarThreadSection {
  section: string;
  items: SidebarThreadItem[];
}

interface ResolveSidebarThreadSectionsParams {
  hasWorkspace: boolean;
  chatThreads: Array<{ id: string; title: string; updatedAt: string }>;
  activeThreadId: string | null;
  sidebarSearchQuery: string;
}

export function resolveSidebarThreadSections(
  params: ResolveSidebarThreadSectionsParams,
): SidebarThreadSection[] {
  const { hasWorkspace, chatThreads, activeThreadId, sidebarSearchQuery } = params;
  if (!hasWorkspace) {
    return [];
  }

  const trimmedQuery = sidebarSearchQuery.trim().toLowerCase();
  const filteredThreads = trimmedQuery
    ? chatThreads.filter((thread) =>
        (thread.title || "Chat").toLowerCase().includes(trimmedQuery),
      )
    : chatThreads;
  const recentItems = filteredThreads.slice(0, 10).map((thread) => ({
    id: thread.id,
    label: thread.title || "Chat",
    meta: new Date(thread.updatedAt).toLocaleDateString(),
  }));

  return [
    {
      section: "Chats",
      items:
        trimmedQuery || recentItems.length > 0
          ? recentItems
          : [
              {
                id: activeThreadId ?? "current-workspace",
                label: "New Chat",
                meta: "Active",
              },
            ],
    },
  ];
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
  | "draft_review"
  | "profile_breakdown"
  | "growth_guide";

export const WORKSPACE_CHROME_TOOLS: Array<{
  key: WorkspaceChromeToolKey;
  label: string;
}> = [
  { key: "source_materials", label: "Saved context" },
  { key: "draft_review", label: "Draft review" },
  { key: "profile_breakdown", label: "Profile breakdown" },
  { key: "growth_guide", label: "Growth guide" },
];
