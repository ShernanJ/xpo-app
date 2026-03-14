import type { ThreadFramingStyle } from "../../../../lib/onboarding/draftArtifacts.ts";

import { getThreadFramingStyle } from "./chatDraftPreviewState.ts";
import {
  normalizeDraftVersionBundle,
  type ChatMessageLike,
  type DraftVersionEntryLike,
  type DraftVersionSnapshotLike,
} from "./chatDraftSessionState.ts";

export type DraftActionMessageLike = ChatMessageLike;

export interface DraftEditActionPlan {
  activeDraftEditor: {
    messageId: string;
    versionId: string;
    revisionChainId: string;
  };
  request: {
    prompt: string;
    appendUserMessage: true;
    turnSource: "draft_action";
    artifactContext: {
      kind: "draft_selection";
      action: "edit";
      selectedDraftContext: DraftVersionSnapshotLike;
    };
    intent: "edit";
    selectedDraftContextOverride: DraftVersionSnapshotLike;
    threadFramingStyleOverride?: ThreadFramingStyle | null;
  };
}

function buildThreadFramingRevisionPrompt(style: ThreadFramingStyle): string {
  switch (style) {
    case "numbered":
      return "keep the same thread but make the framing explicitly numbered with x/x in each post.";
    case "soft_signal":
      return "keep the same thread but make the opener clearly signal the thread in a natural way without x/x numbering.";
    case "none":
    default:
      return "keep the same thread but remove thread numbering and make the flow feel natural without explicit thread labels.";
  }
}

function buildDraftSelectionContext(args: {
  messageId: string;
  version: DraftVersionEntryLike;
  revisionChainId: string;
}): DraftVersionSnapshotLike {
  return {
    messageId: args.messageId,
    versionId: args.version.id,
    content: args.version.content,
    source: args.version.source,
    createdAt: args.version.createdAt,
    maxCharacterLimit: args.version.maxCharacterLimit,
    revisionChainId: args.revisionChainId,
  };
}

function buildDraftEditActionPlan(args: {
  messageId: string;
  version: DraftVersionEntryLike;
  revisionChainId: string;
  prompt: string;
  threadFramingStyleOverride?: ThreadFramingStyle | null;
}): DraftEditActionPlan {
  const selectedDraftContext = buildDraftSelectionContext({
    messageId: args.messageId,
    version: args.version,
    revisionChainId: args.revisionChainId,
  });

  return {
    activeDraftEditor: {
      messageId: args.messageId,
      versionId: args.version.id,
      revisionChainId: args.revisionChainId,
    },
    request: {
      prompt: args.prompt,
      appendUserMessage: true,
      turnSource: "draft_action",
      artifactContext: {
        kind: "draft_selection",
        action: "edit",
        selectedDraftContext,
      },
      intent: "edit",
      selectedDraftContextOverride: selectedDraftContext,
      ...(args.threadFramingStyleOverride !== undefined
        ? { threadFramingStyleOverride: args.threadFramingStyleOverride }
        : {}),
    },
  };
}

export function resolveDraftCardRevisionAction(args: {
  messageId: string;
  prompt: string;
  messages: DraftActionMessageLike[];
  composerCharacterLimit: number;
  threadFramingStyleOverride?: ThreadFramingStyle | null;
}): DraftEditActionPlan | null {
  const message = args.messages.find((item) => item.id === args.messageId);
  if (!message) {
    return null;
  }

  const bundle = normalizeDraftVersionBundle(message, args.composerCharacterLimit);
  if (!bundle) {
    return null;
  }

  const selectedVersion = bundle.activeVersion;
  const currentThreadFramingStyle =
    bundle.activeVersion.artifact?.kind === "thread_seed" ||
    message.outputShape === "thread_seed"
      ? getThreadFramingStyle(
          bundle.activeVersion.artifact ?? message.draftArtifacts?.[0],
          bundle.activeVersion.content,
        )
      : null;
  const revisionChainId =
    message.revisionChainId ??
    message.previousVersionSnapshot?.revisionChainId ??
    `legacy-chain-${args.messageId}`;

  return buildDraftEditActionPlan({
    messageId: args.messageId,
    version: selectedVersion,
    revisionChainId,
    prompt: args.prompt,
    ...(args.threadFramingStyleOverride || currentThreadFramingStyle
      ? {
          threadFramingStyleOverride:
            args.threadFramingStyleOverride ?? currentThreadFramingStyle,
        }
      : {}),
  });
}

export function resolveSelectedThreadFramingChangeAction(args: {
  selectedDraftMessage: DraftActionMessageLike | null;
  selectedDraftVersion: DraftVersionEntryLike | null;
  selectedDraftThreadFramingStyle: ThreadFramingStyle | null;
  nextStyle: ThreadFramingStyle;
}): DraftEditActionPlan | null {
  if (
    !args.selectedDraftMessage ||
    !args.selectedDraftVersion ||
    !args.selectedDraftThreadFramingStyle ||
    args.selectedDraftThreadFramingStyle === args.nextStyle
  ) {
    return null;
  }

  const revisionChainId =
    args.selectedDraftMessage.revisionChainId ??
    args.selectedDraftMessage.previousVersionSnapshot?.revisionChainId ??
    `revision-chain-${args.selectedDraftMessage.id}`;

  return buildDraftEditActionPlan({
    messageId: args.selectedDraftMessage.id,
    version: args.selectedDraftVersion,
    revisionChainId,
    prompt: buildThreadFramingRevisionPrompt(args.nextStyle),
    threadFramingStyleOverride: args.nextStyle,
  });
}
