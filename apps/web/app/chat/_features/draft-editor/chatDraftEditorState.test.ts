import test from "node:test";
import assert from "node:assert/strict";

import {
  addThreadDraftPost,
  buildDraftEditorHydrationState,
  buildDraftEditorSerializedContent,
  buildEditableThreadPosts,
  clampThreadPostIndex,
  ensureEditableThreadPosts,
  joinThreadPosts,
  mergeThreadDraftPostDown,
  moveThreadDraftPost,
  removeThreadDraftPost,
  splitThreadDraftPost,
  splitThreadPostAtBoundary,
} from "./chatDraftEditorState.ts";

test("buildEditableThreadPosts prefers artifact posts and falls back to split content", () => {
  assert.deepEqual(
    buildEditableThreadPosts(
      {
        id: "artifact-1",
        title: "Thread",
        kind: "thread_seed",
        content: "fallback",
        posts: [
          {
            id: "post-1",
            content: "one",
            weightedCharacterCount: 3,
            maxCharacterLimit: 280,
            isWithinXLimit: true,
          },
          {
            id: "post-2",
            content: "two",
            weightedCharacterCount: 3,
            maxCharacterLimit: 280,
            isWithinXLimit: true,
          },
        ],
        characterCount: 6,
        weightedCharacterCount: 6,
        isWithinXLimit: true,
        supportAsset: null,
        maxCharacterLimit: 280,
        groundingSources: [],
        groundingMode: null,
        groundingExplanation: null,
        betterClosers: [],
        replyPlan: [],
        voiceTarget: null,
        noveltyNotes: [],
        threadFramingStyle: null,
      },
      "unused",
    ),
    ["one", "two"],
  );

  assert.deepEqual(
    buildEditableThreadPosts(null, "first\n\n---\n\nsecond"),
    ["first", "second"],
  );
});

test("thread post helpers normalize and serialize draft content", () => {
  assert.deepEqual(ensureEditableThreadPosts([]), [""]);
  assert.equal(joinThreadPosts([" first ", "", "second "]), "first\n\n---\n\nsecond");
  assert.equal(
    buildDraftEditorSerializedContent({
      isThreadDraft: true,
      editorDraftPosts: [" first ", "", "second "],
      editorDraftText: "ignored",
    }),
    "first\n\n---\n\nsecond",
  );
});

test("buildDraftEditorHydrationState returns blank state without a selected version", () => {
  assert.deepEqual(
    buildDraftEditorHydrationState({
      selectedDraftVersionId: null,
      isThreadDraft: true,
      artifact: null,
      content: "ignored",
    }),
    {
      editorDraftText: "",
      editorDraftPosts: [],
    },
  );
});

test("buildDraftEditorHydrationState restores thread posts for thread drafts", () => {
  assert.deepEqual(
    buildDraftEditorHydrationState({
      selectedDraftVersionId: "version-1",
      isThreadDraft: true,
      artifact: null,
      content: "first\n\n---\n\nsecond",
    }),
    {
      editorDraftText: "first\n\n---\n\nsecond",
      editorDraftPosts: ["first", "second"],
    },
  );
});

test("clampThreadPostIndex keeps the selected post within bounds", () => {
  assert.equal(clampThreadPostIndex(4, 2), 1);
  assert.equal(clampThreadPostIndex(-1, 2), 0);
  assert.equal(clampThreadPostIndex(3, 0), 0);
});

test("splitThreadPostAtBoundary prefers paragraph and sentence splits", () => {
  assert.deepEqual(
    splitThreadPostAtBoundary("one\n\ntwo\n\nthree"),
    ["one\n\ntwo", "three"],
  );
  assert.deepEqual(
    splitThreadPostAtBoundary("One. Two. Three. Four."),
    ["One. Two.", "Three. Four."],
  );
});

test("splitThreadPostAtBoundary can peel off a closing CTA tail when requested", () => {
  assert.deepEqual(
    splitThreadPostAtBoundary(
      "The payoff has been dramatic. Headcount grew modestly, but each new hire moved revenue in a visible way. If you want the full playbook, comment \"HIRING\" and I'll send it over.",
      { preferClosingTail: true },
    ),
    [
      "The payoff has been dramatic. Headcount grew modestly, but each new hire moved revenue in a visible way.",
      "If you want the full playbook, comment \"HIRING\" and I'll send it over.",
    ],
  );
});

test("thread post mutation helpers preserve selected index behavior", () => {
  assert.deepEqual(
    moveThreadDraftPost({
      posts: ["one", "two", "three"],
      index: 1,
      direction: "up",
    }),
    {
      posts: ["two", "one", "three"],
      selectedIndex: 0,
    },
  );

  assert.deepEqual(
    splitThreadDraftPost({
      posts: ["One. Two. Three. Four."],
      index: 0,
    }),
    {
      posts: ["One. Two.", "Three. Four."],
      selectedIndex: 0,
    },
  );

  assert.deepEqual(
    splitThreadDraftPost({
      posts: [
        "Opening post.",
        "The payoff has been dramatic. Headcount grew modestly, but each new hire moved revenue in a visible way. If you want the full playbook, comment \"HIRING\" and I'll send it over.",
      ],
      index: 1,
    }),
    {
      posts: [
        "Opening post.",
        "The payoff has been dramatic. Headcount grew modestly, but each new hire moved revenue in a visible way.",
        "If you want the full playbook, comment \"HIRING\" and I'll send it over.",
      ],
      selectedIndex: 1,
    },
  );

  assert.deepEqual(
    mergeThreadDraftPostDown({
      posts: ["one", "two", "three"],
      index: 1,
    }),
    {
      posts: ["one", "two\n\nthree"],
      selectedIndex: 1,
    },
  );

  assert.deepEqual(
    addThreadDraftPost({
      posts: ["one", "two"],
      index: 1,
    }),
    {
      posts: ["one", "", "two"],
      selectedIndex: 1,
    },
  );

  assert.deepEqual(
    removeThreadDraftPost({
      posts: ["one", "two", "three"],
      index: 2,
    }),
    {
      posts: ["one", "two"],
      selectedIndex: 1,
    },
  );
});
