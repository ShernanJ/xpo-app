"use client";

import type { ComponentProps } from "react";

import { ChatComposerDock } from "../composer/ChatComposerDock";
import { ChatHero } from "../composer/ChatHero";
import {
  ChatMessageStream,
  type ChatMessageStreamMessage,
  type ChatMessageStreamProps,
} from "../thread-history/ChatMessageStream";
import { ChatThreadView } from "../thread-history/ChatThreadView";
import { ChatHeader } from "../workspace-chrome/ChatHeader";
import { ChatSidebar } from "../workspace-chrome/ChatSidebar";

interface ChatWorkspaceCanvasProps<TMessage extends ChatMessageStreamMessage> {
  chatSidebarProps: ComponentProps<typeof ChatSidebar>;
  chatHeaderProps: ComponentProps<typeof ChatHeader>;
  chatThreadViewProps: Omit<ComponentProps<typeof ChatThreadView>, "hero" | "threadContent">;
  heroProps: ComponentProps<typeof ChatHero> | null;
  messageStreamProps: ChatMessageStreamProps<TMessage> | null;
  composerDockProps: ComponentProps<typeof ChatComposerDock>;
}

export function ChatWorkspaceCanvas<TMessage extends ChatMessageStreamMessage>(
  props: ChatWorkspaceCanvasProps<TMessage>,
) {
  const {
    chatSidebarProps,
    chatHeaderProps,
    chatThreadViewProps,
    heroProps,
    messageStreamProps,
    composerDockProps,
  } = props;

  return (
    <div className="relative flex h-full min-h-0">
      <ChatSidebar {...chatSidebarProps} />

      <div className="relative flex h-full min-h-0 flex-1 flex-col">
        <ChatHeader {...chatHeaderProps} />

        <ChatThreadView
          {...chatThreadViewProps}
          hero={heroProps ? <ChatHero {...heroProps} /> : null}
          threadContent={
            messageStreamProps ? <ChatMessageStream {...messageStreamProps} /> : null
          }
        />

        <ChatComposerDock {...composerDockProps} />
      </div>
    </div>
  );
}
