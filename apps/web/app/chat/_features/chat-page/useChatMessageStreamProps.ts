"use client";

import type { ComponentProps } from "react";

import type { SelectedAngleFormatHint } from "@/lib/agent-v2/contracts/turnContract";
import type { AgentProgressRun } from "@/lib/chat/agentProgress";
import type { ThreadFramingStyle } from "@/lib/onboarding/draftArtifacts";

import { MessageArtifactSections } from "../thread-history/MessageArtifactSections";
import type {
  ChatMessageStreamMessage,
  ChatMessageStreamProps,
} from "../thread-history/ChatMessageStream";

type ArtifactSectionProps = ComponentProps<typeof MessageArtifactSections>;
type ContextIdentity = ArtifactSectionProps["contextIdentity"];

export interface UseChatMessageStreamPropsOptions<TMessage extends ChatMessageStreamMessage> {
  isVisible: boolean;
  messages: TMessage[];
  latestAssistantMessageId: string | null;
  typedAssistantLengths: Record<string, number>;
  registerMessageRef: ChatMessageStreamProps<TMessage>["registerMessageRef"];
  activeDraftRevealByMessageId: Record<string, string>;
  activeAgentProgress: AgentProgressRun | null;
  composerCharacterLimit: number;
  isVerifiedAccount: boolean;
  isMainChatLocked: boolean;
  showDevTools: boolean;
  selectedDraftMessageId: string | null;
  selectedDraftVersionId: string | null;
  selectedThreadPostByMessageId: Record<string, number>;
  expandedInlineThreadPreviewId: string | null;
  copiedPreviewDraftMessageId: string | null;
  dismissedAutoSavedSourceByMessageId: Record<string, boolean>;
  autoSavedSourceUndoPendingByMessageId: Record<string, boolean>;
  messageFeedbackPendingById: Record<string, boolean>;
  canRunReplyActions: boolean;
  contextIdentity: ContextIdentity;
  shouldShowQuickReplies: ArtifactSectionProps["shouldShowQuickReplies"];
  shouldShowOptionArtifacts: ArtifactSectionProps["shouldShowOptionArtifacts"];
  shouldShowDraftOutput: ArtifactSectionProps["shouldShowDraftOutput"];
  onOpenSourceMaterialEditor: ArtifactSectionProps["onOpenSourceMaterialEditor"];
  onUndoAutoSavedSourceMaterials: (
    messageId: string,
    autoSavedSourceMaterials: NonNullable<TMessage["autoSavedSourceMaterials"]>,
  ) => void;
  onSubmitAssistantMessageFeedback: (messageId: string, value: "up" | "down") => void;
  onQuickReplySelect: ArtifactSectionProps["onQuickReplySelect"];
  onAngleSelect: (title: string, selectedAngleFormatHint: SelectedAngleFormatHint) => void;
  onReplyOptionSelect: (optionIndex: number) => void;
  onSelectDraftBundleOption: (messageId: string, optionId: string, versionId: string) => void;
  onOpenDraftEditor: (messageId: string, versionId?: string, threadPostIndex?: number) => void;
  onRequestDraftCardRevision: (
    messageId: string,
    prompt: string,
    threadFramingStyleOverride?: ThreadFramingStyle | null,
  ) => void;
  onToggleExpandedInlineThreadPreview: (messageId: string) => void;
  onCopyPreviewDraft: (messageId: string, content: string) => void;
  onShareDraftEditor: () => void;
}

export function useChatMessageStreamProps<TMessage extends ChatMessageStreamMessage>(
  options: UseChatMessageStreamPropsOptions<TMessage>,
): ChatMessageStreamProps<TMessage> | null {
  if (!options.isVisible) {
    return null;
  }

  return {
    messages: options.messages,
    latestAssistantMessageId: options.latestAssistantMessageId,
    typedAssistantLengths: options.typedAssistantLengths,
    registerMessageRef: options.registerMessageRef,
    activeDraftRevealByMessageId: options.activeDraftRevealByMessageId,
    activeAgentProgress: options.activeAgentProgress,
    resolveArtifactSectionProps: (message) => ({
      composerCharacterLimit: options.composerCharacterLimit,
      isVerifiedAccount: options.isVerifiedAccount,
      isMainChatLocked: options.isMainChatLocked,
      showDevTools: options.showDevTools,
      selectedDraftMessageId: options.selectedDraftMessageId,
      selectedDraftVersionId: options.selectedDraftVersionId,
      selectedThreadPreviewPostIndex:
        options.selectedThreadPostByMessageId[message.id],
      expandedInlineThreadPreviewId: options.expandedInlineThreadPreviewId,
      copiedPreviewDraftMessageId: options.copiedPreviewDraftMessageId,
      dismissedAutoSavedSource: Boolean(
        options.dismissedAutoSavedSourceByMessageId[message.id],
      ),
      autoSavedSourceUndoPending: Boolean(
        options.autoSavedSourceUndoPendingByMessageId[message.id],
      ),
      messageFeedbackPending: Boolean(
        options.messageFeedbackPendingById[message.id],
      ),
      canRunReplyActions: options.canRunReplyActions,
      contextIdentity: options.contextIdentity,
      shouldShowQuickReplies: options.shouldShowQuickReplies,
      shouldShowOptionArtifacts: options.shouldShowOptionArtifacts,
      shouldShowDraftOutput: options.shouldShowDraftOutput,
      onOpenSourceMaterialEditor: options.onOpenSourceMaterialEditor,
      onUndoAutoSavedSourceMaterials: () => {
        if (!message.autoSavedSourceMaterials) {
          return;
        }

        options.onUndoAutoSavedSourceMaterials(
          message.id,
          message.autoSavedSourceMaterials,
        );
      },
      onSubmitAssistantMessageFeedback: (value) => {
        options.onSubmitAssistantMessageFeedback(message.id, value);
      },
      onQuickReplySelect: options.onQuickReplySelect,
      onAngleSelect: options.onAngleSelect,
      onReplyOptionSelect: options.onReplyOptionSelect,
      onSelectDraftBundleOption: (optionId, versionId) => {
        options.onSelectDraftBundleOption(message.id, optionId, versionId);
      },
      onOpenDraftEditor: (versionId, threadPostIndex) => {
        options.onOpenDraftEditor(message.id, versionId, threadPostIndex);
      },
      onRequestDraftCardRevision: (prompt, threadFramingStyleOverride) => {
        options.onRequestDraftCardRevision(
          message.id,
          prompt,
          threadFramingStyleOverride,
        );
      },
      onToggleExpandedInlineThreadPreview: () => {
        options.onToggleExpandedInlineThreadPreview(message.id);
      },
      onCopyPreviewDraft: options.onCopyPreviewDraft,
      onShareDraftEditor: options.onShareDraftEditor,
    }),
  };
}
