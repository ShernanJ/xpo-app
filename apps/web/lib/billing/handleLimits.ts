import { prisma } from "@/lib/db";

import { BILLING_HANDLE_LIMITS } from "@/lib/billing/config";
import { ensureBillingEntitlement } from "@/lib/billing/entitlements";
import { isMonetizationEnabled } from "./monetization";

function normalizeHandle(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/^@+/, "").trim().toLowerCase();
  return normalized || null;
}

export async function getKnownHandlesForUser(userId: string): Promise<string[]> {
  const [profiles, runs] = await Promise.all([
    prisma.voiceProfile.findMany({
      where: { userId },
      select: { xHandle: true },
    }),
    prisma.onboardingRun.findMany({
      where: { userId },
      select: { input: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  const fromProfiles = profiles
    .map((profile) => normalizeHandle(profile.xHandle))
    .filter((value): value is string => Boolean(value));

  const fromRuns = runs
    .map((run) => {
      const input = run.input as { account?: unknown };
      return typeof input?.account === "string"
        ? normalizeHandle(input.account)
        : null;
    })
    .filter((value): value is string => Boolean(value));

  return Array.from(new Set([...fromProfiles, ...fromRuns]));
}

export async function validateHandleLimit(args: {
  userId: string;
  targetHandle: string;
}): Promise<
  | {
      ok: true;
      plan: "free" | "pro" | "lifetime";
      limit: number | null;
      knownHandles: string[];
    }
  | {
      ok: false;
      code: "PLAN_REQUIRED";
      message: string;
      plan: "free" | "pro" | "lifetime";
      limit: number | null;
      knownHandles: string[];
    }
> {
  const normalizedTarget = normalizeHandle(args.targetHandle);
  const knownHandles = await getKnownHandlesForUser(args.userId);

  if (!isMonetizationEnabled()) {
    return {
      ok: true,
      plan: "free" as const,
      limit: null,
      knownHandles,
    };
  }

  const entitlement = await ensureBillingEntitlement(args.userId);
  const limit = BILLING_HANDLE_LIMITS[entitlement.plan];

  if (!normalizedTarget) {
    return {
      ok: true,
      plan: entitlement.plan,
      limit,
      knownHandles,
    };
  }

  if (knownHandles.includes(normalizedTarget)) {
    return {
      ok: true,
      plan: entitlement.plan,
      limit,
      knownHandles,
    };
  }

  if (typeof limit === "number" && knownHandles.length >= limit) {
    return {
      ok: false,
      code: "PLAN_REQUIRED",
      message: "Plan handle limit reached.",
      plan: entitlement.plan,
      limit,
      knownHandles,
    };
  }

  return {
    ok: true,
    plan: entitlement.plan,
    limit,
    knownHandles,
  };
}
