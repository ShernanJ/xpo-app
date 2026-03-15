"use client";

import {
  useChatOverlayProps,
  type UseChatOverlayPropsOptions,
} from "./useChatOverlayProps";
import { ChatOverlays } from "./ChatOverlays";

export function ChatOverlaysController(props: UseChatOverlayPropsOptions) {
  const chatOverlayProps = useChatOverlayProps(props);

  return <ChatOverlays {...chatOverlayProps} />;
}
