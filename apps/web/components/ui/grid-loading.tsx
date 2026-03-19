"use client";

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
  const containerSizes = {
    sm: "w-8 h-8",
    md: "w-12 h-12",
    lg: "w-16 h-16",
  };

  if (variant === "squares") {
    return (
      <div
        className={cn("relative", containerSizes[size], className)}
        role="status"
        aria-label={text}
      >
        <div className="grid h-full w-full grid-cols-3 gap-1" aria-hidden="true">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse bg-black dark:bg-gray-200"
              style={{
                animationDelay: `${i * 0.1}s`,
                animationDuration: "1.5s",
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  return null;
}
