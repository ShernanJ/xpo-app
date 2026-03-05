import { prisma } from "@/lib/db";
import type { BillingEntitlement, Prisma } from "@/lib/generated/prisma/client";

import {
  BILLING_RATE_LIMIT,
  LIFETIME_FAIR_USE_THRESHOLDS,
} from "@/lib/billing/config";
import { ensureBillingEntitlement } from "@/lib/billing/entitlements";
import { toBillingSnapshot } from "@/lib/billing/state";
import type { CreditConsumeResult } from "@/lib/billing/types";

async function countRecentDebits(args: {
  tx: Prisma.TransactionClient;
  userId: string;
  since: Date;
}): Promise<number> {
  return args.tx.creditLedgerEntry.count({
    where: {
      userId: args.userId,
      actionType: "debit",
      createdAt: {
        gte: args.since,
      },
    },
  });
}

function isEntitlementActive(entitlement: BillingEntitlement): boolean {
  if (entitlement.plan === "lifetime") {
    return entitlement.status === "active" || entitlement.status === "blocked_fair_use";
  }

  return entitlement.status === "active";
}

function fairUseHardStopReached(entitlement: BillingEntitlement): boolean {
  if (entitlement.plan !== "lifetime") {
    return false;
  }

  const used = entitlement.creditLimit - entitlement.creditsRemaining;
  return used >= LIFETIME_FAIR_USE_THRESHOLDS.hardStop;
}

export async function consumeCredits(args: {
  userId: string;
  cost: number;
  idempotencyKey: string;
  source: string;
  metadata?: Prisma.InputJsonObject;
}): Promise<CreditConsumeResult> {
  const normalizedCost = Math.max(0, Math.floor(args.cost));
  const entitlement = await ensureBillingEntitlement(args.userId);

  if (normalizedCost === 0) {
    return {
      ok: true,
      cost: 0,
      idempotencyKey: args.idempotencyKey,
      entitlement,
      snapshot: toBillingSnapshot(entitlement),
    };
  }

  if (!isEntitlementActive(entitlement)) {
    return {
      ok: false,
      reason: "ENTITLEMENT_INACTIVE",
      entitlement,
      snapshot: toBillingSnapshot(entitlement),
    };
  }

  if (fairUseHardStopReached(entitlement)) {
    if (entitlement.status !== "blocked_fair_use") {
      await prisma.billingEntitlement.update({
        where: { id: entitlement.id },
        data: {
          status: "blocked_fair_use",
          fairUseBlockedAt: new Date(),
        },
      });
    }

    return {
      ok: false,
      reason: "LIFETIME_HARD_STOP",
      entitlement,
      snapshot: toBillingSnapshot(entitlement),
    };
  }

  const result = await prisma.$transaction(async (tx) => {
    const existingLedger = await tx.creditLedgerEntry.findUnique({
      where: {
        idempotencyKey: args.idempotencyKey,
      },
    });

    if (existingLedger) {
      const currentEntitlement = await tx.billingEntitlement.findUniqueOrThrow({
        where: { userId: args.userId },
      });
      return {
        kind: "idempotent" as const,
        entitlement: currentEntitlement,
      };
    }

    const currentEntitlement = await tx.billingEntitlement.findUniqueOrThrow({
      where: {
        userId: args.userId,
      },
    });

    const recentDebits = await countRecentDebits({
      tx,
      userId: args.userId,
      since: new Date(Date.now() - 60_000),
    });
    const perMinuteLimit =
      currentEntitlement.plan === "free"
        ? BILLING_RATE_LIMIT.freePerMinute
        : BILLING_RATE_LIMIT.paidPerMinute;

    if (recentDebits >= perMinuteLimit) {
      return {
        kind: "rate_limited" as const,
        entitlement: currentEntitlement,
      };
    }

    if (currentEntitlement.creditsRemaining < normalizedCost) {
      return {
        kind: "insufficient" as const,
        entitlement: currentEntitlement,
      };
    }

    const updateResult = await tx.billingEntitlement.updateMany({
      where: {
        id: currentEntitlement.id,
        creditsRemaining: {
          gte: normalizedCost,
        },
      },
      data: {
        creditsRemaining: {
          decrement: normalizedCost,
        },
      },
    });

    if (updateResult.count === 0) {
      const refreshedEntitlement = await tx.billingEntitlement.findUniqueOrThrow({
        where: { id: currentEntitlement.id },
      });
      return {
        kind: "insufficient" as const,
        entitlement: refreshedEntitlement,
      };
    }

    const debitedEntitlement = await tx.billingEntitlement.findUniqueOrThrow({
      where: { id: currentEntitlement.id },
    });

    await tx.creditLedgerEntry.create({
      data: {
        userId: args.userId,
        billingEntitlementId: currentEntitlement.id,
        actionType: "debit",
        deltaCredits: -normalizedCost,
        balanceAfter: debitedEntitlement.creditsRemaining,
        idempotencyKey: args.idempotencyKey,
        source: args.source,
        metadata: args.metadata,
      },
    });

    return {
      kind: "ok" as const,
      entitlement: debitedEntitlement,
    };
  });

  if (result.kind === "ok" || result.kind === "idempotent") {
    return {
      ok: true,
      cost: normalizedCost,
      idempotencyKey: args.idempotencyKey,
      entitlement: result.entitlement,
      snapshot: toBillingSnapshot(result.entitlement),
    };
  }

  if (result.kind === "rate_limited") {
    return {
      ok: false,
      reason: "RATE_LIMITED",
      entitlement: result.entitlement,
      snapshot: toBillingSnapshot(result.entitlement),
      retryAfterSeconds: 60,
    };
  }

  return {
    ok: false,
    reason: "INSUFFICIENT_CREDITS",
    entitlement: result.entitlement,
    snapshot: toBillingSnapshot(result.entitlement),
  };
}

export async function refundCredits(args: {
  userId: string;
  amount: number;
  idempotencyKey: string;
  source: string;
  metadata?: Prisma.InputJsonObject;
}): Promise<BillingEntitlement> {
  const normalizedAmount = Math.max(0, Math.floor(args.amount));
  const entitlement = await ensureBillingEntitlement(args.userId);

  if (normalizedAmount === 0) {
    return entitlement;
  }

  return prisma.$transaction(async (tx) => {
    const existingLedger = await tx.creditLedgerEntry.findUnique({
      where: {
        idempotencyKey: args.idempotencyKey,
      },
    });

    if (existingLedger) {
      return tx.billingEntitlement.findUniqueOrThrow({
        where: {
          userId: args.userId,
        },
      });
    }

    const currentEntitlement = await tx.billingEntitlement.findUniqueOrThrow({
      where: {
        userId: args.userId,
      },
    });

    const maxLimit = currentEntitlement.creditLimit;
    const nextRemaining = Math.min(
      maxLimit,
      currentEntitlement.creditsRemaining + normalizedAmount,
    );
    const appliedDelta = nextRemaining - currentEntitlement.creditsRemaining;

    const updated = await tx.billingEntitlement.update({
      where: {
        id: currentEntitlement.id,
      },
      data: {
        creditsRemaining: nextRemaining,
      },
    });

    await tx.creditLedgerEntry.create({
      data: {
        userId: args.userId,
        billingEntitlementId: currentEntitlement.id,
        actionType: "refund",
        deltaCredits: appliedDelta,
        balanceAfter: updated.creditsRemaining,
        idempotencyKey: args.idempotencyKey,
        source: args.source,
        metadata: args.metadata,
      },
    });

    return updated;
  });
}
