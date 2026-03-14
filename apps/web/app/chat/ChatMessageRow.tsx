"use client";

import { type ReactNode } from "react";

interface ChatMessageRowProps {
  messageId: string;
  role: "assistant" | "user";
  previousRole?: "assistant" | "user";
  index: number;
  children: ReactNode;
  onRegisterRef: (messageId: string, node: HTMLDivElement | null) => void;
}

export function ChatMessageRow(props: ChatMessageRowProps) {
  const spacingClassName =
    props.index === 0
      ? ""
      : props.previousRole !== props.role
        ? "mt-6"
        : "mt-3";
  const roleClassName =
    props.role === "assistant"
      ? "text-zinc-100"
      : "ml-auto w-fit rounded-[1.15rem] bg-white px-4 py-2 text-black";

  return (
    <div
      ref={(node) => props.onRegisterRef(props.messageId, node)}
      className={`${spacingClassName} max-w-[88%] px-4 py-3 text-sm leading-8 animate-fade-in-slide-up ${roleClassName}`}
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: props.role === "assistant" ? "0 320px" : "0 72px",
      }}
    >
      {props.children}
    </div>
  );
}
