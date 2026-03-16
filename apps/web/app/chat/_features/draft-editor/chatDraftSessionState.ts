import { computeXWeightedCharacterCount } from "../../../../lib/onboarding/draftArtifacts.ts";
import type { DraftArtifactDetails } from "../../../../lib/onboarding/draftArtifacts.ts";

type DraftArtifact = DraftArtifactDetails;
type DraftVersionSource = "assistant_generated" | "assistant_revision" | "manual_save";
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

export interface DraftDrawerSelectionLike {
  messageId: string;
  versionId: string;
  revisionChainId?: string;
}

export interface DraftVersionEntryLike {
  id: string;
  content: string;
  source: DraftVersionSource;
  createdAt: string;
  basedOnVersionId: string | null;
  weightedCharacterCount: number;
  maxCharacterLimit: number;
  supportAsset: string | null;
  artifact?: DraftArtifact;
}

export interface DraftVersionSnapshotLike {
  messageId: string;
  versionId: string;
  content: string;
  source: DraftVersionSource;
  createdAt: string;
  maxCharacterLimit?: number;
  revisionChainId?: string;
}

export interface DraftTimelineEntryLike {
  messageId: string;
  versionId: string;
  content: string;
  createdAt: string;
  source: DraftVersionSource;
  revisionChainId: string;
  maxCharacterLimit: number;
  isCurrentMessageVersion: boolean;
}

export interface ChatMessageLike {
  id: string;
  role: "assistant" | "user";
  createdAt?: string;
  draft?: string | null;
  drafts?: string[];
  draftArtifacts?: DraftArtifact[];
  draftVersions?: DraftVersionEntryLike[];
  activeDraftVersionId?: string;
  previousVersionSnapshot?: DraftVersionSnapshotLike | null;
  revisionChainId?: string;
  supportAsset?: string | null;
  outputShape?: OutputShape;
}

export interface DraftVersionBundleLike {
  versions: DraftVersionEntryLike[];
  activeVersionId: string;
  activeVersion: DraftVersionEntryLike;
  previousSnapshot: DraftVersionSnapshotLike | null;
}

export interface DraftTimelineState<TEntry extends DraftTimelineEntryLike> {
  selectedDraftTimelineIndex: number;
  selectedDraftTimelinePosition: number;
  latestDraftTimelineEntry: TEntry | null;
  canNavigateDraftBack: boolean;
  canNavigateDraftForward: boolean;
  isViewingHistoricalDraftVersion: boolean;
  hasDraftEditorChanges: boolean;
  shouldShowRevertDraftCta: boolean;
}

export interface DraftTimelineNavigationResult {
  targetSelection: DraftDrawerSelectionLike;
  scrollToMessageId: string | null;
}

export interface OpenDraftEditorResult {
  selection: DraftDrawerSelectionLike;
  shouldExpandInlineThreadPreview: boolean;
  selectedThreadPostIndex: number;
}

export function getDraftVersionSupportAsset(message: ChatMessageLike): string | null {
  return message.supportAsset ?? message.draftArtifacts?.[0]?.supportAsset ?? null;
}

export function normalizeDraftVersionBundle(
  message: ChatMessageLike,
  fallbackCharacterLimit: number,
): DraftVersionBundleLike | null {
  const supportAsset = getDraftVersionSupportAsset(message);
  const rawVersions =
    message.draftVersions?.length
      ? message.draftVersions
      : (() => {
          const fallbackContent =
            message.draft ?? message.drafts?.[0] ?? message.draftArtifacts?.[0]?.content ?? null;

          if (!fallbackContent) {
            return [];
          }

          return [
            {
              id: `${message.id}-v1`,
              content: fallbackContent,
              source: "assistant_generated" as const,
              createdAt: message.createdAt ?? new Date(0).toISOString(),
              basedOnVersionId: null,
              weightedCharacterCount: computeXWeightedCharacterCount(fallbackContent),
              maxCharacterLimit:
                message.draftArtifacts?.[0]?.maxCharacterLimit ?? fallbackCharacterLimit,
              supportAsset,
              artifact: message.draftArtifacts?.[0],
            },
          ];
        })();

  if (!rawVersions.length) {
    return null;
  }

  const mappedVersions = rawVersions.map((version) => {
    const content = typeof version.content === "string" ? version.content : "";
    const artifact = version.artifact;
    const maxCharacterLimit =
      typeof version.maxCharacterLimit === "number" && version.maxCharacterLimit > 0
        ? version.maxCharacterLimit
        : artifact?.maxCharacterLimit ??
          message.draftArtifacts?.[0]?.maxCharacterLimit ??
          fallbackCharacterLimit;

    return {
      id: version.id,
      content,
      source: version.source,
      createdAt: version.createdAt,
      basedOnVersionId: version.basedOnVersionId ?? null,
      weightedCharacterCount: computeXWeightedCharacterCount(content),
      maxCharacterLimit,
      supportAsset: version.supportAsset ?? supportAsset,
      artifact,
    };
  });

  const activeVersionId =
    message.activeDraftVersionId &&
    mappedVersions.some((version) => version.id === message.activeDraftVersionId)
      ? message.activeDraftVersionId
      : mappedVersions[mappedVersions.length - 1].id;
  const activeVersionIndex = mappedVersions.findIndex(
    (version) => version.id === activeVersionId,
  );
  const versions =
    activeVersionIndex >= 0 && activeVersionIndex < mappedVersions.length - 1
      ? [
          ...mappedVersions.slice(0, activeVersionIndex),
          ...mappedVersions.slice(activeVersionIndex + 1),
          mappedVersions[activeVersionIndex],
        ]
      : mappedVersions;
  const currentVersionIndex = Math.max(
    0,
    versions.findIndex((version) => version.id === activeVersionId),
  );
  const activeVersion = versions[currentVersionIndex];
  const inferredPreviousVersion =
    (activeVersion.basedOnVersionId
      ? versions.find((version) => version.id === activeVersion.basedOnVersionId) ?? null
      : null) ?? (currentVersionIndex > 0 ? versions[currentVersionIndex - 1] : null);
  const previousSnapshot = message.previousVersionSnapshot
    ? message.previousVersionSnapshot
    : inferredPreviousVersion
      ? {
          messageId: message.id,
          versionId: inferredPreviousVersion.id,
          content: inferredPreviousVersion.content,
          source: inferredPreviousVersion.source,
          createdAt: inferredPreviousVersion.createdAt,
        }
      : null;

  return {
    versions,
    activeVersionId,
    activeVersion,
    previousSnapshot,
  };
}

export function buildDraftRevisionTimeline(args: {
  messages: ChatMessageLike[];
  activeDraftSelection: DraftDrawerSelectionLike | null;
  fallbackCharacterLimit: number;
}): DraftTimelineEntryLike[] {
  if (!args.activeDraftSelection) {
    return [];
  }

  const selectedMessage =
    args.messages.find((message) => message.id === args.activeDraftSelection?.messageId) ?? null;
  if (!selectedMessage) {
    return [];
  }

  const selectedBundle = normalizeDraftVersionBundle(
    selectedMessage,
    args.fallbackCharacterLimit,
  );
  if (!selectedBundle) {
    return [];
  }

  const resolvedChainId =
    args.activeDraftSelection.revisionChainId?.trim() ||
    selectedMessage.revisionChainId?.trim() ||
    selectedMessage.previousVersionSnapshot?.revisionChainId?.trim() ||
    `legacy-chain-${selectedMessage.id}`;

  const chainedEntries = resolvedChainId
    ? args.messages
        .filter(
          (message) =>
            message.role === "assistant" &&
            typeof message.revisionChainId === "string" &&
            message.revisionChainId.trim() === resolvedChainId,
        )
        .sort((left, right) => (left.createdAt ?? "").localeCompare(right.createdAt ?? ""))
        .flatMap((message) => {
          const bundle = normalizeDraftVersionBundle(message, args.fallbackCharacterLimit);
          if (!bundle) {
            return [];
          }

          return bundle.versions.map((version) => ({
            messageId: message.id,
            versionId: version.id,
            content: version.content,
            createdAt: version.createdAt,
            source: version.source,
            revisionChainId: resolvedChainId,
            maxCharacterLimit: version.maxCharacterLimit,
            isCurrentMessageVersion: message.id === selectedMessage.id,
          }));
        })
    : [];

  if (chainedEntries.length > 0) {
    const selectedMessageEntries = chainedEntries.some(
      (entry) => entry.messageId === selectedMessage.id,
    )
      ? []
      : selectedBundle.versions.map((version) => ({
          messageId: selectedMessage.id,
          versionId: version.id,
          content: version.content,
          createdAt: version.createdAt,
          source: version.source,
          revisionChainId: resolvedChainId,
          maxCharacterLimit: version.maxCharacterLimit,
          isCurrentMessageVersion: true,
        }));
    const combinedEntries = [...selectedMessageEntries, ...chainedEntries].sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt),
    );
    const previousSnapshot = selectedBundle.previousSnapshot;
    if (!previousSnapshot) {
      return combinedEntries;
    }

    const snapshotAlreadyPresent = combinedEntries.some(
      (entry) =>
        entry.messageId === previousSnapshot.messageId &&
        entry.versionId === previousSnapshot.versionId,
    );
    if (snapshotAlreadyPresent) {
      return combinedEntries;
    }

    return [
      {
        messageId: previousSnapshot.messageId,
        versionId: previousSnapshot.versionId,
        content: previousSnapshot.content,
        createdAt: previousSnapshot.createdAt,
        source: previousSnapshot.source,
        revisionChainId: previousSnapshot.revisionChainId?.trim() || resolvedChainId,
        maxCharacterLimit:
          previousSnapshot.maxCharacterLimit ?? selectedBundle.activeVersion.maxCharacterLimit,
        isCurrentMessageVersion: previousSnapshot.messageId === selectedMessage.id,
      },
      ...combinedEntries,
    ];
  }

  const legacyChainSourceId =
    args.activeDraftSelection.revisionChainId?.startsWith("legacy-chain-")
      ? args.activeDraftSelection.revisionChainId.slice("legacy-chain-".length)
      : "";
  const legacyChainSource =
    legacyChainSourceId && legacyChainSourceId !== selectedMessage.id
      ? args.messages.find((message) => message.id === legacyChainSourceId) ?? null
      : null;

  if (legacyChainSource) {
    const legacySourceBundle = normalizeDraftVersionBundle(
      legacyChainSource,
      args.fallbackCharacterLimit,
    );
    if (legacySourceBundle) {
      const currentEntries = selectedBundle.versions.map((version) => ({
        messageId: selectedMessage.id,
        versionId: version.id,
        content: version.content,
        createdAt: version.createdAt,
        source: version.source,
        revisionChainId: resolvedChainId,
        maxCharacterLimit: version.maxCharacterLimit,
        isCurrentMessageVersion: true,
      }));
      const anchorEntries = legacySourceBundle.versions.map((version) => ({
        messageId: legacyChainSource.id,
        versionId: version.id,
        content: version.content,
        createdAt: version.createdAt,
        source: version.source,
        revisionChainId: resolvedChainId,
        maxCharacterLimit: version.maxCharacterLimit,
        isCurrentMessageVersion: false,
      }));

      return [...currentEntries, ...anchorEntries].sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt),
      );
    }
  }

  const fallbackEntries = selectedBundle.versions.map((version) => ({
    messageId: selectedMessage.id,
    versionId: version.id,
    content: version.content,
    createdAt: version.createdAt,
    source: version.source,
    revisionChainId: resolvedChainId,
    maxCharacterLimit: version.maxCharacterLimit,
    isCurrentMessageVersion: true,
  }));
  const previousSnapshot = selectedBundle.previousSnapshot;

  if (!previousSnapshot) {
    return fallbackEntries;
  }

  const snapshotAlreadyPresent = fallbackEntries.some(
    (entry) =>
      entry.messageId === previousSnapshot.messageId &&
      entry.versionId === previousSnapshot.versionId,
  );
  if (snapshotAlreadyPresent) {
    return fallbackEntries;
  }

  return [
    {
      messageId: previousSnapshot.messageId,
      versionId: previousSnapshot.versionId,
      content: previousSnapshot.content,
      createdAt: previousSnapshot.createdAt,
      source: previousSnapshot.source,
      revisionChainId: previousSnapshot.revisionChainId?.trim() || resolvedChainId,
      maxCharacterLimit:
        previousSnapshot.maxCharacterLimit ?? selectedBundle.activeVersion.maxCharacterLimit,
      isCurrentMessageVersion: previousSnapshot.messageId === selectedMessage.id,
    },
    ...fallbackEntries,
  ];
}

export function resolveDraftTimelineState<TEntry extends DraftTimelineEntryLike>(args: {
  timeline: TEntry[];
  activeDraftSelection: DraftDrawerSelectionLike | null;
  serializedContent: string;
  selectedDraftVersionContent: string | null;
}): DraftTimelineState<TEntry> {
  const selectedDraftTimelineIndex = args.timeline.findIndex(
    (entry) =>
      entry.messageId === args.activeDraftSelection?.messageId &&
      entry.versionId === args.activeDraftSelection?.versionId,
  );
  const latestDraftTimelineEntry =
    args.timeline.length > 0 ? args.timeline[args.timeline.length - 1] : null;
  const isViewingHistoricalDraftVersion =
    selectedDraftTimelineIndex >= 0 &&
    selectedDraftTimelineIndex < args.timeline.length - 1;
  const hasDraftEditorChanges =
    args.selectedDraftVersionContent !== null &&
    args.serializedContent.trim().length > 0 &&
    args.serializedContent.trim() !== args.selectedDraftVersionContent.trim();

  return {
    selectedDraftTimelineIndex,
    selectedDraftTimelinePosition:
      selectedDraftTimelineIndex >= 0 ? selectedDraftTimelineIndex + 1 : 0,
    latestDraftTimelineEntry,
    canNavigateDraftBack: selectedDraftTimelineIndex > 0,
    canNavigateDraftForward:
      selectedDraftTimelineIndex >= 0 &&
      selectedDraftTimelineIndex < args.timeline.length - 1,
    isViewingHistoricalDraftVersion,
    hasDraftEditorChanges,
    shouldShowRevertDraftCta: isViewingHistoricalDraftVersion && !hasDraftEditorChanges,
  };
}

export function resolveDraftTimelineNavigation(args: {
  direction: "back" | "forward";
  timeline: DraftTimelineEntryLike[];
  selectedDraftTimelineIndex: number;
  activeDraftSelection: DraftDrawerSelectionLike | null;
}): DraftTimelineNavigationResult | null {
  if (args.selectedDraftTimelineIndex < 0) {
    return null;
  }

  const targetIndex =
    args.direction === "back"
      ? args.selectedDraftTimelineIndex - 1
      : args.selectedDraftTimelineIndex + 1;
  const targetEntry = args.timeline[targetIndex];
  if (!targetEntry) {
    return null;
  }

  return {
    targetSelection: {
      messageId: targetEntry.messageId,
      versionId: targetEntry.versionId,
      revisionChainId: targetEntry.revisionChainId,
    },
    scrollToMessageId:
      targetEntry.messageId !== args.activeDraftSelection?.messageId
        ? targetEntry.messageId
        : null,
  };
}

export function resolveOpenDraftEditorState(args: {
  message: ChatMessageLike | null;
  fallbackCharacterLimit: number;
  versionId?: string;
  threadPostIndex?: number;
}): OpenDraftEditorResult | null {
  if (!args.message) {
    return null;
  }

  const bundle = normalizeDraftVersionBundle(args.message, args.fallbackCharacterLimit);
  if (!bundle) {
    return null;
  }

  const selectedArtifact = bundle.activeVersion.artifact ?? args.message.draftArtifacts?.[0] ?? null;
  const isThreadDraft =
    selectedArtifact?.kind === "thread_seed" || args.message.outputShape === "thread_seed";

  return {
    selection: {
      messageId: args.message.id,
      versionId:
        args.versionId && bundle.versions.some((version) => version.id === args.versionId)
          ? args.versionId
          : bundle.activeVersionId,
      revisionChainId: args.message.revisionChainId ?? undefined,
    },
    shouldExpandInlineThreadPreview: isThreadDraft,
    selectedThreadPostIndex:
      typeof args.threadPostIndex === "number" && Number.isFinite(args.threadPostIndex)
        ? Math.max(0, args.threadPostIndex)
        : 0,
  };
}
