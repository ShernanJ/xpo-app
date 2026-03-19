"use client";

import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

interface UniqueLoadingProps {
  variant?: "squares";
  size?: "sm" | "md" | "lg";
  text?: string;
  className?: string;
}

export default function UniqueLoading({
  variant = "squares",
  size = "md",
  text = "Loading...",
  className,
}: UniqueLoadingProps) {
  const prefersReducedMotion = useReducedMotion();
  const containerSizes = {
    sm: "w-8 h-8",
    md: "w-12 h-12",
    lg: "w-16 h-16",
  };
  const squareExitOffsets = [
    { x: -14, y: -16, rotate: -12 },
    { x: 0, y: -20, rotate: -6 },
    { x: 15, y: -14, rotate: 10 },
    { x: -18, y: -2, rotate: -14 },
    { x: 0, y: 0, rotate: 0 },
    { x: 18, y: 0, rotate: 14 },
    { x: -13, y: 16, rotate: -10 },
    { x: 0, y: 20, rotate: 6 },
    { x: 14, y: 14, rotate: 12 },
  ];

  if (variant === "squares") {
    return (
      <motion.div
        className={cn("relative", containerSizes[size], className)}
        role="status"
        aria-label={text}
        initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.92, filter: "blur(8px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        exit={
          prefersReducedMotion
            ? { opacity: 0 }
            : {
                opacity: 0,
                scale: 1.08,
                filter: "blur(12px)",
              }
        }
        transition={{ duration: prefersReducedMotion ? 0 : 0.28, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="grid h-full w-full grid-cols-3 gap-1" aria-hidden="true">
          {Array.from({ length: 9 }).map((_, i) => (
            <motion.div
              key={i}
              className="animate-pulse bg-black dark:bg-gray-200"
              style={{
                animationDelay: `${i * 0.1}s`,
                animationDuration: "1.5s",
              }}
              initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={
                prefersReducedMotion
                  ? { opacity: 0 }
                  : {
                      opacity: 0,
                      scale: 0.2,
                      x: squareExitOffsets[i]?.x ?? 0,
                      y: squareExitOffsets[i]?.y ?? 0,
                      rotate: squareExitOffsets[i]?.rotate ?? 0,
                      filter: "blur(6px)",
                    }
              }
              transition={{
                duration: prefersReducedMotion ? 0 : 0.34,
                delay: prefersReducedMotion ? 0 : i * 0.018,
                ease: [0.16, 1, 0.3, 1],
              }}
            />
          ))}
        </div>
      </motion.div>
    );
  }

  return null;
}
