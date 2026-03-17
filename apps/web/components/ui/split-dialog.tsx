"use client";

import {
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
} from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

type SplitDialogMobilePane = "left" | "right";

interface SplitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  headerSlot?: ReactNode;
  leftPane: ReactNode;
  rightPane: ReactNode;
  footerSlot?: ReactNode;
  mobilePane?: SplitDialogMobilePane;
  initialFocusRef?: RefObject<HTMLElement | null>;
  panelClassName?: string;
  leftPaneClassName?: string;
  rightPaneClassName?: string;
}

export function SplitDialog(props: SplitDialogProps) {
  const {
    open,
    onOpenChange,
    title,
    description,
    headerSlot,
    leftPane,
    rightPane,
    footerSlot,
    mobilePane = "left",
    initialFocusRef,
    panelClassName,
    leftPaneClassName,
    rightPaneClassName,
  } = props;
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    previousActiveElementRef.current = document.activeElement as HTMLElement | null;

    const focusTarget = initialFocusRef?.current ?? panelRef.current;
    focusTarget?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const panel = panelRef.current;
      if (!panel) {
        return;
      }

      const focusableElements = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusableElements.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const firstFocusableElement = focusableElements[0];
      const lastFocusableElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (activeElement === firstFocusableElement || activeElement === panel) {
          event.preventDefault();
          lastFocusableElement?.focus();
        }
        return;
      }

      if (activeElement === lastFocusableElement) {
        event.preventDefault();
        firstFocusableElement?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousActiveElementRef.current?.focus();
    };
  }, [initialFocusRef, onOpenChange, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[95] bg-black/70 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onOpenChange(false);
        }
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={
          panelClassName ??
          "fixed left-1/2 top-1/2 flex w-full max-w-[1600px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#0B0B0B] shadow-[0_32px_120px_rgba(0,0,0,0.58)] focus:outline-none md:w-[calc(100dvw-32px)] lg:w-5/6"
        }
      >
        <div className="sr-only">
          <h2 id={titleId}>{title}</h2>
          {description ? <p id={descriptionId}>{description}</p> : null}
        </div>

        {headerSlot ? (
          <div className="border-b border-white/10 px-3 sm:px-5">{headerSlot}</div>
        ) : null}

        <div className="grid h-[calc(100dvh-2rem)] min-h-0 grid-cols-1 md:h-[min(80dvh,820px)] md:grid-cols-[minmax(320px,44%)_minmax(0,1fr)]">
          <section
            className={[
              "min-h-0 overflow-hidden md:border-r md:border-white/10",
              mobilePane === "right" ? "hidden md:block" : "block",
              leftPaneClassName ?? "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {leftPane}
          </section>

          <section
            className={[
              "min-h-0 overflow-hidden",
              mobilePane === "left" ? "hidden md:block" : "block",
              rightPaneClassName ?? "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {rightPane}
          </section>
        </div>

        {footerSlot ? (
          <div className="border-t border-white/10 px-2 py-1.5">{footerSlot}</div>
        ) : null}
      </div>
    </div>
  );
}
