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
  const [advancedPlanKey, setAdvancedPlanKey] = useState<string | null>(null);
  const planKey = args.isActive && args.plan ? JSON.stringify(args.plan) : null;
  const secondStepDelay = args.plan?.steps[1]?.afterMs;

  useEffect(() => {
    if (!planKey || typeof secondStepDelay !== "number") {
      return;
    }

    const timeout = window.setTimeout(() => {
      setAdvancedPlanKey(planKey);
    }, secondStepDelay);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [planKey, secondStepDelay]);

  if (!args.isActive) {
    return null;
  }

  const elapsedMs =
    planKey && planKey === advancedPlanKey && typeof secondStepDelay === "number"
      ? secondStepDelay
      : 0;

  return resolvePendingStatusLabel({
    plan: args.plan,
    elapsedMs,
    backendStatus: args.backendStatus,
  });
}
