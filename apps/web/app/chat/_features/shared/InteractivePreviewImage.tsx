"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2, X } from "lucide-react";

interface InteractivePreviewImageProps {
  src: string | null;
  alt: string;
  buttonLabel?: string;
  dialogLabel?: string;
  frameClassName?: string;
  imageClassName?: string;
  overlayClassName?: string;
  caption?: string | null;
}

export function InteractivePreviewImage(props: InteractivePreviewImageProps) {
  const {
    src,
    alt,
    buttonLabel = "Expand preview image",
    dialogLabel = "Expanded preview image",
    frameClassName = "group relative w-full max-w-[400px] overflow-hidden rounded-2xl border border-white/10 bg-[#050505]",
    imageClassName = "aspect-square w-full object-cover",
    overlayClassName = "pointer-events-none absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/65 text-white shadow-[0_8px_24px_rgba(0,0,0,0.35)]",
    caption = null,
  } = props;
  const [expanded, setExpanded] = useState(false);
  const [didFail, setDidFail] = useState(false);

  useEffect(() => {
    setDidFail(false);
  }, [src]);

  useEffect(() => {
    if (!expanded) {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExpanded(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [expanded]);

  if (!src || didFail) {
    return null;
  }

  const expandedModal =
    expanded && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[240] flex items-center justify-center bg-black/88 px-4 py-6 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            aria-label={dialogLabel}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setExpanded(false);
              }
            }}
          >
            <div className="relative w-full max-w-6xl">
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="absolute right-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
                aria-label="Close expanded image"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#050505] p-3 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
                <img
                  src={src}
                  alt={alt}
                  className="max-h-[88vh] w-full rounded-[1.2rem] object-contain"
                />
                {caption ? (
                  <p className="px-2 pb-1 pt-3 text-sm leading-6 text-zinc-300">{caption}</p>
                ) : null}
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className={frameClassName}
        aria-label={buttonLabel}
      >
        <img
          src={src}
          alt={alt}
          className={imageClassName}
          loading="lazy"
          onError={() => setDidFail(true)}
        />
        <span className={overlayClassName}>
          <Maximize2 className="h-4 w-4" />
        </span>
      </button>
      {expandedModal}
    </>
  );
}
