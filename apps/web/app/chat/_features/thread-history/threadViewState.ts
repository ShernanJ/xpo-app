"use client";

export function resolveThreadViewState(params: {
  shouldCenterHero: boolean;
  isInlineDraftEditorOpen: boolean;
  threadTransitionPhase: "idle" | "out" | "in";
  isThreadHydrating: boolean;
}) {
  const {
    shouldCenterHero,
    isInlineDraftEditorOpen,
    threadTransitionPhase,
    isThreadHydrating,
  } = params;

  const chatCanvasClassName = `relative mx-auto flex min-h-full w-full flex-col gap-6 px-4 pb-[calc(11rem+var(--safe-area-bottom))] pt-8 sm:px-6 sm:pb-32 ${
    shouldCenterHero ? "justify-center" : ""
  } ${isInlineDraftEditorOpen ? "max-w-[86rem] lg:pr-[28rem] xl:pr-[29rem]" : "max-w-4xl"}`;
  const threadCanvasTransitionClassName = `transition-[filter,opacity,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[filter,opacity,transform] ${
    threadTransitionPhase === "out"
      ? "opacity-25 blur-[10px] scale-[0.995]"
      : "opacity-100 blur-0 scale-100"
  }`;
  const threadContentTransitionClassName = `transition-[opacity,filter,transform] duration-360 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[opacity,filter,transform] ${
    isThreadHydrating ? "opacity-0 blur-[7px] translate-y-1" : "opacity-100 blur-0 translate-y-0"
  }`;

  return {
    chatCanvasClassName,
    threadCanvasTransitionClassName,
    threadContentTransitionClassName,
  };
}
