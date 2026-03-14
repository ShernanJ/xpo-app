"use client";

import { ArrowUpRight, Check, Copy } from "lucide-react";

import {
  computeXWeightedCharacterCount,
  getXCharacterLimitForAccount,
  type DraftArtifactDetails,
} from "@/lib/onboarding/draftArtifacts";

import { getArtifactPosts } from "../draft-editor/chatDraftPreviewState";
import {
  formatDraftQueueStatusLabel,
  getDraftGroundingLabel,
  getDraftGroundingToneClasses,
  getDraftQueueStatusClassName,
  summarizeGroundingSource,
  summarizeVoiceTarget,
  type DraftCandidateStatus,
} from "./draftQueueViewState";

interface DraftQueueCandidate {
  id: string;
  title: string;
  sourcePrompt: string;
  sourcePlaybook: string | null;
  status: DraftCandidateStatus;
  artifact: DraftArtifactDetails;
  voiceTarget: DraftArtifactDetails["voiceTarget"];
  noveltyNotes: string[] | null;
  updatedAt: string;
  observedAt: string | null;
  observedMetrics: Record<string, unknown> | null;
}

export type DraftQueueObservedMetricsCandidate = Pick<
  DraftQueueCandidate,
  "id" | "observedMetrics"
>;

interface DraftQueueDialogProps {
  open: boolean;
  isLoading: boolean;
  errorMessage: string | null;
  items: DraftQueueCandidate[];
  editingCandidateId: string | null;
  editingCandidateText: string;
  actionById: Record<string, string>;
  copiedPreviewDraftMessageId: string | null;
  canGenerateInChat: boolean;
  isVerifiedAccount: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerateInChat: () => void;
  onStartEditingCandidate: (candidateId: string, content: string) => void;
  onCancelEditingCandidate: () => void;
  onEditCandidateTextChange: (value: string) => void;
  onMutateCandidate: (
    candidateId: string,
    payload: {
      action: "approve" | "reject" | "edit" | "posted" | "observed" | "regenerate";
      content?: string;
      rejectionReason?: string;
      observedMetrics?: Record<string, unknown>;
    },
  ) => void;
  onOpenObservedMetrics: (candidate: DraftQueueObservedMetricsCandidate) => void;
  onOpenSourceMaterial: (params: { title?: string | null }) => void;
  onCopyCandidateDraft: (candidateId: string, content: string) => void;
  onOpenX: () => void;
}

export function DraftQueueDialog(props: DraftQueueDialogProps) {
  const {
    open,
    isLoading,
    errorMessage,
    items,
    editingCandidateId,
    editingCandidateText,
    actionById,
    copiedPreviewDraftMessageId,
    canGenerateInChat,
    isVerifiedAccount,
    onOpenChange,
    onGenerateInChat,
    onStartEditingCandidate,
    onCancelEditingCandidate,
    onEditCandidateTextChange,
    onMutateCandidate,
    onOpenObservedMetrics,
    onOpenSourceMaterial,
    onCopyCandidateDraft,
    onOpenX,
  } = props;

  if (!open) {
    return null;
  }

  return (
    <div
      className="absolute inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/80 px-4 py-4 sm:items-center sm:py-8"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onOpenChange(false);
        }
      }}
    >
      <div className="relative my-auto flex w-full max-w-5xl flex-col rounded-[1.75rem] border border-white/10 bg-[#0F0F0F] shadow-2xl max-sm:max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-4rem)]">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
              Draft Review
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-white">
              Review drafts after chat generates them
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-400">
              Chat is the primary drafting surface now. Use this view to review, approve, post,
              and log what happened after something ships.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onGenerateInChat}
              disabled={!canGenerateInChat}
              className="rounded-full bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
            >
              Generate in Chat
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-white/[0.04]"
            >
              Close
            </button>
          </div>
        </div>

        <div className="overflow-y-auto px-6 py-6">
          {errorMessage ? (
            <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {errorMessage}
            </div>
          ) : null}

          {isLoading ? (
            <div className="rounded-3xl border border-white/10 bg-white/[0.02] px-5 py-10 text-center text-sm text-zinc-400">
              Loading the queue...
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-10 text-center">
              <p className="text-sm font-medium text-white">No reviewed drafts yet</p>
              <p className="mt-2 text-sm text-zinc-500">
                Generate a batch in chat, then review the results here.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((candidate) => {
                const candidatePosts = getArtifactPosts(candidate.artifact);
                const isThreadCandidate =
                  candidate.artifact.kind === "thread_seed" || candidatePosts.length > 1;
                const isEditingCandidate = editingCandidateId === candidate.id;
                const activeCandidateAction = actionById[candidate.id] ?? null;
                const candidateVoiceSummary = summarizeVoiceTarget(
                  candidate.voiceTarget ?? candidate.artifact.voiceTarget,
                );

                return (
                  <div
                    key={candidate.id}
                    className="rounded-3xl border border-white/10 bg-white/[0.02] p-5"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${getDraftQueueStatusClassName(
                              candidate.status,
                            )}`}
                          >
                            {formatDraftQueueStatusLabel(candidate.status)}
                          </span>
                          {candidate.sourcePlaybook ? (
                            <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                              {candidate.sourcePlaybook.replace(/_/g, " ")}
                            </span>
                          ) : null}
                          <span className="text-[11px] text-zinc-500">
                            {new Date(candidate.updatedAt).toLocaleString([], {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-white">{candidate.title}</h3>
                          <p className="mt-2 text-sm leading-6 text-zinc-400">
                            {candidate.sourcePrompt}
                          </p>
                        </div>
                        {candidateVoiceSummary ? (
                          <p className="text-xs text-zinc-500">
                            Voice target: {candidateVoiceSummary}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => onMutateCandidate(candidate.id, { action: "approve" })}
                          disabled={Boolean(activeCandidateAction)}
                          className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {activeCandidateAction === "approve" ? "Approving" : "Approve"}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onMutateCandidate(candidate.id, {
                              action: "reject",
                              rejectionReason: "Rejected from the draft queue.",
                            })
                          }
                          disabled={Boolean(activeCandidateAction)}
                          className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {activeCandidateAction === "reject" ? "Rejecting" : "Reject"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (isEditingCandidate) {
                              onCancelEditingCandidate();
                              return;
                            }
                            onStartEditingCandidate(candidate.id, candidate.artifact.content);
                          }}
                          disabled={Boolean(activeCandidateAction)}
                          className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {isEditingCandidate ? "Cancel Edit" : "Edit"}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onMutateCandidate(candidate.id, { action: "regenerate" })
                          }
                          disabled={Boolean(activeCandidateAction)}
                          className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {activeCandidateAction === "regenerate"
                            ? "Regenerating"
                            : "Regenerate"}
                        </button>
                        <button
                          type="button"
                          onClick={() => onMutateCandidate(candidate.id, { action: "posted" })}
                          disabled={Boolean(activeCandidateAction)}
                          className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {activeCandidateAction === "posted" ? "Updating" : "Mark Posted"}
                        </button>
                        {candidate.status === "posted" || candidate.status === "observed" ? (
                          <button
                            type="button"
                            onClick={() => onOpenObservedMetrics(candidate)}
                            disabled={Boolean(activeCandidateAction)}
                            className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {candidate.status === "observed"
                              ? "Update Observed"
                              : "Mark Observed"}
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                      {isEditingCandidate ? (
                        <div className="space-y-3">
                          <textarea
                            value={editingCandidateText}
                            onChange={(event) => onEditCandidateTextChange(event.target.value)}
                            className="min-h-[200px] w-full resize-y rounded-2xl border border-white/10 bg-transparent px-4 py-4 text-sm leading-7 text-white outline-none placeholder:text-zinc-600"
                            placeholder="Edit draft candidate"
                          />
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs text-zinc-500">
                              {computeXWeightedCharacterCount(editingCandidateText)}/
                              {candidate.artifact.maxCharacterLimit} chars
                            </p>
                            <button
                              type="button"
                              onClick={() =>
                                onMutateCandidate(candidate.id, {
                                  action: "edit",
                                  content: editingCandidateText.trim(),
                                })
                              }
                              disabled={
                                !editingCandidateText.trim() || Boolean(activeCandidateAction)
                              }
                              className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
                            >
                              {activeCandidateAction === "edit" ? "Saving" : "Save Edit"}
                            </button>
                          </div>
                        </div>
                      ) : isThreadCandidate ? (
                        <div className="space-y-3">
                          {candidatePosts.map((post, index) => {
                            const postCharacterLimit =
                              candidate.artifact.posts[index]?.maxCharacterLimit ??
                              getXCharacterLimitForAccount(isVerifiedAccount);
                            const weightedPostCount = computeXWeightedCharacterCount(post);

                            return (
                              <div
                                key={`${candidate.id}-post-${index}`}
                                className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                                    Post {index + 1}
                                  </span>
                                  <span
                                    className={`text-[11px] ${
                                      weightedPostCount > postCharacterLimit
                                        ? "text-red-400"
                                        : "text-zinc-500"
                                    }`}
                                  >
                                    {weightedPostCount}/{postCharacterLimit.toLocaleString()}
                                  </span>
                                </div>
                                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-100">
                                  {post}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap text-sm leading-7 text-zinc-100">
                          {candidate.artifact.content}
                        </p>
                      )}

                      {candidate.artifact.supportAsset ? (
                        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                            Support asset
                          </p>
                          <p className="mt-2 text-xs leading-6 text-zinc-300">
                            {candidate.artifact.supportAsset}
                          </p>
                        </div>
                      ) : null}

                      {candidate.artifact.groundingExplanation ||
                      candidate.artifact.groundingSources?.length ? (
                        (() => {
                          const groundingTone = getDraftGroundingToneClasses(candidate.artifact);
                          const groundingLabel =
                            getDraftGroundingLabel(candidate.artifact) || "Grounding";

                          return (
                            <div
                              className={`mt-4 rounded-2xl border px-4 py-3 ${groundingTone.container}`}
                            >
                              <p
                                className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${groundingTone.label}`}
                              >
                                {groundingLabel}
                              </p>
                              {candidate.artifact.groundingExplanation ? (
                                <p className="mt-2 text-xs leading-6 text-zinc-200">
                                  {candidate.artifact.groundingExplanation}
                                </p>
                              ) : null}
                              {candidate.artifact.groundingSources?.length ? (
                                <ul className="mt-2 space-y-2 text-xs leading-6 text-zinc-200">
                                  {candidate.artifact.groundingSources.slice(0, 2).map((source, index) => (
                                    <li key={`${candidate.id}-grounding-${index}`}>
                                      <button
                                        type="button"
                                        onClick={() => onOpenSourceMaterial({ title: source.title })}
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

                      {candidate.noveltyNotes?.length ? (
                        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                            Novelty guardrails
                          </p>
                          <ul className="mt-2 space-y-1.5 text-xs leading-6 text-zinc-300">
                            {candidate.noveltyNotes.slice(0, 3).map((note, index) => (
                              <li key={`${candidate.id}-novelty-${index}`}>{note}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {candidate.observedMetrics ? (
                        <div className="mt-4 rounded-2xl border border-sky-500/20 bg-sky-500/[0.05] px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-300">
                              Observed outcomes
                            </p>
                            {candidate.observedAt ? (
                              <span className="text-[11px] text-zinc-500">
                                {new Date(candidate.observedAt).toLocaleDateString()}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-200">
                            {typeof candidate.observedMetrics.likeCount === "number" ||
                            typeof candidate.observedMetrics.likeCount === "string" ? (
                              <span className="rounded-full border border-white/10 px-2.5 py-1">
                                likes {String(candidate.observedMetrics.likeCount)}
                              </span>
                            ) : null}
                            {typeof candidate.observedMetrics.replyCount === "number" ||
                            typeof candidate.observedMetrics.replyCount === "string" ? (
                              <span className="rounded-full border border-white/10 px-2.5 py-1">
                                replies {String(candidate.observedMetrics.replyCount)}
                              </span>
                            ) : null}
                            {typeof candidate.observedMetrics.profileClicks === "number" ||
                            typeof candidate.observedMetrics.profileClicks === "string" ? (
                              <span className="rounded-full border border-white/10 px-2.5 py-1">
                                profile clicks {String(candidate.observedMetrics.profileClicks)}
                              </span>
                            ) : null}
                            {typeof candidate.observedMetrics.followerDelta === "number" ||
                            typeof candidate.observedMetrics.followerDelta === "string" ? (
                              <span className="rounded-full border border-white/10 px-2.5 py-1">
                                follower delta {String(candidate.observedMetrics.followerDelta)}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <p className="text-xs text-zinc-500">
                        {candidate.artifact.weightedCharacterCount}/
                        {candidate.artifact.maxCharacterLimit} chars
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            onCopyCandidateDraft(candidate.id, candidate.artifact.content)
                          }
                          className="rounded-full border border-white/10 p-2 text-zinc-300 transition hover:bg-white/[0.04] hover:text-white"
                          aria-label="Copy candidate draft"
                        >
                          {copiedPreviewDraftMessageId === candidate.id ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={onOpenX}
                          className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-zinc-200"
                        >
                          Open X
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
