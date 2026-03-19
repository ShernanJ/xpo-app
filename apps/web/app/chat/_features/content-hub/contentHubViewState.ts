"use client";

import type {
  ContentItemRecord,
  ContentItemSummaryRecord,
  ContentStatus,
  FolderRecord,
} from "./contentHubTypes";

export const CONTENT_STATUS_ORDER: ContentStatus[] = [
  "DRAFT",
  "PUBLISHED",
  "ARCHIVED",
];

export const CONTENT_HUB_STATUS_LABEL: Record<ContentStatus, string> = {
  DRAFT: "Queue",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

export const DATE_BUCKET_ORDER = [
  "Today",
  "Yesterday",
  "Last 7 Days",
  "Older",
] as const;

export const NO_GROUP_LABEL = "No Group";

export type ContentDateBucketLabel = (typeof DATE_BUCKET_ORDER)[number];

export function getContentStatusLabel(status: ContentStatus): string {
  return CONTENT_HUB_STATUS_LABEL[status];
}

export function normalizeContentSearchValue(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function getPrimaryPreviewText(
  item: Pick<ContentItemSummaryRecord, "preview">,
): string {
  return item.preview.primaryText.trim();
}

export function getFullArtifactText(
  item: Pick<ContentItemSummaryRecord, "preview"> & Partial<Pick<ContentItemRecord, "artifact">>,
): string {
  if (item.artifact) {
    const threadPosts =
      item.artifact.posts?.map((post) => post.content.trim()).filter(Boolean) ?? [];
    if (threadPosts.length > 0) {
      return threadPosts.join("\n\n");
    }

    return item.artifact.content.trim();
  }

  return getPrimaryPreviewText(item);
}

export function getSearchableContentText(item: ContentItemSummaryRecord): string {
  return normalizeContentSearchValue(
    [item.title, item.preview.primaryText].filter(Boolean).join(" "),
  );
}

export function filterContentItems(
  items: ContentItemSummaryRecord[],
  searchQuery: string,
) {
  const normalizedQuery = normalizeContentSearchValue(searchQuery);
  if (!normalizedQuery) {
    return items;
  }

  return items.filter((item) => getSearchableContentText(item).includes(normalizedQuery));
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

export function resolveDateBucketLabel(
  createdAt: string,
  now = new Date(),
): ContentDateBucketLabel {
  const targetDate = new Date(createdAt);
  const today = startOfDay(now).getTime();
  const target = startOfDay(targetDate).getTime();
  const diffDays = Math.floor((today - target) / (24 * 60 * 60 * 1000));

  if (diffDays <= 0) {
    return "Today";
  }
  if (diffDays === 1) {
    return "Yesterday";
  }
  if (diffDays <= 6) {
    return "Last 7 Days";
  }
  return "Older";
}

export function groupContentItemsByDate(
  items: ContentItemSummaryRecord[],
  now = new Date(),
) {
  const groups = new Map<ContentDateBucketLabel, ContentItemSummaryRecord[]>();

  for (const label of DATE_BUCKET_ORDER) {
    groups.set(label, []);
  }

  for (const item of items) {
    groups.get(resolveDateBucketLabel(item.createdAt, now))?.push(item);
  }

  return DATE_BUCKET_ORDER.flatMap((label) => {
    const entries = groups.get(label) ?? [];
    return entries.length > 0 ? [{ label, items: entries }] : [];
  });
}

export function groupContentItemsByStatus(items: ContentItemSummaryRecord[]) {
  return CONTENT_STATUS_ORDER.map((status) => ({
    status,
    label: getContentStatusLabel(status),
    items: items.filter((item) => item.status === status),
  }));
}

export function sortFoldersByName(folders: FolderRecord[]) {
  return [...folders].sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
  );
}

export function groupContentItemsByGroup(
  items: ContentItemSummaryRecord[],
  folders: FolderRecord[],
) {
  const groupsById = new Map<string, ContentItemSummaryRecord[]>();
  const fallbackGroups = new Map<
    string,
    { id: string; label: string; items: ContentItemSummaryRecord[] }
  >();
  const ungroupedItems: ContentItemSummaryRecord[] = [];

  for (const folder of sortFoldersByName(folders)) {
    groupsById.set(folder.id, []);
  }

  for (const item of items) {
    if (!item.folderId) {
      ungroupedItems.push(item);
      continue;
    }

    const groupItems = groupsById.get(item.folderId);
    if (groupItems) {
      groupItems.push(item);
      continue;
    }

    const fallbackGroup = fallbackGroups.get(item.folderId);
    if (fallbackGroup) {
      fallbackGroup.items.push(item);
      continue;
    }

    fallbackGroups.set(item.folderId, {
      id: item.folderId,
      label: item.folder?.name ?? "Unknown Group",
      items: [item],
    });
  }

  return [
    ...(ungroupedItems.length > 0
      ? [{ id: null, label: NO_GROUP_LABEL, items: ungroupedItems }]
      : []),
    ...sortFoldersByName(folders).flatMap((folder) => {
      const groupItems = groupsById.get(folder.id) ?? [];
      return groupItems.length > 0
        ? [{ id: folder.id, label: folder.name, items: groupItems }]
        : [];
    }),
    ...[...fallbackGroups.values()].sort((left, right) =>
      left.label.localeCompare(right.label, undefined, { sensitivity: "base" }),
    ),
  ];
}

export function buildPublishedTweetHref(handle: string, tweetId: string) {
  return `https://x.com/${handle}/status/${tweetId}`;
}

export function formatContentTimestamp(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
