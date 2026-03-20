"use client";

import Image from "next/image";
import {
  BookOpen,
  Check,
  Copy,
  Edit3,
  Flag,
  Lightbulb,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";

import type {
  DraftArtifactDetails,
} from "@/lib/onboarding/draftArtifacts";
import type { SelectedAngleFormatHint } from "@/lib/agent-v2/contracts/turnContract";
import type { ReplySourcePreview } from "@/lib/reply-engine/replySourcePreview";

import {
  AnimatedDraftText,
  InlineDraftPreviewCard,
} from "../draft-editor/chatDraftPreviewCard";
import type { DraftRevisionRequestOptions } from "../draft-editor/chatDraftActionState";
import { InlineProfileAnalysisCard } from "../analysis/InlineProfileAnalysisCard";
import {
  buildDraftArtifactRevealKey,
  buildDraftBundleRevealKey,
  buildDraftCharacterCounterMeta,
  resolveDisplayedDraftCharacterLimit,
  resolveInlineDraftPreviewState,
} from "../draft-editor/chatDraftPreviewState";
import {
  type ChatMessageLike,
  type DraftVersionEntryLike,
  normalizeDraftVersionBundle,
} from "../draft-editor/chatDraftSessionState";
import {
  getDraftGroundingLabel,
  getDraftGroundingToneClasses,
  summarizeGroundingSource,
} from "../draft-queue/draftQueueViewState";
import { isGeneratedResultOutputShape } from "../chat-page/chatPageViewState";
import type { ProfileAnalysisArtifact } from "@/lib/chat/profileAnalysisArtifact";
import { ReplySourcePreviewCard } from "../reply/ReplySourcePreviewCard";
import { InlineReplyDraftPreviewCard } from "../reply/InlineReplyDraftPreviewCard";

type QuickReplyLike = {
  kind: string;
  value: string;
  label: string;
  angle?: string;
  formatHint?: SelectedAngleFormatHint;
  supportAsset?: string;
};

type ReplyArtifactsLike =
  | {
      kind: "reply_options";
      sourceText: string;
      sourceUrl: string | null;
      authorHandle: string | null;
      replySourcePreview?: ReplySourcePreview | null;
      options: Array<{
        id: string;
        label: string;
        text: string;
        intent?: { anchor?: string | null } | null;
      }>;
      groundingNotes: string[];
    }
  | {
      kind: "reply_draft";
      sourceText: string;
      sourceUrl: string | null;
      authorHandle: string | null;
      replySourcePreview?: ReplySourcePreview | null;
      options: Array<{
        id: string;
        label: string;
        text: string;
        intent?: { anchor?: string | null } | null;
      }>;
      notes: string[];
    };

interface MessageLike extends ChatMessageLike {
  content: string;
  quickReplies?: QuickReplyLike[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  angles?: any[];
  ideationFormatHint?: SelectedAngleFormatHint | null;
  surfaceMode?: string;
  autoSavedSourceMaterials?: {
    count: number;
    assets: Array<{ id: string; title: string; deletable: boolean }>;
  } | null;
  promotedSourceMaterials?: {
    count: number;
    assets: Array<{ id: string; title: string }>;
  } | null;
  feedbackValue?: "up" | "down" | null;
  isStreaming?: boolean;
  replyArtifacts?: ReplyArtifactsLike | null;
  draftBundle?: {
    selectedOptionId: string;
    options: Array<{
      id: string;
      label: string;
      versionId: string;
      content: string;
      artifact: DraftArtifactDetails;
    }>;
  } | null;
  draftVersions?: DraftVersionEntryLike[];
  whyThisWorks?: string[];
  watchOutFor?: string[];
  profileAnalysisArtifact?: ProfileAnalysisArtifact | null;
  replySourcePreview?: ReplySourcePreview | null;
}

interface MessageArtifactSectionsProps {
  message: MessageLike;
  index: number;
  messagesLength: number;
  selectedIdeationAngleTitle?: string | null;
  composerCharacterLimit: number;
  isVerifiedAccount: boolean;
  isMainChatLocked: boolean;
  showDevTools: boolean;
  selectedDraftMessageId: string | null;
  selectedDraftVersionId: string | null;
  selectedThreadPreviewPostIndex: number | undefined;
  expandedInlineThreadPreviewId: string | null;
  copiedPreviewDraftMessageId: string | null;
  dismissedAutoSavedSource: boolean;
  autoSavedSourceUndoPending: boolean;
  messageFeedbackPending: boolean;
  canRunReplyActions: boolean;
  contextIdentity: {
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
  getRevealClassName: (draftKey: string) => string;
  shouldAnimateRevealLines: (draftKey: string) => boolean;
  shouldShowQuickReplies: (message: MessageLike) => boolean;
  shouldShowOptionArtifacts: (message: MessageLike) => boolean;
  shouldShowDraftOutput: (message: MessageLike) => boolean;
  onOpenSourceMaterialEditor: (params: { assetId?: string; title?: string | null }) => void;
  onUndoAutoSavedSourceMaterials: () => void;
  onSubmitAssistantMessageFeedback: (value: "up" | "down") => void;
  onOpenScopedFeedback: () => void;
  onQuickReplySelect: (quickReply: QuickReplyLike) => void;
  onAngleSelect: (title: string, formatHint: SelectedAngleFormatHint) => void;
  onReplyOptionSelect: (optionIndex: number) => void;
  onSelectDraftBundleOption: (optionId: string, versionId: string) => void;
  onOpenDraftEditor: (versionId?: string, threadPostIndex?: number) => void;
  onRequestDraftCardRevision: (
    prompt: string,
    revisionOptions?: DraftRevisionRequestOptions,
  ) => void;
  onToggleExpandedInlineThreadPreview: () => void;
  onCopyPreviewDraft: (messageId: string, content: string) => void;
  onShareDraftEditor: () => void;
}

export function MessageArtifactSections(props: MessageArtifactSectionsProps) {
  const {
    message,
    index,
    messagesLength,
    selectedIdeationAngleTitle,
    composerCharacterLimit,
    isVerifiedAccount,
    isMainChatLocked,
    showDevTools,
    selectedDraftMessageId,
    selectedDraftVersionId,
    selectedThreadPreviewPostIndex,
    expandedInlineThreadPreviewId,
    copiedPreviewDraftMessageId,
    dismissedAutoSavedSource,
    autoSavedSourceUndoPending,
    messageFeedbackPending,
    canRunReplyActions,
    contextIdentity,
    getRevealClassName,
    shouldAnimateRevealLines,
    shouldShowQuickReplies,
    shouldShowOptionArtifacts,
    shouldShowDraftOutput,
    onOpenSourceMaterialEditor,
    onUndoAutoSavedSourceMaterials,
    onSubmitAssistantMessageFeedback,
    onOpenScopedFeedback,
    onQuickReplySelect,
    onAngleSelect,
    onReplyOptionSelect,
    onSelectDraftBundleOption,
    onOpenDraftEditor,
    onRequestDraftCardRevision,
    onToggleExpandedInlineThreadPreview,
    onCopyPreviewDraft,
    onShareDraftEditor,
  } = props;

  if (message.role !== "assistant") {
    return null;
  }

  const isLatestMessage = index === messagesLength - 1;
  const isGeneratedResult = isGeneratedResultOutputShape(message.outputShape);
  const hasPrimaryIdeationAngleQuickReplies =
    message.outputShape === "ideation_angles" &&
    Boolean(message.quickReplies?.some((quickReply) => quickReply.kind === "ideation_angle"));

  return (
    <>
      {message.autoSavedSourceMaterials?.count ? (
        <div className="mt-2 inline-flex items-center gap-2 text-[11px] text-zinc-500">
          <Lightbulb className="h-3.5 w-3.5" />
          <span>
            {dismissedAutoSavedSource
              ? "Won't reuse that source."
              : "Saved to memory"}
          </span>
        </div>
      ) : null}

      {message.promotedSourceMaterials?.count ? (
        <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-sky-500/20 bg-sky-500/[0.06] px-3 py-1 text-[11px] text-sky-200/90">
          <BookOpen className="h-3.5 w-3.5" />
          <span>
            Added to saved context
            {message.promotedSourceMaterials.assets[0]?.title
              ? `: ${message.promotedSourceMaterials.assets[0].title}`
              : "."}
          </span>
          {message.promotedSourceMaterials.assets[0] ? (
            <button
              type="button"
              onClick={() =>
                onOpenSourceMaterialEditor({
                  assetId: message.promotedSourceMaterials?.assets[0]?.id,
                  title: message.promotedSourceMaterials?.assets[0]?.title,
                })
              }
              className="inline-flex items-center rounded-full border border-sky-400/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-sky-100 transition hover:border-sky-300/40 hover:text-white"
            >
              Review
            </button>
          ) : null}
        </div>
      ) : null}

      {!isGeneratedResult && !message.isStreaming ? (
        <div className="mt-2 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onSubmitAssistantMessageFeedback("up")}
            disabled={isMainChatLocked || messageFeedbackPending}
            aria-label="Thumbs up"
            className={`inline-flex cursor-pointer items-center rounded-full p-1.5 transition ${
              message.feedbackValue === "up"
                ? "bg-emerald-300/10 text-emerald-300"
                : "text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-300"
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <ThumbsUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => onSubmitAssistantMessageFeedback("down")}
            disabled={isMainChatLocked || messageFeedbackPending}
            aria-label="Thumbs down"
            className={`inline-flex cursor-pointer items-center rounded-full p-1.5 transition ${
              message.feedbackValue === "down"
                ? "bg-rose-300/10 text-rose-300"
                : "text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-300"
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <ThumbsDown className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onOpenScopedFeedback}
            aria-label="Report response"
            title="Report response"
            className="inline-flex cursor-pointer items-center rounded-full p-1.5 text-zinc-600 transition hover:text-zinc-300"
          >
            <Flag className="h-3 w-3" />
          </button>
        </div>
      ) : null}

      {!isGeneratedResult &&
      shouldShowQuickReplies(message) &&
      isLatestMessage &&
      !(message.outputShape === "ideation_angles" && message.angles?.length) ? (
        <QuickReplyButtons
          quickReplies={message.quickReplies ?? []}
          disabled={!canRunReplyActions}
          onSelect={onQuickReplySelect}
        />
      ) : null}

      {shouldShowOptionArtifacts(message) &&
      message.outputShape !== "coach_question" &&
      message.angles?.length &&
      !hasPrimaryIdeationAngleQuickReplies ? (
        <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
          {message.angles.map((angle, angleIndex) => {
            const isStructured = typeof angle === "object" && angle !== null;
            const title = isStructured ? (angle as Record<string, string>).title : (angle as string);
            const normalizedTitle = title.trim().toLowerCase();
            const normalizedSelectedIdeationAngleTitle =
              selectedIdeationAngleTitle?.trim().toLowerCase() || null;
            const hasSelectedIdeationAngle = Boolean(normalizedSelectedIdeationAngleTitle);
            const isSelectedIdeationAngle =
              normalizedSelectedIdeationAngleTitle === normalizedTitle;
            const selectedAngleFormatHint: SelectedAngleFormatHint =
              message.ideationFormatHint === "thread"
                ? "thread"
                : message.ideationFormatHint === "post"
                  ? "post"
                  : /\bthread directions\b/i.test(message.content)
                    ? "thread"
                    : "post";

            return (
              <button
                key={`${message.id}-angle-${angleIndex}`}
                type="button"
                onClick={() => onAngleSelect(title, selectedAngleFormatHint)}
                disabled={hasSelectedIdeationAngle}
                aria-pressed={isSelectedIdeationAngle}
                className={`group relative w-full rounded-lg py-2 text-left transition-colors ${
                  hasSelectedIdeationAngle
                    ? isSelectedIdeationAngle
                      ? "bg-white/[0.07] shadow-[0_0_0_1px_rgba(255,255,255,0.12)]"
                      : "opacity-60"
                    : "cursor-pointer hover:bg-white/[0.04]"
                } disabled:cursor-default`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 text-sm font-semibold ${
                      isSelectedIdeationAngle ? "text-white" : "text-zinc-500"
                    }`}
                  >
                    {angleIndex + 1}.
                  </span>
                  <p
                    className={`text-sm font-medium leading-relaxed transition-colors ${
                      hasSelectedIdeationAngle
                        ? isSelectedIdeationAngle
                          ? "text-white"
                          : "text-zinc-500"
                        : "text-zinc-400 group-hover:text-zinc-100"
                    }`}
                  >
                    {title}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      ) : null}

      {!isGeneratedResult &&
      message.outputShape === "ideation_angles" &&
      message.angles?.length &&
      shouldShowQuickReplies(message) &&
      isLatestMessage ? (
        <QuickReplyButtons
          quickReplies={message.quickReplies ?? []}
          disabled={!canRunReplyActions}
          onSelect={onQuickReplySelect}
        />
      ) : null}

      {message.profileAnalysisArtifact ? (
        <InlineProfileAnalysisCard artifact={message.profileAnalysisArtifact} />
      ) : null}

      <ReplyArtifactSections
        message={message}
        canRunReplyActions={canRunReplyActions}
        onReplyOptionSelect={onReplyOptionSelect}
      />

      <DraftArtifactSections
        message={message}
        composerCharacterLimit={composerCharacterLimit}
        isVerifiedAccount={isVerifiedAccount}
        isMainChatLocked={isMainChatLocked}
        selectedDraftMessageId={selectedDraftMessageId}
        selectedDraftVersionId={selectedDraftVersionId}
        selectedThreadPreviewPostIndex={selectedThreadPreviewPostIndex}
        expandedInlineThreadPreviewId={expandedInlineThreadPreviewId}
        copiedPreviewDraftMessageId={copiedPreviewDraftMessageId}
        contextIdentity={contextIdentity}
        getRevealClassName={getRevealClassName}
        shouldAnimateRevealLines={shouldAnimateRevealLines}
        shouldShowDraftOutput={shouldShowDraftOutput}
        onOpenSourceMaterialEditor={onOpenSourceMaterialEditor}
        onSelectDraftBundleOption={onSelectDraftBundleOption}
        onOpenDraftEditor={onOpenDraftEditor}
        onRequestDraftCardRevision={onRequestDraftCardRevision}
        onToggleExpandedInlineThreadPreview={onToggleExpandedInlineThreadPreview}
        onCopyPreviewDraft={onCopyPreviewDraft}
        onShareDraftEditor={onShareDraftEditor}
      />

      {showDevTools &&
      ((message.whyThisWorks?.length ?? 0) > 0 || (message.watchOutFor?.length ?? 0) > 0) ? (
        <div className="mt-4 grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-2">
          {message.whyThisWorks?.length ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Why This Works
              </p>
              <ul className="mt-2 space-y-2 text-xs leading-6 text-zinc-300">
                {message.whyThisWorks.map((item, itemIndex) => (
                  <li key={`${message.id}-why-${itemIndex}`}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {message.watchOutFor?.length ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Watch Out For
              </p>
              <ul className="mt-2 space-y-2 text-xs leading-6 text-zinc-300">
                {message.watchOutFor.map((item, itemIndex) => (
                  <li key={`${message.id}-watch-${itemIndex}`}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export function AssistantResultFooter(props: {
  message: MessageLike;
  isLatestMessage: boolean;
  isMainChatLocked: boolean;
  messageFeedbackPending: boolean;
  canRunReplyActions: boolean;
  shouldShowQuickReplies: (message: MessageLike) => boolean;
  onSubmitAssistantMessageFeedback: (value: "up" | "down") => void;
  onOpenScopedFeedback: () => void;
  onQuickReplySelect: (quickReply: QuickReplyLike) => void;
}) {
  const {
    message,
    isLatestMessage,
    isMainChatLocked,
    messageFeedbackPending,
    canRunReplyActions,
    shouldShowQuickReplies,
    onSubmitAssistantMessageFeedback,
    onOpenScopedFeedback,
    onQuickReplySelect,
  } = props;

  if (message.role !== "assistant" || !isGeneratedResultOutputShape(message.outputShape)) {
    return null;
  }

  const showFeedback = !message.isStreaming;
  const showQuickReplies =
    isLatestMessage &&
    shouldShowQuickReplies(message) &&
    message.outputShape !== "reply_candidate";

  if (!showFeedback && !showQuickReplies) {
    return null;
  }

  return (
    <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
      {showFeedback ? (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onSubmitAssistantMessageFeedback("up")}
            disabled={isMainChatLocked || messageFeedbackPending}
            aria-label="Thumbs up"
            className={`inline-flex cursor-pointer items-center rounded-full p-1.5 transition ${
              message.feedbackValue === "up"
                ? "bg-emerald-300/10 text-emerald-300"
                : "text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-300"
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <ThumbsUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => onSubmitAssistantMessageFeedback("down")}
            disabled={isMainChatLocked || messageFeedbackPending}
            aria-label="Thumbs down"
            className={`inline-flex cursor-pointer items-center rounded-full p-1.5 transition ${
              message.feedbackValue === "down"
                ? "bg-rose-300/10 text-rose-300"
                : "text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-300"
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <ThumbsDown className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onOpenScopedFeedback}
            aria-label="Report response"
            title="Report response"
            className="inline-flex cursor-pointer items-center rounded-full p-1.5 text-zinc-600 transition hover:text-zinc-300"
          >
            <Flag className="h-3 w-3" />
          </button>
        </div>
      ) : null}

      {showQuickReplies ? (
        <ResultQuickReplyRail
          quickReplies={message.quickReplies ?? []}
          disabled={!canRunReplyActions}
          onSelect={onQuickReplySelect}
        />
      ) : null}
    </div>
  );
}

function FollowUpChipIcon(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={props.className || "h-4 w-4"}
      fill="currentColor"
    >
      <path d="M12 6.229C5.269 7.328 1.995 12.498 2 22.001h2c0-1.914.705-3.537 2.095-4.825 1.5-1.391 3.739-2.259 5.905-2.331v5.507L23.259 10.5 12 .648v5.581zm2 1.773V5.056l6.222 5.443L14 15.942v-3.004l-.924-.07c-.265-.021-.531-.03-.798-.03-2.765 0-5.594 1.064-7.542 2.87l-.129.122c1.13-4.802 3.874-7.242 8.499-7.733l.895-.095z" />
    </svg>
  );
}

function FollowUpChipButton(props: {
  quickReply: QuickReplyLike;
  disabled: boolean;
  onSelect: (quickReply: QuickReplyLike) => void;
  animationDelaySeconds?: number;
}) {
  const { quickReply, disabled, onSelect, animationDelaySeconds } = props;
  const isPrimaryIdeationAngle = quickReply.kind === "ideation_angle";
  const Icon = isPrimaryIdeationAngle ? Lightbulb : FollowUpChipIcon;

  return (
    <button
      key={`${quickReply.kind}-${quickReply.value}`}
      type="button"
      onClick={() => onSelect(quickReply)}
      disabled={disabled}
      className={`group/follow-up-chip inline-flex max-w-full cursor-pointer text-[#e7e9ea] transition-[color,transform] duration-150 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-55 ${
        isPrimaryIdeationAngle
          ? "w-full rounded-2xl border border-white/10 bg-white/[0.03] hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.05]"
          : "w-fit rounded-full bg-transparent hover:-translate-y-0.5"
      }`}
    >
      <div
        className={`flex animate-fade-in-slide-up ${
          isPrimaryIdeationAngle
            ? "items-start gap-3 px-4 py-3"
            : "items-center gap-2.5 px-1 py-2"
        }`}
        style={
          animationDelaySeconds !== undefined
            ? { animationDelay: `${animationDelaySeconds}s` }
            : undefined
        }
      >
        <Icon
          className={`shrink-0 transition group-hover/follow-up-chip:text-[#e7e9ea] ${
            isPrimaryIdeationAngle
              ? "mt-0.5 h-4 w-4 text-white"
              : "h-4 w-4 text-[#71767b] [transform:scaleY(-1)]"
          }`}
        />
        <span
          className={`font-medium tracking-[-0.01em] transition group-hover/follow-up-chip:text-[#e7e9ea] ${
            isPrimaryIdeationAngle
              ? "whitespace-normal text-[15px] leading-6 text-[#e7e9ea]"
              : "whitespace-nowrap text-[15px] leading-none text-[#b8bbbe]"
          }`}
        >
          {quickReply.label}
        </span>
      </div>
    </button>
  );
}

function QuickReplyButtons(props: {
  quickReplies: QuickReplyLike[];
  disabled: boolean;
  onSelect: (quickReply: QuickReplyLike) => void;
}) {
  const { quickReplies, disabled, onSelect } = props;

  return (
    <div className="mt-4 flex flex-col items-start gap-1 border-t border-white/10 pt-4">
      {quickReplies.map((quickReply, index) => (
        <FollowUpChipButton
          key={`${quickReply.kind}-${quickReply.value}`}
          quickReply={quickReply}
          disabled={disabled}
          onSelect={onSelect}
          animationDelaySeconds={0.18 + index * 0.04}
        />
      ))}
    </div>
  );
}

function ResultQuickReplyRail(props: {
  quickReplies: QuickReplyLike[];
  disabled: boolean;
  onSelect: (quickReply: QuickReplyLike) => void;
}) {
  const { quickReplies, disabled, onSelect } = props;

  return (
    <div
      data-testid="result-follow-up-rail"
      className="flex flex-col items-start gap-1 pb-1"
    >
      {quickReplies.map((quickReply, index) => (
        <FollowUpChipButton
          key={`${quickReply.kind}-${quickReply.value}`}
          quickReply={quickReply}
          disabled={disabled}
          onSelect={onSelect}
          animationDelaySeconds={0.2 + index * 0.05}
        />
      ))}
    </div>
  );
}

function resolveMessageReplySourcePreview(message: MessageLike): ReplySourcePreview | null {
  const draftArtifactPreview =
    message.draftArtifacts?.find((artifact) => artifact.replySourcePreview)?.replySourcePreview ??
    null;

  return (
    draftArtifactPreview ??
    message.replyArtifacts?.replySourcePreview ??
    message.replySourcePreview ??
    null
  );
}

function ReplyArtifactSections(props: {
  message: MessageLike;
  canRunReplyActions: boolean;
  onReplyOptionSelect: (optionIndex: number) => void;
}) {
  const { message, canRunReplyActions, onReplyOptionSelect } = props;
  const replySourcePreview = resolveMessageReplySourcePreview(message);

  if (message.replyArtifacts?.kind === "reply_options") {
    return (
      <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
        {replySourcePreview ? (
          <div className="w-full max-w-[600px]">
            <ReplySourcePreviewCard
              preview={replySourcePreview}
              tone="reply"
              size="compact"
              showExternalCta
            />
          </div>
        ) : (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80">
              Source Post
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-200">
              {message.replyArtifacts.sourceText}
            </p>
            {message.replyArtifacts.authorHandle || message.replyArtifacts.sourceUrl ? (
              <p className="mt-2 text-xs text-zinc-400">
                {message.replyArtifacts.authorHandle
                  ? `@${message.replyArtifacts.authorHandle}`
                  : message.replyArtifacts.sourceUrl}
              </p>
            ) : null}
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-3">
          {message.replyArtifacts.options.map((option, optionIndex) => (
            <button
              key={`${message.id}-reply-option-${option.id}`}
              type="button"
              onClick={() => onReplyOptionSelect(optionIndex)}
              disabled={!canRunReplyActions}
              className="rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-white/20 hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Option {optionIndex + 1}
              </p>
              <p className="mt-1 text-sm font-semibold text-white">
                {option.label.replace(/_/g, " ")}
              </p>
              {option.intent?.anchor ? (
                <p className="mt-2 text-xs leading-5 text-emerald-200/80">
                  {option.intent.anchor}
                </p>
              ) : null}
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-300">
                {option.text}
              </p>
            </button>
          ))}
        </div>
        {message.replyArtifacts.groundingNotes?.length ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Grounding Notes
            </p>
            <ul className="mt-2 space-y-1.5 text-sm leading-6 text-zinc-300">
              {message.replyArtifacts.groundingNotes.map((note, noteIndex) => (
                <li key={`${message.id}-reply-grounding-${noteIndex}`}>{note}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    );
  }

  if (message.replyArtifacts?.kind === "reply_draft") {
    if (replySourcePreview) {
      return null;
    }

    return (
      <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Reply Drafts
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-300">
            {message.replyArtifacts.sourceText}
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {message.replyArtifacts.options.map((option) => (
            <div
              key={`${message.id}-reply-draft-${option.id}`}
              className="rounded-2xl border border-white/10 bg-black/20 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    Variant
                  </p>
                  <p className="mt-1 text-sm font-semibold text-white">{option.label}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(option.text);
                  }}
                  className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400 transition hover:bg-white/[0.04] hover:text-white"
                >
                  Copy
                </button>
              </div>
              {option.intent?.anchor ? (
                <p className="mt-2 text-xs leading-5 text-emerald-200/80">{option.intent.anchor}</p>
              ) : null}
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-200">
                {option.text}
              </p>
            </div>
          ))}
        </div>
        {message.replyArtifacts.notes?.length ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Notes
            </p>
            <ul className="mt-2 space-y-1.5 text-sm leading-6 text-zinc-300">
              {message.replyArtifacts.notes.map((note, noteIndex) => (
                <li key={`${message.id}-reply-note-${noteIndex}`}>{note}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    );
  }

  return null;
}

function DraftArtifactSections(props: {
  message: MessageLike;
  composerCharacterLimit: number;
  isVerifiedAccount: boolean;
  isMainChatLocked: boolean;
  selectedDraftMessageId: string | null;
  selectedDraftVersionId: string | null;
  selectedThreadPreviewPostIndex: number | undefined;
  expandedInlineThreadPreviewId: string | null;
  copiedPreviewDraftMessageId: string | null;
  contextIdentity: {
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
  getRevealClassName: (draftKey: string) => string;
  shouldAnimateRevealLines: (draftKey: string) => boolean;
  shouldShowDraftOutput: (message: MessageLike) => boolean;
  onOpenSourceMaterialEditor: (params: { title?: string | null }) => void;
  onSelectDraftBundleOption: (optionId: string, versionId: string) => void;
  onOpenDraftEditor: (versionId?: string, threadPostIndex?: number) => void;
  onRequestDraftCardRevision: (
    prompt: string,
    revisionOptions?: DraftRevisionRequestOptions,
  ) => void;
  onToggleExpandedInlineThreadPreview: () => void;
  onCopyPreviewDraft: (messageId: string, content: string) => void;
  onShareDraftEditor: () => void;
}) {
  const {
    message,
    composerCharacterLimit,
    isVerifiedAccount,
    isMainChatLocked,
    selectedDraftMessageId,
    selectedDraftVersionId,
    selectedThreadPreviewPostIndex,
    expandedInlineThreadPreviewId,
    copiedPreviewDraftMessageId,
    contextIdentity,
    getRevealClassName,
    shouldAnimateRevealLines,
    shouldShowDraftOutput,
    onOpenSourceMaterialEditor,
    onSelectDraftBundleOption,
    onOpenDraftEditor,
    onRequestDraftCardRevision,
    onToggleExpandedInlineThreadPreview,
    onCopyPreviewDraft,
    onShareDraftEditor,
  } = props;

  if (!shouldShowDraftOutput(message) || message.outputShape === "coach_question") {
    return null;
  }

  if (message.outputShape === "reply_candidate") {
    const normalizedBundle = normalizeDraftVersionBundle(message, composerCharacterLimit);
    const activeDraftArtifact =
      normalizedBundle?.activeVersion.artifact ?? message.draftArtifacts?.[0] ?? null;
    const activeReplySourcePreview =
      activeDraftArtifact?.replySourcePreview ?? resolveMessageReplySourcePreview(message);
    const draftText =
      normalizedBundle?.activeVersion.content ??
      activeDraftArtifact?.content ??
      message.draft ??
      "";

    if (activeReplySourcePreview && draftText.trim()) {
      const draftRevealKey =
        normalizedBundle?.activeVersion.id
          ? `version:${normalizedBundle.activeVersion.id}`
          : activeDraftArtifact?.id
            ? buildDraftArtifactRevealKey(activeDraftArtifact.id)
            : message.activeDraftVersionId
              ? `version:${message.activeDraftVersionId}`
              : message.id;

      return (
        <InlineReplyDraftPreviewCard
          identity={contextIdentity}
          isVerifiedAccount={isVerifiedAccount}
          isMainChatLocked={isMainChatLocked}
          draftText={draftText}
          sourcePreview={activeReplySourcePreview}
          isFocused={selectedDraftMessageId === message.id}
          hasCopiedDraft={copiedPreviewDraftMessageId === message.id}
          revealClassName={getRevealClassName(draftRevealKey)}
          shouldAnimateLines={shouldAnimateRevealLines(draftRevealKey)}
          onOpenDraftEditor={() => onOpenDraftEditor()}
          onRequestRevision={(prompt) => onRequestDraftCardRevision(prompt)}
          onCopy={() => onCopyPreviewDraft(message.id, draftText)}
        />
      );
    }
  }

  if (message.draftBundle?.options?.length && message.draftBundle.options.length < 4) {
    return (
      <div className="mt-4 grid gap-3 border-t border-white/10 pt-4 md:grid-cols-2">
        {message.draftBundle.options.map((option, optionIndex) => {
          const isSelected =
            option.id === message.draftBundle?.selectedOptionId ||
            option.versionId === message.activeDraftVersionId;
          const preview =
            option.content.length > 220
              ? `${option.content.slice(0, 217).trimEnd()}...`
              : option.content;
          const draftRevealKey = buildDraftBundleRevealKey(option.id);

          return (
            <button
              key={`${message.id}-bundle-${option.id}`}
              type="button"
              onClick={() => {
                onSelectDraftBundleOption(option.id, option.versionId);
                onOpenDraftEditor(option.versionId);
              }}
              className={`rounded-3xl border p-4 text-left transition ${
                isSelected
                  ? "border-white/20 bg-white/[0.06] shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
                  : "border-white/10 bg-black/20 hover:border-white/15 hover:bg-white/[0.04]"
              } ${getRevealClassName(draftRevealKey)}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    Option {optionIndex + 1}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-white">{option.label}</p>
                </div>
                <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                  {option.artifact.weightedCharacterCount}/{option.artifact.maxCharacterLimit}
                </span>
              </div>
              <AnimatedDraftText
                text={preview}
                className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-300"
                animate={shouldAnimateRevealLines(draftRevealKey)}
              />
            </button>
          );
        })}
      </div>
    );
  }

  if (
    message.outputShape !== "short_form_post" &&
    message.outputShape !== "long_form_post" &&
    message.outputShape !== "thread_seed" &&
    message.draftArtifacts?.length
  ) {
    return (
      <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
        {message.draftArtifacts.map((artifact, artifactIndex) => {
          const artifactVersionId =
            normalizeDraftVersionBundle(message, composerCharacterLimit)?.versions[artifactIndex]?.id;
          const draftRevealKey = buildDraftArtifactRevealKey(artifact.id);

          return (
            <div
              key={`${message.id}-draft-artifact-${artifact.id}`}
              className={`rounded-2xl border border-white/10 bg-black/20 px-3 py-3 ${getRevealClassName(
                draftRevealKey,
              )}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    {artifact.title}
                  </p>
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
                    {artifact.kind.replace(/_/g, " ")} · {artifact.weightedCharacterCount}/
                    {artifact.maxCharacterLimit}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenDraftEditor(artifactVersionId)}
                  className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400 transition hover:bg-white/[0.04] hover:text-white"
                >
                  Edit
                </button>
              </div>
              <AnimatedDraftText
                text={artifact.content}
                className="mt-3 whitespace-pre-wrap leading-7 text-zinc-100"
                animate={shouldAnimateRevealLines(draftRevealKey)}
              />
              {artifact.groundingExplanation || artifact.groundingSources?.length ? (
                (() => {
                  const groundingTone = getDraftGroundingToneClasses(artifact);
                  const groundingLabel = getDraftGroundingLabel(artifact) || "Grounding";

                  return (
                    <div className={`mt-3 rounded-2xl border px-3 py-3 ${groundingTone.container}`}>
                      <p
                        className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${groundingTone.label}`}
                      >
                        {groundingLabel}
                      </p>
                      {artifact.groundingExplanation ? (
                        <p className="mt-2 text-xs leading-6 text-zinc-200">
                          {artifact.groundingExplanation}
                        </p>
                      ) : null}
                      {artifact.groundingSources?.length ? (
                        <ul className="mt-2 space-y-1.5 text-xs leading-6 text-zinc-200">
                          {artifact.groundingSources.slice(0, 2).map((source, sourceIndex) => (
                            <li key={`${artifact.id}-grounding-${sourceIndex}`}>
                              <button
                                type="button"
                                onClick={() => onOpenSourceMaterialEditor({ title: source.title })}
                                className="font-semibold text-emerald-200 transition hover:text-white"
                              >
                                {source.title}
                              </button>
                              {summarizeGroundingSource(source)
                                ? ` · ${summarizeGroundingSource(source)}`
                                : ""}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  );
                })()
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  if (message.draftBundle?.options?.length && message.draftBundle.options.length >= 4) {
    return (
      <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
        {message.draftBundle.options.map((option) => {
          const draftCounter = buildDraftCharacterCounterMeta(
            option.content,
            resolveDisplayedDraftCharacterLimit(
              option.artifact.maxCharacterLimit,
              composerCharacterLimit,
            ),
          );
          const isFocusedDraftPreview =
            selectedDraftMessageId === message.id && selectedDraftVersionId === option.versionId;
          const draftRevealKey = buildDraftBundleRevealKey(option.id);

          return (
            <div
              key={`${message.id}-inline-draft-${option.id}`}
              role="button"
              tabIndex={0}
              onClick={() => onOpenDraftEditor(option.versionId)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpenDraftEditor(option.versionId);
                }
              }}
              className={`cursor-pointer rounded-2xl bg-[#000000] p-4 transition-[border-color,box-shadow,background-color] duration-300 ${
                isFocusedDraftPreview
                  ? "border border-white/45 shadow-[0_0_0_1px_rgba(255,255,255,0.14),0_0_34px_rgba(255,255,255,0.16)]"
                  : "border border-white/[0.08] hover:border-white/15 hover:bg-[#0F0F0F]"
              } ${getRevealClassName(draftRevealKey)}`}
              aria-current={isFocusedDraftPreview ? "true" : undefined}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-zinc-600 to-zinc-800 text-sm font-bold text-white uppercase">
                    {contextIdentity.avatarUrl ? (
                      <div
                        className="h-full w-full bg-cover bg-center"
                        style={{ backgroundImage: `url(${contextIdentity.avatarUrl})` }}
                        role="img"
                        aria-label={`${contextIdentity.displayName} profile photo`}
                      />
                    ) : (
                      contextIdentity.displayName.charAt(0)
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="truncate text-sm font-bold text-white">
                        {contextIdentity.displayName}
                      </span>
                      {isVerifiedAccount ? (
                        <Image
                          src="/x-verified.svg"
                          alt="Verified account"
                          width={16}
                          height={16}
                          className="h-4 w-4 shrink-0"
                        />
                      ) : null}
                    </div>
                    <span className="text-xs text-zinc-500">@{contextIdentity.username}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenDraftEditor(option.versionId);
                  }}
                  className="rounded-full p-2 text-zinc-500"
                  aria-label="Edit draft"
                >
                  <Edit3 className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3">
                <AnimatedDraftText
                  text={option.content}
                  className="whitespace-pre-wrap text-[15px] leading-6 text-zinc-100"
                  animate={shouldAnimateRevealLines(draftRevealKey)}
                />
              </div>

              <div className="mt-3 flex items-center gap-1.5 text-xs text-zinc-500">
                <span>Just now</span>
                <span>·</span>
                <span className={draftCounter.toneClassName}>{draftCounter.label}</span>
              </div>

              <div className="mt-3 border-t border-white/[0.06]" />

              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCopyPreviewDraft(option.versionId, option.content);
                  }}
                  className="rounded-full p-2 text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
                  aria-label="Copy draft"
                >
                  {copiedPreviewDraftMessageId === option.versionId ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (message.draft || message.draftArtifacts?.length || message.draftVersions?.length) {
    const previewState = resolveInlineDraftPreviewState({
      message,
      composerCharacterLimit,
      isVerifiedAccount,
      selectedThreadPreviewPostIndex,
      expandedInlineThreadPreviewId,
      selectedDraftMessageId,
    });
    const previewRevealKey = previewState.previewRevealKey;

    return (
      <>
        <InlineDraftPreviewCard
          identity={contextIdentity}
          previewState={previewState}
          isVerifiedAccount={isVerifiedAccount}
          isMainChatLocked={isMainChatLocked}
          hasCopiedDraft={copiedPreviewDraftMessageId === message.id}
          revealClassName={getRevealClassName(previewRevealKey)}
          shouldAnimateLines={shouldAnimateRevealLines(previewRevealKey)}
          onOpenDraftEditor={(threadPostIndex) => onOpenDraftEditor(undefined, threadPostIndex)}
          onRequestRevision={(prompt, revisionOptions) => {
            onRequestDraftCardRevision(prompt, revisionOptions);
          }}
          onToggleExpanded={onToggleExpandedInlineThreadPreview}
          onCopy={() => onCopyPreviewDraft(message.id, previewState.previewDraft)}
          onShare={onShareDraftEditor}
        />

        {message.supportAsset && !message.draftArtifacts?.length ? (
          <div className="mt-4 border-t border-white/10 pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Visual / Demo Ideas
            </p>
            <p className="mt-2 text-xs leading-6 text-zinc-300">{message.supportAsset}</p>
          </div>
        ) : null}
      </>
    );
  }

  if (message.supportAsset && !message.draftArtifacts?.length) {
    return (
      <div className="mt-4 border-t border-white/10 pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
          Visual / Demo Ideas
        </p>
        <p className="mt-2 text-xs leading-6 text-zinc-300">{message.supportAsset}</p>
      </div>
    );
  }

  return null;
}
