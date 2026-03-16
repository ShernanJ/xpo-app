import {
  computeXWeightedCharacterCount,
  getXCharacterLimitForAccount,
  inferThreadFramingStyleFromPosts,
  type DraftArtifactDetails,
  type ThreadFramingStyle,
} from "../../../../lib/onboarding/draftArtifacts.ts";

import { getThreadPostCharacterLimit, type DraftBundleLike } from "./chatDraftPersistenceState.ts";
import { splitThreadContent } from "./chatDraftEditorState.ts";
import {
  normalizeDraftVersionBundle,
  type ChatMessageLike,
  type DraftVersionBundleLike,
} from "./chatDraftSessionState.ts";

type DraftArtifact = DraftArtifactDetails;
type OutputShape =
  | "coach_question"
  | "ideation_angles"
  | "planning_outline"
  | "profile_analysis"
  | "short_form_post"
  | "long_form_post"
  | "thread_seed"
  | "reply_candidate"
  | "quote_candidate";

export interface DraftCounterMeta {
  label: string;
  toneClassName: string;
}

export interface DraftPreviewThreadPost {
  content: string;
  originalIndex: number;
  weightedCharacterCount: number;
  maxCharacterLimit: number;
}

export interface DraftPreviewMessageLike extends ChatMessageLike {
  outputShape?: OutputShape;
  draftBundle?: DraftBundleLike | null;
}

export interface InlineDraftPreviewState {
  draftBundle: DraftVersionBundleLike | null;
  previewArtifact: DraftArtifact | null;
  previewDraft: string;
  threadPreviewPosts: DraftPreviewThreadPost[];
  isThreadPreview: boolean;
  threadFramingStyle: ThreadFramingStyle | null;
  selectedThreadPreviewPostIndex: number;
  threadPostCharacterLimit: number;
  threadDeckPosts: DraftPreviewThreadPost[];
  hiddenThreadPostCount: number;
  threadDeckHeight: number;
  isExpandedThreadPreview: boolean;
  draftCounter: DraftCounterMeta;
  isLongformPreview: boolean;
  canToggleDraftFormat: boolean;
  transformDraftPrompt: string;
  convertToThreadPrompt: string;
  isFocusedDraftPreview: boolean;
  previewRevealKey: string;
}

export function buildDraftBundleRevealKey(optionId: string): string {
  return `bundle:${optionId}`;
}

export function buildDraftArtifactRevealKey(artifactId: string): string {
  return `artifact:${artifactId}`;
}

function buildDraftVersionRevealKey(versionId: string): string {
  return `version:${versionId}`;
}

function buildDraftMessageRevealKey(messageId: string): string {
  return `message:${messageId}`;
}

export function resolveDisplayedDraftCharacterLimit(
  storedMaxCharacterLimit: number,
  fallbackCharacterLimit: number,
): number {
  return Math.max(storedMaxCharacterLimit, fallbackCharacterLimit);
}

export function buildDraftCharacterCounterMeta(
  text: string,
  maxCharacterLimit: number,
): DraftCounterMeta {
  const usedCharacterCount = computeXWeightedCharacterCount(text);
  const isOverLimit = usedCharacterCount > maxCharacterLimit;

  return {
    label: `${usedCharacterCount.toLocaleString()} / ${maxCharacterLimit.toLocaleString()} chars`,
    toneClassName: isOverLimit ? "text-red-400" : "text-zinc-500",
  };
}

export function getArtifactPosts(artifact: DraftArtifact | null | undefined): string[] {
  if (!artifact) {
    return [];
  }

  if (artifact.posts?.length) {
    return artifact.posts.map((post) => post.content);
  }

  return artifact.content ? [artifact.content] : [];
}

export function getThreadFramingStyle(
  artifact: DraftArtifact | null | undefined,
  fallbackContent?: string,
): ThreadFramingStyle {
  if (artifact?.threadFramingStyle) {
    return artifact.threadFramingStyle;
  }

  const posts = artifact
    ? getArtifactPosts(artifact)
    : fallbackContent
      ? splitThreadContent(fallbackContent)
      : [];

  return inferThreadFramingStyleFromPosts(posts);
}

export function getThreadFramingStyleLabel(
  style: ThreadFramingStyle | null | undefined,
): string {
  switch (style) {
    case "numbered":
      return "Numbered";
    case "soft_signal":
      return "Soft Intro";
    case "none":
    default:
      return "Natural";
  }
}

export function resolvePrimaryDraftRevealKey(message: DraftPreviewMessageLike): string {
  if (message.draftBundle?.options?.length) {
    const selectedOption =
      message.draftBundle.options.find(
        (option) =>
          option.id === message.draftBundle?.selectedOptionId ||
          option.versionId === message.activeDraftVersionId,
      ) ?? message.draftBundle.options[0];
    return buildDraftBundleRevealKey(selectedOption.id);
  }

  if (message.draftArtifacts?.[0]?.id) {
    return buildDraftArtifactRevealKey(message.draftArtifacts[0].id);
  }

  if (message.activeDraftVersionId) {
    return buildDraftVersionRevealKey(message.activeDraftVersionId);
  }

  if (message.draftVersions?.length) {
    return buildDraftVersionRevealKey(
      message.draftVersions[message.draftVersions.length - 1].id,
    );
  }

  return buildDraftMessageRevealKey(message.id);
}

export function resolveInlineDraftPreviewState(args: {
  message: DraftPreviewMessageLike;
  composerCharacterLimit: number;
  isVerifiedAccount: boolean;
  selectedThreadPreviewPostIndex?: number | null;
  expandedInlineThreadPreviewId: string | null;
  selectedDraftMessageId: string | null;
}): InlineDraftPreviewState {
  const draftBundle = normalizeDraftVersionBundle(
    args.message,
    args.composerCharacterLimit,
  );
  const previewArtifact =
    draftBundle?.activeVersion.artifact ?? args.message.draftArtifacts?.[0] ?? null;
  const previewDraft =
    draftBundle?.activeVersion.content ??
    args.message.draftArtifacts?.[0]?.content ??
    args.message.draft ??
    "";
  const previewPosts = previewArtifact
    ? getArtifactPosts(previewArtifact)
    : splitThreadContent(previewDraft);
  const isThreadPreview =
    previewArtifact?.kind === "thread_seed" ||
    args.message.outputShape === "thread_seed" ||
    previewPosts.length > 1;
  const threadFramingStyle = isThreadPreview
    ? getThreadFramingStyle(previewArtifact, previewDraft)
    : null;
  const selectedThreadPreviewPostIndex = isThreadPreview
    ? Math.max(
        0,
        Math.min(
          previewPosts.length - 1,
          args.selectedThreadPreviewPostIndex ?? 0,
        ),
      )
    : 0;
  const threadPostCharacterLimit = getThreadPostCharacterLimit(
    previewArtifact,
    getXCharacterLimitForAccount(args.isVerifiedAccount),
  );
  const threadPreviewPosts = isThreadPreview
    ? previewPosts.map((post, index) => ({
        content: post,
        originalIndex: index,
        weightedCharacterCount: computeXWeightedCharacterCount(post),
        maxCharacterLimit:
          previewArtifact?.posts[index]?.maxCharacterLimit ?? threadPostCharacterLimit,
      }))
    : [];
  const orderedThreadPreviewPosts = isThreadPreview
    ? [
        ...threadPreviewPosts.slice(selectedThreadPreviewPostIndex),
        ...threadPreviewPosts.slice(0, selectedThreadPreviewPostIndex),
      ]
    : [];
  const threadDeckPosts = isThreadPreview ? orderedThreadPreviewPosts.slice(0, 4) : [];
  const hiddenThreadPostCount = Math.max(
    0,
    threadPreviewPosts.length - threadDeckPosts.length,
  );
  const threadDeckHeight = 220 + Math.max(0, threadDeckPosts.length - 1) * 28;
  const isExpandedThreadPreview =
    isThreadPreview && args.expandedInlineThreadPreviewId === args.message.id;
  const draftCounter = buildDraftCharacterCounterMeta(
    previewDraft,
    resolveDisplayedDraftCharacterLimit(
      draftBundle?.activeVersion.maxCharacterLimit ?? args.composerCharacterLimit,
      args.composerCharacterLimit,
    ),
  );
  const isLongformPreview =
    !isThreadPreview &&
    (args.message.outputShape === "long_form_post" ||
      (draftBundle?.activeVersion.maxCharacterLimit ?? 280) > 280);
  const canToggleDraftFormat =
    !isThreadPreview && (args.isVerifiedAccount || isLongformPreview);
  const transformDraftPrompt = isLongformPreview
    ? "turn this into a shortform post under 280 characters"
    : "turn this into a longform post with more detail";
  const convertToThreadPrompt =
    `turn this into a thread with 4 to 6 posts. keep every post under ${threadPostCharacterLimit.toLocaleString()} characters, make the opener clearly signal the thread, and keep the flow native to x.`;
  const isFocusedDraftPreview = args.selectedDraftMessageId === args.message.id;
  const previewRevealKey = args.message.draftBundle?.selectedOptionId
    ? buildDraftBundleRevealKey(args.message.draftBundle.selectedOptionId)
    : previewArtifact?.id
      ? buildDraftArtifactRevealKey(previewArtifact.id)
      : draftBundle?.activeVersion.id
        ? buildDraftVersionRevealKey(draftBundle.activeVersion.id)
        : args.message.activeDraftVersionId
          ? buildDraftVersionRevealKey(args.message.activeDraftVersionId)
          : buildDraftMessageRevealKey(args.message.id);

  return {
    draftBundle,
    previewArtifact,
    previewDraft,
    threadPreviewPosts,
    isThreadPreview,
    threadFramingStyle,
    selectedThreadPreviewPostIndex,
    threadPostCharacterLimit,
    threadDeckPosts,
    hiddenThreadPostCount,
    threadDeckHeight,
    isExpandedThreadPreview,
    draftCounter,
    isLongformPreview,
    canToggleDraftFormat,
    transformDraftPrompt,
    convertToThreadPrompt,
    isFocusedDraftPreview,
    previewRevealKey,
  };
}
