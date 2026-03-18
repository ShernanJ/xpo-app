"use client";

import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
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
  resizable?: boolean;
  defaultLeftPaneWidth?: number;
  minLeftPaneWidth?: number;
  maxLeftPaneWidth?: number;
}

function clampPaneWidth(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
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
    resizable = false,
    defaultLeftPaneWidth = 44,
    minLeftPaneWidth = 34,
    maxLeftPaneWidth = 68,
  } = props;
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const panesRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const [leftPaneWidth, setLeftPaneWidth] = useState(() =>
    clampPaneWidth(defaultLeftPaneWidth, minLeftPaneWidth, maxLeftPaneWidth),
  );
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    setLeftPaneWidth(clampPaneWidth(defaultLeftPaneWidth, minLeftPaneWidth, maxLeftPaneWidth));
  }, [defaultLeftPaneWidth, maxLeftPaneWidth, minLeftPaneWidth]);

  useEffect(() => {
    if (!resizable || !isResizing) {
      return;
    }

    function updatePaneWidth(clientX: number) {
      const panes = panesRef.current;
      if (!panes) {
        return;
      }

      const bounds = panes.getBoundingClientRect();
      if (bounds.width <= 0) {
        return;
      }

      const nextWidth = ((clientX - bounds.left) / bounds.width) * 100;
      setLeftPaneWidth(
        clampPaneWidth(nextWidth, minLeftPaneWidth, maxLeftPaneWidth),
      );
    }

    function handleMouseMove(event: MouseEvent) {
      updatePaneWidth(event.clientX);
    }

    function handleMouseUp() {
      setIsResizing(false);
    }

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, maxLeftPaneWidth, minLeftPaneWidth, resizable]);

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

  const panesStyle = resizable
    ? ({
        "--split-left-pane-width": `${leftPaneWidth}%`,
      } as CSSProperties)
    : undefined;

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
          "fixed inset-x-2 bottom-2 top-2 flex flex-col overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#0B0B0B] shadow-[0_32px_120px_rgba(0,0,0,0.58)] focus:outline-none sm:inset-x-4 sm:bottom-4 sm:top-4 sm:rounded-[1.75rem] md:bottom-auto md:left-1/2 md:top-1/2 md:w-[calc(100dvw-32px)] md:max-w-[1600px] md:-translate-x-1/2 md:-translate-y-1/2 lg:w-5/6"
        }
      >
        <div className="sr-only">
          <h2 id={titleId}>{title}</h2>
          {description ? <p id={descriptionId}>{description}</p> : null}
        </div>

        {headerSlot ? (
          <div className="border-b border-white/10 px-3 sm:px-5">{headerSlot}</div>
        ) : null}

        <div
          ref={panesRef}
          style={panesStyle}
          className={[
            "relative grid min-h-0 flex-1 grid-cols-1 md:h-[min(80dvh,820px)]",
            resizable
              ? "md:[grid-template-columns:var(--split-left-pane-width)_minmax(0,1fr)]"
              : "md:grid-cols-[minmax(320px,44%)_minmax(0,1fr)]",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <section
            className={[
              "min-h-0 overflow-hidden",
              resizable ? "" : "md:border-r md:border-white/10",
              mobilePane === "right" ? "hidden md:block" : "block",
              leftPaneClassName ?? "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {leftPane}
          </section>

          {resizable ? (
            <div
              data-testid="split-dialog-resize-handle"
              aria-hidden="true"
              onMouseDown={(event) => {
                event.preventDefault();
                setIsResizing(true);
              }}
              className="absolute bottom-0 top-0 z-10 hidden w-4 -translate-x-1/2 cursor-col-resize md:block"
              style={{ left: `calc(${leftPaneWidth}% - 1px)` }}
            >
              <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/10" />
              <div
                className={`absolute left-1/2 top-1/2 h-16 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition ${
                  isResizing ? "bg-white/35" : "bg-white/15"
                }`}
              />
            </div>
          ) : null}

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
