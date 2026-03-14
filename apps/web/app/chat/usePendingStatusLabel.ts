"use client";

import { useEffect, useState } from "react";

import {
  resolvePendingStatusLabel,
  type PendingStatusPlan,
} from "./pendingStatus.ts";

export function usePendingStatusLabel(args: {
  isActive: boolean;
  plan: PendingStatusPlan | null;
  backendStatus?: string | null;
}): string | null {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!args.isActive || !args.plan) {
      setElapsedMs(0);
      return;
    }

    setElapsedMs(0);
    const secondStepDelay = args.plan.steps[1]?.afterMs;
    if (typeof secondStepDelay !== "number") {
      return;
    }

    const timeout = window.setTimeout(() => {
      setElapsedMs(secondStepDelay);
    }, secondStepDelay);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [args.isActive, args.plan]);

  if (!args.isActive) {
    return null;
  }

  return resolvePendingStatusLabel({
    plan: args.plan,
    elapsedMs,
    backendStatus: args.backendStatus,
  });
}
