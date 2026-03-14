"use client";

import type { ReactNode } from "react";

export function DesktopDraftEditorDock(props: { children: ReactNode }) {
  return (
    <div className="pointer-events-none fixed bottom-32 right-4 top-24 z-20 hidden lg:block xl:right-6">
      <div className="pointer-events-auto h-full w-[25.5rem] max-w-[calc(100vw-24rem)]">
        {props.children}
      </div>
    </div>
  );
}

export function MobileDraftEditorDock(props: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-4 bottom-20 top-20 z-20 lg:hidden sm:inset-x-6 sm:bottom-16 sm:top-16 md:bottom-24 md:left-auto md:right-6 md:top-24 md:w-[26rem] md:max-w-[calc(100vw-3rem)]">
      {props.children}
    </div>
  );
}
