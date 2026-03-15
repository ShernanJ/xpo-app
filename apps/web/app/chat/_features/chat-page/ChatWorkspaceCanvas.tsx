"use client";

import { ChatComposerDock } from "../composer/ChatComposerDock";
import { ChatHero } from "../composer/ChatHero";
import {
  ChatMessageStream,
  type ChatMessageStreamMessage,
  type ChatMessageStreamProps,
} from "../thread-history/ChatMessageStream";
import { ChatThreadView } from "../thread-history/ChatThreadView";
import {
  ChatCanvasProvider,
  type ChatCanvasProviderProps,
} from "./ChatCanvasContext";
import { ChatHeader } from "../workspace-chrome/ChatHeader";
import {
  ChatWorkspaceChromeProvider,
  type ChatWorkspaceChromeProviderProps,
} from "../workspace-chrome/ChatWorkspaceChromeContext";
import { ChatSidebar } from "../workspace-chrome/ChatSidebar";

interface ChatWorkspaceCanvasProps<TMessage extends ChatMessageStreamMessage> {
  workspaceChromeProps: Omit<ChatWorkspaceChromeProviderProps, "children">;
  canvasProps: Omit<ChatCanvasProviderProps, "children">;
  messageStreamProps: ChatMessageStreamProps<TMessage> | null;
}

export function ChatWorkspaceCanvas<TMessage extends ChatMessageStreamMessage>(
  props: ChatWorkspaceCanvasProps<TMessage>,
) {
  const {
    workspaceChromeProps,
    canvasProps,
    messageStreamProps,
  } = props;

  return (
    <ChatWorkspaceChromeProvider {...workspaceChromeProps}>
      <ChatCanvasProvider {...canvasProps}>
        <div className="relative flex h-full min-h-0">
          <ChatSidebar />

          <div className="relative flex h-full min-h-0 flex-1 flex-col">
            <ChatHeader />

            <ChatThreadView
              hero={<ChatHero />}
              threadContent={
                messageStreamProps ? <ChatMessageStream {...messageStreamProps} /> : null
              }
            />

            <ChatComposerDock />
          </div>
        </div>
      </ChatCanvasProvider>
    </ChatWorkspaceChromeProvider>
  );
}
