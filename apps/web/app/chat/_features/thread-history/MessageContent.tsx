"use client";

import {
  assistantMarkdownClassName,
  renderMarkdownToHtml,
  renderStreamingMarkdownToHtml,
} from "@/lib/ui/markdown";
import { getChatRenderMode } from "@/lib/ui/chatRenderMode";
import type { ChatMediaAttachmentRef } from "@/lib/chat/chatMedia";
import { ChatMediaAttachments } from "../shared/ChatMediaAttachments";
import type { ReplySourcePreview } from "@/lib/reply-engine/replySourcePreview";
import { ReplySourcePreviewCard } from "../reply/ReplySourcePreviewCard";

interface MessageContentProps {
  role: "assistant" | "user";
  content: string;
  isStreaming: boolean;
  isLatestAssistantMessage: boolean;
  typedLength: number;
  assistantTypingBubble: React.ReactNode;
  mediaAttachments?: ChatMediaAttachmentRef[];
  replySourcePreview?: ReplySourcePreview | null;
}

export function MessageContent(props: MessageContentProps) {
  const {
    role,
    content,
    isStreaming,
    isLatestAssistantMessage,
    typedLength,
    assistantTypingBubble,
    mediaAttachments,
    replySourcePreview,
  } =
    props;

  if (role === "assistant" && isStreaming) {
    return <>{assistantTypingBubble}</>;
  }

  if (role === "assistant" && isLatestAssistantMessage && typedLength < content.length) {
    if (getChatRenderMode("assistant_streaming_preview") === "markdown") {
      return (
        <div className={assistantMarkdownClassName}>
          <div
            dangerouslySetInnerHTML={{
              __html: renderStreamingMarkdownToHtml(content, typedLength),
            }}
          />
          <span className="ml-0.5 inline-block h-5 w-px animate-pulse bg-zinc-400 align-[-0.2em]" />
        </div>
      );
    }

    return (
      <p className="whitespace-pre-wrap">
        {content.slice(0, typedLength)}
        <span className="ml-0.5 inline-block h-5 w-px animate-pulse bg-zinc-400 align-[-0.2em]" />
      </p>
    );
  }

  if (role === "assistant") {
    if (getChatRenderMode("assistant_message") === "markdown") {
      return (
        <div
          className={assistantMarkdownClassName}
          dangerouslySetInnerHTML={{
            __html: renderMarkdownToHtml(content),
          }}
        />
      );
    }

    return <p className="whitespace-pre-wrap">{content}</p>;
  }

  if (role === "user") {
    if (replySourcePreview) {
      return (
        <div className="w-full max-w-[600px]">
          <ReplySourcePreviewCard preview={replySourcePreview} showExternalCta />
        </div>
      );
    }

    const hasText = content.trim().length > 0;
    return (
      <>
        {hasText ? <p className="whitespace-pre-wrap">{content}</p> : null}
        <ChatMediaAttachments attachments={mediaAttachments} variant="bubble" />
      </>
    );
  }

  return <p className="whitespace-pre-wrap">{content}</p>;
}
