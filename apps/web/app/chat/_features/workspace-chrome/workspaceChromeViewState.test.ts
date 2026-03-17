import test from "node:test";
import assert from "node:assert/strict";

import { resolveSidebarThreadSections } from "./workspaceChromeViewState.ts";

const NOW = new Date("2026-03-16T15:00:00.000Z");

test("resolveSidebarThreadSections groups chats into Today and Earlier", () => {
  const sections = resolveSidebarThreadSections({
    hasWorkspace: true,
    chatThreads: [
      { id: "thread-4", title: "March 14 note", updatedAt: "2026-03-14T12:00:00.000Z" },
      { id: "thread-1", title: "Today latest", updatedAt: "2026-03-16T14:00:00.000Z" },
      { id: "thread-6", title: "March 11 note", updatedAt: "2026-03-11T12:00:00.000Z" },
      { id: "thread-2", title: "Today earlier", updatedAt: "2026-03-16T09:00:00.000Z" },
      { id: "thread-5", title: "March 12 note", updatedAt: "2026-03-12T12:00:00.000Z" },
      { id: "thread-3", title: "Yesterday note", updatedAt: "2026-03-15T12:00:00.000Z" },
    ],
    activeThreadId: null,
    sidebarSearchQuery: "",
    now: NOW,
  });

  assert.deepEqual(sections, [
    {
      id: "today",
      label: "Today",
      items: [
        { id: "thread-1", label: "Today latest" },
        { id: "thread-2", label: "Today earlier" },
      ],
      hiddenCount: 0,
      isExpandable: false,
      isExpanded: false,
    },
    {
      id: "earlier",
      label: "Earlier",
      items: [
        { id: "thread-3", label: "Yesterday note" },
        { id: "thread-4", label: "March 14 note" },
        { id: "thread-5", label: "March 12 note" },
      ],
      hiddenCount: 1,
      isExpandable: true,
      isExpanded: false,
    },
  ]);
});

test("resolveSidebarThreadSections keeps the active older thread visible while Earlier is collapsed", () => {
  const sections = resolveSidebarThreadSections({
    hasWorkspace: true,
    chatThreads: [
      { id: "thread-1", title: "Yesterday note", updatedAt: "2026-03-15T12:00:00.000Z" },
      { id: "thread-2", title: "March 14 note", updatedAt: "2026-03-14T12:00:00.000Z" },
      { id: "thread-3", title: "March 13 note", updatedAt: "2026-03-13T12:00:00.000Z" },
      { id: "thread-4", title: "March 12 note", updatedAt: "2026-03-12T12:00:00.000Z" },
      { id: "thread-5", title: "March 11 note", updatedAt: "2026-03-11T12:00:00.000Z" },
    ],
    activeThreadId: "thread-5",
    sidebarSearchQuery: "",
    now: NOW,
  });

  assert.deepEqual(sections, [
    {
      id: "earlier",
      label: "Earlier",
      items: [
        { id: "thread-1", label: "Yesterday note" },
        { id: "thread-2", label: "March 14 note" },
        { id: "thread-3", label: "March 13 note" },
        { id: "thread-5", label: "March 11 note" },
      ],
      hiddenCount: 1,
      isExpandable: true,
      isExpanded: false,
    },
  ]);
});

test("resolveSidebarThreadSections shows every search match without overflow controls", () => {
  const sections = resolveSidebarThreadSections({
    hasWorkspace: true,
    chatThreads: [
      { id: "thread-1", title: "Growth sprint", updatedAt: "2026-03-16T12:00:00.000Z" },
      { id: "thread-2", title: "Podcast ideas", updatedAt: "2026-03-15T12:00:00.000Z" },
      { id: "thread-3", title: "Growth teardown", updatedAt: "2026-03-14T12:00:00.000Z" },
      { id: "thread-4", title: "Growth hooks", updatedAt: "2026-03-13T12:00:00.000Z" },
    ],
    activeThreadId: null,
    sidebarSearchQuery: "growth",
    now: NOW,
  });

  assert.deepEqual(sections, [
    {
      id: "today",
      label: "Today",
      items: [{ id: "thread-1", label: "Growth sprint" }],
      hiddenCount: 0,
      isExpandable: false,
      isExpanded: false,
    },
    {
      id: "earlier",
      label: "Earlier",
      items: [
        { id: "thread-3", label: "Growth teardown" },
        { id: "thread-4", label: "Growth hooks" },
      ],
      hiddenCount: 0,
      isExpandable: false,
      isExpanded: false,
    },
  ]);
});

test("resolveSidebarThreadSections falls back to the active workspace when no chats exist", () => {
  const sections = resolveSidebarThreadSections({
    hasWorkspace: true,
    chatThreads: [],
    activeThreadId: null,
    sidebarSearchQuery: "",
    now: NOW,
  });

  assert.deepEqual(sections, [
    {
      id: "today",
      label: "Today",
      items: [{ id: "current-workspace", label: "New Chat" }],
      hiddenCount: 0,
      isExpandable: false,
      isExpanded: false,
    },
  ]);
});

test("resolveSidebarThreadSections expands Earlier when requested", () => {
  const sections = resolveSidebarThreadSections({
    hasWorkspace: true,
    chatThreads: [
      { id: "thread-1", title: "Yesterday note", updatedAt: "2026-03-15T12:00:00.000Z" },
      { id: "thread-2", title: "March 14 note", updatedAt: "2026-03-14T12:00:00.000Z" },
      { id: "thread-3", title: "March 13 note", updatedAt: "2026-03-13T12:00:00.000Z" },
      { id: "thread-4", title: "March 12 note", updatedAt: "2026-03-12T12:00:00.000Z" },
    ],
    activeThreadId: null,
    sidebarSearchQuery: "",
    earlierThreadsExpanded: true,
    now: NOW,
  });

  assert.deepEqual(sections, [
    {
      id: "earlier",
      label: "Earlier",
      items: [
        { id: "thread-1", label: "Yesterday note" },
        { id: "thread-2", label: "March 14 note" },
        { id: "thread-3", label: "March 13 note" },
        { id: "thread-4", label: "March 12 note" },
      ],
      hiddenCount: 0,
      isExpandable: false,
      isExpanded: true,
    },
  ]);
});
