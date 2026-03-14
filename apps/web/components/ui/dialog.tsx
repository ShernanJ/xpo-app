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

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  children: ReactNode;
  panelClassName?: string;
  contentClassName?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
}

export function Dialog(props: DialogProps) {
  const {
    open,
    onOpenChange,
    title,
    description,
    eyebrow,
    children,
    panelClassName,
    contentClassName,
    initialFocusRef,
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
      className="absolute inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/80 px-4 py-4 sm:items-center sm:py-8"
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
          "relative my-auto flex w-full max-w-lg flex-col rounded-[1.75rem] border border-white/10 bg-[#0F0F0F] shadow-2xl focus:outline-none"
        }
      >
        <div
          className={
            contentClassName ??
            "border-b border-white/10 px-6 py-5"
          }
        >
          {eyebrow ? (
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
              {eyebrow}
            </p>
          ) : null}
          <h2 id={titleId} className={eyebrow ? "mt-3 text-2xl font-semibold text-white" : "text-2xl font-semibold text-white"}>
            {title}
          </h2>
          {description ? (
            <p
              id={descriptionId}
              className="mt-3 text-sm leading-7 text-zinc-400"
            >
              {description}
            </p>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  );
}
