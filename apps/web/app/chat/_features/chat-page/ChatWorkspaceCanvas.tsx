"use client";

import type { ReactNode } from "react";
import { LayoutGroup } from "framer-motion";

import { ChatComposerDock } from "../composer/ChatComposerDock";
import { ChatHero } from "../composer/ChatHero";
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

interface ChatWorkspaceCanvasProps {
  workspaceChromeProps: Omit<ChatWorkspaceChromeProviderProps, "children">;
  canvasProps: Omit<ChatCanvasProviderProps, "children">;
  threadContent: ReactNode;
}

export function ChatWorkspaceCanvas(props: ChatWorkspaceCanvasProps) {
  const {
    workspaceChromeProps,
    canvasProps,
    threadContent,
  } = props;

  return (
    <ChatWorkspaceChromeProvider {...workspaceChromeProps}>
      <ChatCanvasProvider {...canvasProps}>
        <div className="relative flex h-full min-h-0">
          <ChatSidebar />

          <LayoutGroup id="chat-composer-handoff">
            <div className="relative flex h-full min-h-0 flex-1 flex-col">
              <ChatHeader />

              <ChatThreadView
                hero={<ChatHero />}
                threadContent={threadContent}
              />

              <ChatComposerDock />
            </div>
          </LayoutGroup>
        </div>
      </ChatCanvasProvider>
    </ChatWorkspaceChromeProvider>
  );
}
