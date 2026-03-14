import {
  buildDraftArtifact,
  computeXWeightedCharacterCount,
  type DraftArtifactDetails,
} from "../../../../lib/onboarding/draftArtifacts.ts";

import { buildEditableThreadPosts, ensureEditableThreadPosts, joinThreadPosts } from "./chatDraftEditorState.ts";
import { getDraftVersionSupportAsset, type ChatMessageLike, type DraftVersionEntryLike } from "./chatDraftSessionState.ts";

type DraftArtifact = DraftArtifactDetails;
type OutputShape =
  | "coach_question"
  | "ideation_angles"
  | "planning_outline"
  | "short_form_post"
  | "long_form_post"
  | "thread_seed"
  | "reply_candidate"
  | "quote_candidate";

export interface DraftBundleOptionLike {
  id: string;
  label: string;
  framing?: string;
  versionId: string;
  content: string;
  artifact: DraftArtifact;
}

export interface DraftBundleLike<TOption extends DraftBundleOptionLike = DraftBundleOptionLike> {
  kind?: "sibling_options";
  selectedOptionId: string;
  options: TOption[];
}

export interface DraftPersistenceMessageLike extends ChatMessageLike {
  draftBundle?: DraftBundleLike | null;
}

export interface DraftCollectionsResult {
  draft: string;
  drafts: string[];
  draftArtifacts: DraftArtifact[];
}

export interface DraftPromotionRequestBody {
  content: string;
  outputShape: OutputShape;
  supportAsset: string | null;
  maxCharacterLimit: number;
  posts?: string[];
  replyPlan?: string[];
  voiceTarget?: DraftArtifact["voiceTarget"];
  noveltyNotes?: string[];
  groundingSources?: DraftArtifact["groundingSources"];
  groundingMode?: DraftArtifact["groundingMode"];
  groundingExplanation?: DraftArtifact["groundingExplanation"];
  threadFramingStyle?: DraftArtifact["threadFramingStyle"];
  revisionChainId: string;
  basedOn: {
    messageId: string;
    versionId: string;
    content: string;
    source: DraftVersionEntryLike["source"];
    createdAt: string;
    maxCharacterLimit: number;
    revisionChainId: string;
  };
}

export interface DraftPromotionPreparationReady {
  status: "ready";
  nextContent: string;
  requestBody: DraftPromotionRequestBody;
}

export interface DraftPromotionPreparationSkip {
  status: "skip";
}

export type DraftPromotionPreparation =
  | DraftPromotionPreparationReady
  | DraftPromotionPreparationSkip;

export interface DraftVersionRevertUpdate<TBundle extends DraftBundleLike = DraftBundleLike> {
  nextContent: string;
  revisionChainId: string;
  nextDraftVersions: DraftVersionEntryLike[];
  nextDraftCollections: DraftCollectionsResult;
  nextDraftBundle: TBundle | null;
}

function resolveDraftArtifactKind(outputShape?: OutputShape): DraftArtifact["kind"] {
  switch (outputShape) {
    case "long_form_post":
    case "thread_seed":
    case "reply_candidate":
    case "quote_candidate":
    case "short_form_post":
      return outputShape;
    default:
      return "short_form_post";
  }
}

function buildDraftArtifactWithLimit(params: {
  id: string;
  title: string;
  kind: DraftArtifact["kind"];
  content: string;
  supportAsset: string | null;
  maxCharacterLimit: number;
  threadPostMaxCharacterLimit?: number;
  posts?: string[];
  replyPlan?: string[];
  voiceTarget?: DraftArtifact["voiceTarget"];
  noveltyNotes?: string[];
  groundingSources?: DraftArtifact["groundingSources"];
  groundingMode?: DraftArtifact["groundingMode"];
  groundingExplanation?: DraftArtifact["groundingExplanation"];
  threadFramingStyle?: DraftArtifact["threadFramingStyle"];
}): DraftArtifact {
  const artifact = buildDraftArtifact({
    id: params.id,
    title: params.title,
    kind: params.kind,
    content: params.content,
    supportAsset: params.supportAsset,
    ...(params.threadPostMaxCharacterLimit
      ? { threadPostMaxCharacterLimit: params.threadPostMaxCharacterLimit }
      : {}),
    ...(params.posts?.length ? { posts: params.posts } : {}),
    ...(params.replyPlan?.length ? { replyPlan: params.replyPlan } : {}),
    ...(params.voiceTarget ? { voiceTarget: params.voiceTarget } : {}),
    ...(params.noveltyNotes?.length ? { noveltyNotes: params.noveltyNotes } : {}),
    ...(params.groundingSources?.length ? { groundingSources: params.groundingSources } : {}),
    ...(params.groundingMode ? { groundingMode: params.groundingMode } : {}),
    ...(params.groundingExplanation ? { groundingExplanation: params.groundingExplanation } : {}),
    ...(params.threadFramingStyle
      ? { threadFramingStyle: params.threadFramingStyle }
      : {}),
  });

  if (artifact.maxCharacterLimit === params.maxCharacterLimit) {
    return artifact;
  }

  return {
    ...artifact,
    maxCharacterLimit: params.maxCharacterLimit,
    isWithinXLimit: artifact.weightedCharacterCount <= params.maxCharacterLimit,
  };
}

export function getThreadPostCharacterLimit(
  artifact: DraftArtifact | null | undefined,
  fallbackCharacterLimit: number,
): number {
  return artifact?.posts?.[0]?.maxCharacterLimit ?? fallbackCharacterLimit;
}

function replaceDraftVersionEntry(args: {
  versions: DraftVersionEntryLike[];
  versionId: string;
  content: string;
  artifact: DraftArtifact;
}): DraftVersionEntryLike[] {
  return args.versions.map((version) =>
    version.id === args.versionId
      ? {
          ...version,
          content: args.content,
          weightedCharacterCount: computeXWeightedCharacterCount(args.content),
          maxCharacterLimit: args.artifact.maxCharacterLimit,
          supportAsset: args.artifact.supportAsset ?? version.supportAsset,
          artifact: args.artifact,
        }
      : version,
  );
}

function buildDraftCollectionsFromVersions(args: {
  versions: DraftVersionEntryLike[];
  activeVersionId: string;
  fallbackDrafts?: string[];
  fallbackArtifacts?: DraftArtifact[];
}): DraftCollectionsResult {
  const activeVersion =
    args.versions.find((version) => version.id === args.activeVersionId) ??
    args.versions[args.versions.length - 1];
  const drafts = args.versions.map((version) => version.content).filter(Boolean);
  const draftArtifacts = args.versions
    .map((version) => version.artifact)
    .filter((artifact): artifact is DraftArtifact => Boolean(artifact));

  return {
    draft: activeVersion?.content ?? args.fallbackDrafts?.[0] ?? "",
    drafts: drafts.length > 0 ? drafts : args.fallbackDrafts ?? [],
    draftArtifacts: draftArtifacts.length > 0 ? draftArtifacts : args.fallbackArtifacts ?? [],
  };
}

function syncDraftBundleSelection<TBundle extends DraftBundleLike>(args: {
  draftBundle: TBundle | null | undefined;
  versionId: string;
  content: string;
  artifact: DraftArtifact;
}): TBundle | null {
  if (!args.draftBundle) {
    return null;
  }

  const selectedOption =
    args.draftBundle.options.find((option) => option.versionId === args.versionId) ?? null;

  return {
    ...args.draftBundle,
    selectedOptionId: selectedOption?.id ?? args.draftBundle.selectedOptionId,
    options: args.draftBundle.options.map((option) =>
      option.versionId === args.versionId
        ? {
            ...option,
            content: args.content,
            artifact: args.artifact,
          }
        : option,
    ),
  };
}

export function prepareDraftPromotionRequest(args: {
  activeDraftEditorRevisionChainId?: string | null;
  selectedDraftMessage: DraftPersistenceMessageLike;
  selectedDraftVersion: DraftVersionEntryLike;
  selectedDraftArtifact: DraftArtifact | null | undefined;
  isSelectedDraftThread: boolean;
  editorDraftPosts: string[];
  editorDraftText: string;
}): DraftPromotionPreparation {
  const nextPosts = args.isSelectedDraftThread
    ? ensureEditableThreadPosts(args.editorDraftPosts)
        .map((post) => post.trim())
        .filter(Boolean)
    : [];
  const nextContent = (args.isSelectedDraftThread
    ? joinThreadPosts(nextPosts)
    : args.editorDraftText).trim();

  if (!nextContent || nextContent === args.selectedDraftVersion.content.trim()) {
    return {
      status: "skip",
    };
  }

  const revisionChainId =
    args.selectedDraftMessage.revisionChainId ||
    args.activeDraftEditorRevisionChainId ||
    `revision-chain-${args.selectedDraftMessage.id}`;

  return {
    status: "ready",
    nextContent,
    requestBody: {
      content: nextContent,
      outputShape: args.selectedDraftMessage.outputShape ?? "short_form_post",
      supportAsset:
        args.selectedDraftVersion.supportAsset ??
        getDraftVersionSupportAsset(args.selectedDraftMessage),
      maxCharacterLimit: args.selectedDraftVersion.maxCharacterLimit,
      ...(nextPosts.length ? { posts: nextPosts } : {}),
      ...(args.selectedDraftArtifact?.replyPlan?.length
        ? { replyPlan: args.selectedDraftArtifact.replyPlan }
        : {}),
      ...(args.selectedDraftArtifact?.voiceTarget
        ? { voiceTarget: args.selectedDraftArtifact.voiceTarget }
        : {}),
      ...(args.selectedDraftArtifact?.noveltyNotes?.length
        ? { noveltyNotes: args.selectedDraftArtifact.noveltyNotes }
        : {}),
      ...(args.selectedDraftArtifact?.groundingSources?.length
        ? { groundingSources: args.selectedDraftArtifact.groundingSources }
        : {}),
      ...(args.selectedDraftArtifact?.groundingMode
        ? { groundingMode: args.selectedDraftArtifact.groundingMode }
        : {}),
      ...(args.selectedDraftArtifact?.groundingExplanation
        ? { groundingExplanation: args.selectedDraftArtifact.groundingExplanation }
        : {}),
      ...(args.selectedDraftArtifact?.threadFramingStyle
        ? { threadFramingStyle: args.selectedDraftArtifact.threadFramingStyle }
        : {}),
      revisionChainId,
      basedOn: {
        messageId: args.selectedDraftMessage.id,
        versionId: args.selectedDraftVersion.id,
        content: args.selectedDraftVersion.content,
        source: args.selectedDraftVersion.source,
        createdAt: args.selectedDraftVersion.createdAt,
        maxCharacterLimit: args.selectedDraftVersion.maxCharacterLimit,
        revisionChainId,
      },
    },
  };
}

export function resolveDraftVersionRevertUpdate<TBundle extends DraftBundleLike>(args: {
  activeDraftEditorRevisionChainId?: string | null;
  selectedDraftMessage: DraftPersistenceMessageLike & { draftBundle?: TBundle | null };
  selectedDraftVersion: DraftVersionEntryLike;
  selectedDraftBundleVersions?: DraftVersionEntryLike[] | null;
  isSelectedDraftThread: boolean;
  fallbackCharacterLimit: number;
}): DraftVersionRevertUpdate<TBundle> | null {
  const nextContent = args.selectedDraftVersion.content.trim();
  if (!nextContent) {
    return null;
  }

  const revisionChainId =
    args.selectedDraftMessage.revisionChainId ??
    args.activeDraftEditorRevisionChainId ??
    `revision-chain-${args.selectedDraftMessage.id}`;
  const nextVersions =
    args.selectedDraftMessage.draftVersions && args.selectedDraftMessage.draftVersions.length > 0
      ? args.selectedDraftMessage.draftVersions
      : args.selectedDraftBundleVersions?.length
        ? args.selectedDraftBundleVersions
        : [args.selectedDraftVersion];
  const sourceArtifact =
    args.selectedDraftVersion.artifact ?? args.selectedDraftMessage.draftArtifacts?.[0];
  const restoredPosts =
    args.isSelectedDraftThread || sourceArtifact?.kind === "thread_seed"
      ? buildEditableThreadPosts(sourceArtifact, nextContent)
      : [];
  const threadPostMaxCharacterLimit = getThreadPostCharacterLimit(
    sourceArtifact,
    args.fallbackCharacterLimit,
  );
  const activeDraftArtifact = buildDraftArtifactWithLimit({
    id: sourceArtifact?.id ?? `${args.selectedDraftMessage.id}-${args.selectedDraftVersion.id}`,
    title: sourceArtifact?.title ?? "Draft",
    kind:
      sourceArtifact?.kind ?? resolveDraftArtifactKind(args.selectedDraftMessage.outputShape),
    content: nextContent,
    supportAsset:
      args.selectedDraftVersion.supportAsset ??
      getDraftVersionSupportAsset(args.selectedDraftMessage),
    maxCharacterLimit: args.selectedDraftVersion.maxCharacterLimit,
    ...(sourceArtifact?.kind === "thread_seed" || args.isSelectedDraftThread
      ? { threadPostMaxCharacterLimit }
      : {}),
    ...(restoredPosts.length ? { posts: restoredPosts } : {}),
    ...(sourceArtifact?.replyPlan?.length ? { replyPlan: sourceArtifact.replyPlan } : {}),
    ...(sourceArtifact?.voiceTarget ? { voiceTarget: sourceArtifact.voiceTarget } : {}),
    ...(sourceArtifact?.noveltyNotes?.length ? { noveltyNotes: sourceArtifact.noveltyNotes } : {}),
    ...(sourceArtifact?.groundingSources?.length
      ? { groundingSources: sourceArtifact.groundingSources }
      : {}),
    ...(sourceArtifact?.groundingMode ? { groundingMode: sourceArtifact.groundingMode } : {}),
    ...(sourceArtifact?.groundingExplanation
      ? { groundingExplanation: sourceArtifact.groundingExplanation }
      : {}),
    ...(sourceArtifact?.threadFramingStyle
      ? { threadFramingStyle: sourceArtifact.threadFramingStyle }
      : {}),
  });
  const nextDraftVersions = replaceDraftVersionEntry({
    versions: nextVersions,
    versionId: args.selectedDraftVersion.id,
    content: nextContent,
    artifact: activeDraftArtifact,
  });
  const nextDraftCollections = buildDraftCollectionsFromVersions({
    versions: nextDraftVersions,
    activeVersionId: args.selectedDraftVersion.id,
    fallbackDrafts: args.selectedDraftMessage.drafts,
    fallbackArtifacts: args.selectedDraftMessage.draftArtifacts,
  });
  const nextDraftBundle = syncDraftBundleSelection({
    draftBundle: args.selectedDraftMessage.draftBundle,
    versionId: args.selectedDraftVersion.id,
    content: nextContent,
    artifact: activeDraftArtifact,
  });

  return {
    nextContent,
    revisionChainId,
    nextDraftVersions,
    nextDraftCollections,
    nextDraftBundle,
  };
}
