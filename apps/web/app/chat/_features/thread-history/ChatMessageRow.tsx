"use client";

import { type ReactNode } from "react";

interface ChatMessageRowProps {
  messageId: string;
  role: "assistant" | "user";
  previousRole?: "assistant" | "user";
  index: number;
  children: ReactNode;
  userActions?: ReactNode;
  usePlainUserCard?: boolean;
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
      : props.usePlainUserCard
        ? "w-full max-w-full text-white"
        : "inline-block max-w-full rounded-[1.15rem] bg-[#202327] px-4 py-2 text-white";

  return (
    <div
      ref={(node) => props.onRegisterRef(props.messageId, node)}
      className={`${spacingClassName} group relative w-full px-4 py-3 text-sm leading-8 animate-fade-in-slide-up`}
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: props.role === "assistant" ? "0 320px" : "0 72px",
      }}
    >
      {props.role === "user" ? (
        <div className="relative ml-auto flex w-full max-w-[88%] flex-col items-end">
          <div className={roleClassName}>{props.children}</div>
          {props.userActions ? (
            <div className="flex h-10 items-start justify-end pt-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
              {props.userActions}
            </div>
          ) : null}
        </div>
      ) : (
        <div className={roleClassName}>{props.children}</div>
      )}
    </div>
  );
}
