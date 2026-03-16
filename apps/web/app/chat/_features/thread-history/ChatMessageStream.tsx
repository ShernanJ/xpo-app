"use client";

import { startTransition, useEffect, useState, type ComponentProps } from "react";
import type { AgentProgressRun } from "@/lib/chat/agentProgress";

import {
  buildDraftRevealClassName,
  shouldAnimateDraftRevealLines,
} from "./draftRevealState";
import { AgentProgressCard } from "./AgentProgressCard";
import { ChatMessageRow } from "./ChatMessageRow";
import { MessageArtifactSections } from "./MessageArtifactSections";
import { MessageContent } from "./MessageContent";
import { isDraftPendingWorkflow } from "../chat-page/chatPageViewState";

const DRAFT_SHELL_LINE_WIDTHS = ["96%", "82%", "90%"] as const;

function AssistantTypingBubble(props: { label?: string | null }) {
  const [dotCount, setDotCount] = useState(1);

  useEffect(() => {
    const interval = window.setInterval(() => {
      startTransition(() => {
        setDotCount((current) => (current >= 3 ? 1 : current + 1));
      });
    }, 420);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div
      className="max-w-[88%] px-0 py-1 text-zinc-100"
      aria-live="polite"
      aria-label="Assistant is typing"
    >
      <div className="flex items-center gap-2">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="h-2.5 w-2.5 rounded-full bg-zinc-400/80 animate-pulse"
            style={{ animationDelay: `${index * 180}ms` }}
          />
        ))}
      </div>
      {props.label ? (
        <p className="mt-3 text-xs text-zinc-400">
          {props.label}
          {".".repeat(dotCount)}
        </p>
      ) : null}
    </div>
  );
}

function PendingDraftShell(props: { progress: AgentProgressRun }) {
  const eyebrow =
    props.progress.workflow === "revise_draft"
      ? "Revision in progress"
      : "Draft in progress";
  const title =
    props.progress.workflow === "revise_draft"
      ? "Reworking the draft"
      : "Building the draft";

  return (
    <div
      className="max-w-[88%] px-4 py-3 text-zinc-100 animate-fade-in-slide-up"
      aria-live="polite"
      aria-label={title}
    >
      <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#050505] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="draft-shell-shimmer h-10 w-10 rounded-full bg-white/[0.06]" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                {eyebrow}
              </p>
              <div className="draft-shell-shimmer mt-2 h-3 w-28 rounded-full bg-white/[0.06]" />
              <div className="draft-shell-shimmer mt-2 h-2.5 w-20 rounded-full bg-white/[0.05]" />
            </div>
          </div>
          <div className="draft-shell-shimmer h-8 w-8 rounded-full bg-white/[0.05]" />
        </div>

        <div className="mt-4 space-y-2.5">
          {DRAFT_SHELL_LINE_WIDTHS.map((width, index) => (
            <div
              key={`${props.progress.workflow}-shell-line-${index}`}
              className="draft-shell-shimmer h-3 rounded-full bg-white/[0.06]"
              style={{ width }}
            />
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2 text-xs text-zinc-400">
          <div className="w-full">
            <AgentProgressCard progress={props.progress} variant="shell" />
          </div>
        </div>
      </div>
    </div>
  );
}

type ArtifactSectionsProps = ComponentProps<typeof MessageArtifactSections>;
export type ChatMessageStreamMessage = ArtifactSectionsProps["message"];

export interface ChatMessageStreamProps<TMessage extends ChatMessageStreamMessage> {
  messages: TMessage[];
  latestAssistantMessageId: string | null;
  typedAssistantLengths: Record<string, number>;
  registerMessageRef: (messageId: string, node: HTMLDivElement | null) => void;
  activeDraftRevealByMessageId: Record<string, string>;
  activeAgentProgress: AgentProgressRun | null;
  resolveArtifactSectionProps: (
    message: TMessage,
    index: number,
  ) => Omit<
    ArtifactSectionsProps,
    | "message"
    | "index"
    | "messagesLength"
    | "getRevealClassName"
    | "shouldAnimateRevealLines"
  >;
}

export function ChatMessageStream<TMessage extends ChatMessageStreamMessage>(
  props: ChatMessageStreamProps<TMessage>,
) {
  const {
    messages,
    latestAssistantMessageId,
    typedAssistantLengths,
    registerMessageRef,
    activeDraftRevealByMessageId,
    activeAgentProgress,
    resolveArtifactSectionProps,
  } = props;
  const activePendingDraftWorkflow =
    activeAgentProgress?.phase === "active" &&
    isDraftPendingWorkflow(activeAgentProgress.workflow)
      ? activeAgentProgress.workflow
      : null;

  return (
    <>
      {messages.map((message, index) => {
        const buildDraftRevealClasses = (draftKey: string) =>
          buildDraftRevealClassName(activeDraftRevealByMessageId, message.id, draftKey);
        const shouldAnimateDraftLines = (draftKey: string) =>
          shouldAnimateDraftRevealLines(activeDraftRevealByMessageId, message.id, draftKey);

        return (
          <ChatMessageRow
            key={message.id}
            messageId={message.id}
            role={message.role}
            previousRole={messages[index - 1]?.role}
            index={index}
            onRegisterRef={registerMessageRef}
          >
            {(message as TMessage & { agentProgress?: AgentProgressRun | null })
              .agentProgress ? (
              <div className="mb-3">
                <AgentProgressCard
                  progress={
                    (
                      message as TMessage & {
                        agentProgress?: AgentProgressRun | null;
                      }
                    ).agentProgress as AgentProgressRun
                  }
                  variant="message"
                />
              </div>
            ) : null}
            <MessageContent
              role={message.role}
              content={message.content}
              isStreaming={Boolean(message.isStreaming)}
              isLatestAssistantMessage={message.id === latestAssistantMessageId}
              typedLength={typedAssistantLengths[message.id] ?? 0}
              assistantTypingBubble={<AssistantTypingBubble label={message.content || null} />}
            />

            <MessageArtifactSections
              message={message}
              index={index}
              messagesLength={messages.length}
              getRevealClassName={buildDraftRevealClasses}
              shouldAnimateRevealLines={shouldAnimateDraftLines}
              {...resolveArtifactSectionProps(message, index)}
            />
          </ChatMessageRow>
        );
      })}

      {activeAgentProgress?.phase === "active" && activePendingDraftWorkflow ? (
        <PendingDraftShell progress={activeAgentProgress} />
      ) : activeAgentProgress ? (
        <div className="max-w-[88%] px-0 py-1 text-zinc-100">
          <AgentProgressCard progress={activeAgentProgress} variant="bubble" />
        </div>
      ) : null}
    </>
  );
}
