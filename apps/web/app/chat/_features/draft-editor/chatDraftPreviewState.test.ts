import test from "node:test";
import assert from "node:assert/strict";

import {
  buildThreadConversionPrompt,
  computeXWeightedCharacterCount,
} from "../../../../lib/onboarding/draftArtifacts.ts";

import {
  buildDraftCharacterCounterMeta,
  getThreadFramingStyle,
  getThreadFramingStyleLabel,
  resolveInlineDraftPreviewState,
  resolvePrimaryDraftRevealKey,
} from "./chatDraftPreviewState.ts";

const baseArtifact = {
  id: "artifact-1",
  title: "Draft",
  kind: "short_form_post" as const,
  content: "draft one",
  posts: [],
  characterCount: 9,
  weightedCharacterCount: 9,
  maxCharacterLimit: 280,
  isWithinXLimit: true,
  supportAsset: null,
  groundingSources: [],
  groundingMode: null,
  groundingExplanation: null,
  betterClosers: [],
  replyPlan: [],
  voiceTarget: null,
  noveltyNotes: [],
  threadFramingStyle: null,
};

test("resolvePrimaryDraftRevealKey prefers bundle, then artifact, then version, then message", () => {
  assert.equal(
    resolvePrimaryDraftRevealKey({
      id: "message-1",
      role: "assistant",
      draftBundle: {
        selectedOptionId: "option-2",
        options: [
          {
            id: "option-1",
            label: "One",
            versionId: "v1",
            content: "draft one",
            artifact: { ...baseArtifact, id: "artifact-a" },
          },
        ],
      },
      draftArtifacts: [{ ...baseArtifact, id: "artifact-a" }],
      activeDraftVersionId: "v9",
    }),
    "bundle:option-1",
  );

  assert.equal(
    resolvePrimaryDraftRevealKey({
      id: "message-2",
      role: "assistant",
      draftArtifacts: [{ ...baseArtifact, id: "artifact-b" }],
    }),
    "artifact:artifact-b",
  );

  assert.equal(
    resolvePrimaryDraftRevealKey({
      id: "message-3",
      role: "assistant",
      activeDraftVersionId: "v3",
    }),
    "version:v3",
  );

  assert.equal(
    resolvePrimaryDraftRevealKey({
      id: "message-4",
      role: "assistant",
    }),
    "message:message-4",
  );
});

test("buildDraftCharacterCounterMeta marks over-limit drafts", () => {
  assert.deepEqual(buildDraftCharacterCounterMeta("hello world", 5), {
    label: `${computeXWeightedCharacterCount("hello world")} / 5 chars`,
    toneClassName: "text-red-400",
  });
});

test("thread framing helpers infer and label preview framing", () => {
  assert.equal(
    getThreadFramingStyle(
      null,
      "1/3 opener\n\n---\n\n2/3 middle\n\n---\n\n3/3 close",
    ),
    "numbered",
  );
  assert.equal(getThreadFramingStyleLabel("soft_signal"), "Soft Intro");
});

test("resolveInlineDraftPreviewState plans thread preview cards and prompts", () => {
  const result = resolveInlineDraftPreviewState({
    message: {
      id: "message-1",
      role: "assistant",
      outputShape: "thread_seed",
      draftBundle: {
        selectedOptionId: "bundle-2",
        options: [
          {
            id: "bundle-1",
            label: "Option one",
            versionId: "v1",
            content: "First\n\n---\n\nSecond\n\n---\n\nThird",
            artifact: { ...baseArtifact, id: "bundle-artifact" },
          },
        ],
      },
      draftVersions: [
        {
          id: "v1",
          content: "First\n\n---\n\nSecond\n\n---\n\nThird",
          source: "assistant_generated",
          createdAt: "2026-03-14T10:00:00.000Z",
          basedOnVersionId: null,
          weightedCharacterCount: 30,
          maxCharacterLimit: 560,
          supportAsset: null,
          artifact: {
            ...baseArtifact,
            id: "artifact-thread",
            kind: "thread_seed",
            content: "First\n\n---\n\nSecond\n\n---\n\nThird",
            maxCharacterLimit: 560,
            threadFramingStyle: "soft_signal",
            posts: [
              {
                id: "post-1",
                content: "First",
                weightedCharacterCount: 5,
                maxCharacterLimit: 300,
                isWithinXLimit: true,
              },
              {
                id: "post-2",
                content: "Second",
                weightedCharacterCount: 6,
                maxCharacterLimit: 300,
                isWithinXLimit: true,
              },
              {
                id: "post-3",
                content: "Third",
                weightedCharacterCount: 5,
                maxCharacterLimit: 300,
                isWithinXLimit: true,
              },
            ],
          },
        },
      ],
      activeDraftVersionId: "v1",
    },
    composerCharacterLimit: 280,
    isVerifiedAccount: false,
    selectedThreadPreviewPostIndex: 1,
    expandedInlineThreadPreviewId: "message-1",
    selectedDraftMessageId: "message-1",
  });

  assert.equal(result.isThreadPreview, true);
  assert.equal(result.threadFramingStyle, "soft_signal");
  assert.equal(result.selectedThreadPreviewPostIndex, 1);
  assert.deepEqual(
    result.threadDeckPosts.map((post) => post.originalIndex),
    [1, 2, 0],
  );
  assert.equal(result.threadPostCharacterLimit, 300);
  assert.equal(result.hiddenThreadPostCount, 0);
  assert.equal(result.threadDeckHeight, 276);
  assert.equal(result.isExpandedThreadPreview, true);
  assert.equal(result.isFocusedDraftPreview, true);
  assert.equal(result.previewRevealKey, "bundle:bundle-2");
  assert.equal(
    result.convertToThreadPrompt,
    buildThreadConversionPrompt(300),
  );
  assert.equal(result.draftCounter.toneClassName, "text-zinc-500");
});

test("resolveInlineDraftPreviewState preserves longform toggle behavior for non-thread drafts", () => {
  const result = resolveInlineDraftPreviewState({
    message: {
      id: "message-2",
      role: "assistant",
      outputShape: "long_form_post",
      draftVersions: [
        {
          id: "v9",
          content: "A longer draft",
          source: "assistant_generated",
          createdAt: "2026-03-14T10:00:00.000Z",
          basedOnVersionId: null,
          weightedCharacterCount: 13,
          maxCharacterLimit: 700,
          supportAsset: null,
        },
      ],
      activeDraftVersionId: "v9",
    },
    composerCharacterLimit: 280,
    isVerifiedAccount: false,
    selectedThreadPreviewPostIndex: 0,
    expandedInlineThreadPreviewId: null,
    selectedDraftMessageId: null,
  });

  assert.equal(result.isThreadPreview, false);
  assert.equal(result.isLongformPreview, true);
  assert.equal(result.canToggleDraftFormat, true);
  assert.equal(
    result.transformDraftPrompt,
    "turn this into a shortform post under 280 characters",
  );
  assert.equal(result.previewRevealKey, "version:v9");
});
