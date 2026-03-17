"use client";

import { useEffect, useMemo, useState } from "react";

interface UseComposerPlaceholderStateOptions {
  prompts: string[];
  isPaused: boolean;
  intervalMs?: number;
}

function readReducedMotionPreference(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useComposerPlaceholderState(
  options: UseComposerPlaceholderStateOptions,
) {
  const { prompts, isPaused, intervalMs = 1800 } = options;
  const normalizedPrompts = useMemo(
    () => prompts.map((prompt) => prompt.trim()).filter(Boolean),
    [prompts],
  );
  const promptsKey = normalizedPrompts.join("\n");
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [isReducedMotion, setIsReducedMotion] = useState(readReducedMotionPreference);

  useEffect(() => {
    setPlaceholderIndex(0);
  }, [promptsKey]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = () => {
      setIsReducedMotion(mediaQuery.matches);
    };

    handleChange();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);

      return () => {
        mediaQuery.removeEventListener("change", handleChange);
      };
    }

    mediaQuery.addListener(handleChange);

    return () => {
      mediaQuery.removeListener(handleChange);
    };
  }, []);

  useEffect(() => {
    if (isReducedMotion || isPaused || normalizedPrompts.length <= 1) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setPlaceholderIndex((current) => (current + 1) % normalizedPrompts.length);
    }, intervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [intervalMs, isPaused, isReducedMotion, normalizedPrompts.length, promptsKey]);

  const activePlaceholder = normalizedPrompts[placeholderIndex] ?? "";

  return {
    activePlaceholder,
    placeholderAnimationKey: `${placeholderIndex}:${activePlaceholder}`,
    shouldAnimatePlaceholder:
      !isReducedMotion && !isPaused && normalizedPrompts.length > 1,
  };
}
