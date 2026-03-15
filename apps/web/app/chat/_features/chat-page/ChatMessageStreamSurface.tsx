"use client";

import {
  useChatMessageStreamProps,
  type UseChatMessageStreamPropsOptions,
} from "./useChatMessageStreamProps";
import {
  ChatMessageStream,
  type ChatMessageStreamMessage,
} from "../thread-history/ChatMessageStream";

export function ChatMessageStreamSurface<TMessage extends ChatMessageStreamMessage>(
  props: UseChatMessageStreamPropsOptions<TMessage>,
) {
  const messageStreamProps = useChatMessageStreamProps(props);

  if (!messageStreamProps) {
    return null;
  }

  return <ChatMessageStream {...messageStreamProps} />;
}
