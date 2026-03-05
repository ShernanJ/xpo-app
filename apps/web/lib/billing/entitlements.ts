import { prisma } from "@/lib/db";
import type {
  BillingCycle,
  BillingEntitlement,
  BillingPlan,
  BillingStatus,
  Prisma,
} from "@/lib/generated/prisma/client";

import {
  BILLING_CREDIT_LIMITS,
  BILLING_RESET_INTERVAL_DAYS,
} from "@/lib/billing/config";
import { getLifetimeSlotsSummary } from "@/lib/billing/lifetimeSlots";
import { toBillingStatePayload } from "@/lib/billing/state";
import type { BillingStatePayload } from "@/lib/billing/types";

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function getNextResetDate(from: Date = new Date()): Date {
  return addDays(from, BILLING_RESET_INTERVAL_DAYS);
}

function getCreditLimit(plan: BillingPlan): number {
  return BILLING_CREDIT_LIMITS[plan] ?? BILLING_CREDIT_LIMITS.free;
}

function getMonthlyCycle(plan: BillingPlan): BillingCycle {
  return plan === "pro" ? "monthly" : plan === "lifetime" ? "lifetime" : "monthly";
}

function nextCycleFromCurrent(current: Date, now: Date): Date {
  let next = new Date(current);
  while (next <= now) {
    next = addDays(next, BILLING_RESET_INTERVAL_DAYS);
  }
  return next;
}

async function upsertDefaultEntitlement(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<BillingEntitlement> {
  const now = new Date();
  const existing = await tx.billingEntitlement.findUnique({
    where: { userId },
  });

  if (existing) {
    return existing;
  }

  const created = await tx.billingEntitlement.create({
    data: {
      userId,
      plan: "free",
      status: "active",
      billingCycle: "monthly",
      creditsRemaining: BILLING_CREDIT_LIMITS.free,
      creditLimit: BILLING_CREDIT_LIMITS.free,
      creditCycleResetsAt: getNextResetDate(now),
      showFirstPricingModal: true,
    },
  });

  await tx.creditLedgerEntry.create({
    data: {
      userId,
      billingEntitlementId: created.id,
      actionType: "migration_grant",
      deltaCredits: created.creditsRemaining,
      balanceAfter: created.creditsRemaining,
      source: "entitlement_init",
      idempotencyKey: `entitlement-init:${userId}`,
      metadata: { reason: "Initial free credits" },
    },
  });

  return created;
}

async function resetCreditsIfNeeded(
  tx: Prisma.TransactionClient,
  entitlement: BillingEntitlement,
): Promise<BillingEntitlement> {
  const now = new Date();
  if (entitlement.creditCycleResetsAt > now) {
    const expectedLimit = getCreditLimit(entitlement.plan);
    if (entitlement.creditLimit === expectedLimit) {
      return entitlement;
    }

    return tx.billingEntitlement.update({
      where: { id: entitlement.id },
      data: {
        creditLimit: expectedLimit,
        creditsRemaining: Math.min(entitlement.creditsRemaining, expectedLimit),
      },
    });
  }

  const nextReset = nextCycleFromCurrent(entitlement.creditCycleResetsAt, now);
  const nextLimit = getCreditLimit(entitlement.plan);
  const nextRemaining = nextLimit;
  const delta = nextRemaining - entitlement.creditsRemaining;

  const updated = await tx.billingEntitlement.update({
    where: { id: entitlement.id },
    data: {
      creditLimit: nextLimit,
      creditsRemaining: nextRemaining,
      creditCycleResetsAt: nextReset,
      fairUseSoftWarningAt:
        entitlement.plan === "lifetime" ? entitlement.fairUseSoftWarningAt : null,
      fairUseReviewAt: entitlement.plan === "lifetime" ? entitlement.fairUseReviewAt : null,
      fairUseBlockedAt: entitlement.plan === "lifetime" ? entitlement.fairUseBlockedAt : null,
      ...(entitlement.status === "blocked_fair_use" && entitlement.plan === "lifetime"
        ? { status: "active" as BillingStatus }
        : {}),
    },
  });

  await tx.creditLedgerEntry.create({
    data: {
      userId: entitlement.userId,
      billingEntitlementId: entitlement.id,
      actionType: "monthly_grant",
      deltaCredits: delta,
      balanceAfter: nextRemaining,
      source: "cycle_reset",
      idempotencyKey: `cycle-reset:${entitlement.userId}:${nextReset.toISOString()}`,
      metadata: {
        previousRemaining: entitlement.creditsRemaining,
        nextLimit,
      },
    },
  });

  return updated;
}

export async function ensureBillingEntitlement(userId: string): Promise<BillingEntitlement> {
  return prisma.$transaction(async (tx) => {
    const entitlement = await upsertDefaultEntitlement(tx, userId);
    return resetCreditsIfNeeded(tx, entitlement);
  });
}

export async function markPricingModalSeen(userId: string): Promise<BillingEntitlement> {
  await ensureBillingEntitlement(userId);
  return prisma.billingEntitlement.update({
    where: { userId },
    data: {
      showFirstPricingModal: false,
    },
  });
}

export async function setBillingStatus(args: {
  userId: string;
  status: BillingStatus;
}): Promise<BillingEntitlement> {
  await ensureBillingEntitlement(args.userId);
  return prisma.billingEntitlement.update({
    where: { userId: args.userId },
    data: { status: args.status },
  });
}

export async function activateProEntitlement(args: {
  userId: string;
  cycle: "monthly" | "annual";
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripePriceId?: string | null;
}): Promise<BillingEntitlement> {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const entitlement = await upsertDefaultEntitlement(tx, args.userId);
    const nextLimit = getCreditLimit("pro");
    const nextRemaining = Math.max(entitlement.creditsRemaining, nextLimit);

    const updated = await tx.billingEntitlement.update({
      where: { id: entitlement.id },
      data: {
        plan: "pro",
        status: "active",
        billingCycle: args.cycle === "annual" ? "annual" : "monthly",
        creditLimit: nextLimit,
        creditsRemaining: nextRemaining,
        creditCycleResetsAt:
          entitlement.creditCycleResetsAt > now
            ? entitlement.creditCycleResetsAt
            : getNextResetDate(now),
        showFirstPricingModal: false,
        ...(args.stripeCustomerId ? { stripeCustomerId: args.stripeCustomerId } : {}),
        ...(args.stripeSubscriptionId ? { stripeSubscriptionId: args.stripeSubscriptionId } : {}),
        ...(args.stripePriceId ? { stripePriceId: args.stripePriceId } : {}),
      },
    });

    if (nextRemaining > entitlement.creditsRemaining) {
      await tx.creditLedgerEntry.create({
        data: {
          userId: args.userId,
          billingEntitlementId: entitlement.id,
          actionType: "manual_adjustment",
          deltaCredits: nextRemaining - entitlement.creditsRemaining,
          balanceAfter: nextRemaining,
          source: "upgrade_pro",
          idempotencyKey: `upgrade-pro:${args.userId}:${updated.updatedAt.toISOString()}`,
          metadata: { cycle: args.cycle },
        },
      });
    }

    return updated;
  });
}

export async function activateLifetimeEntitlement(args: {
  userId: string;
  stripeCustomerId?: string | null;
  stripePriceId?: string | null;
}): Promise<BillingEntitlement> {
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const entitlement = await upsertDefaultEntitlement(tx, args.userId);
    const nextLimit = getCreditLimit("lifetime");
    const nextRemaining = Math.max(entitlement.creditsRemaining, nextLimit);

    const updated = await tx.billingEntitlement.update({
      where: { id: entitlement.id },
      data: {
        plan: "lifetime",
        status: "active",
        billingCycle: "lifetime",
        creditLimit: nextLimit,
        creditsRemaining: nextRemaining,
        creditCycleResetsAt:
          entitlement.creditCycleResetsAt > now
            ? entitlement.creditCycleResetsAt
            : getNextResetDate(now),
        showFirstPricingModal: false,
        lifetimeGrantedAt: entitlement.lifetimeGrantedAt ?? now,
        stripeSubscriptionId: null,
        ...(args.stripeCustomerId ? { stripeCustomerId: args.stripeCustomerId } : {}),
        ...(args.stripePriceId ? { stripePriceId: args.stripePriceId } : {}),
      },
    });

    if (nextRemaining > entitlement.creditsRemaining) {
      await tx.creditLedgerEntry.create({
        data: {
          userId: args.userId,
          billingEntitlementId: entitlement.id,
          actionType: "manual_adjustment",
          deltaCredits: nextRemaining - entitlement.creditsRemaining,
          balanceAfter: nextRemaining,
          source: "upgrade_lifetime",
          idempotencyKey: `upgrade-lifetime:${args.userId}:${updated.updatedAt.toISOString()}`,
          metadata: { fairUse: true },
        },
      });
    }

    return updated;
  });
}

export async function downgradeToFreeEntitlement(args: {
  userId: string;
  clearStripeSubscription?: boolean;
}): Promise<BillingEntitlement> {
  await ensureBillingEntitlement(args.userId);
  const nextLimit = BILLING_CREDIT_LIMITS.free;

  return prisma.billingEntitlement.update({
    where: { userId: args.userId },
    data: {
      plan: "free",
      status: "active",
      billingCycle: "monthly",
      creditLimit: nextLimit,
      creditsRemaining: Math.min(nextLimit, nextLimit),
      creditCycleResetsAt: getNextResetDate(new Date()),
      ...(args.clearStripeSubscription ? { stripeSubscriptionId: null } : {}),
    },
  });
}

export async function setEntitlementCustomerId(args: {
  userId: string;
  stripeCustomerId: string;
}): Promise<void> {
  await ensureBillingEntitlement(args.userId);
  await prisma.billingEntitlement.update({
    where: { userId: args.userId },
    data: { stripeCustomerId: args.stripeCustomerId },
  });
}

export async function getBillingStateForUser(userId: string): Promise<BillingStatePayload> {
  const entitlement = await ensureBillingEntitlement(userId);
  const lifetimeSlots = await getLifetimeSlotsSummary();

  return toBillingStatePayload({
    entitlement,
    lifetimeSlots,
  });
}

export function resolveCycleFromOffer(offer: "pro_monthly" | "pro_annual"): "monthly" | "annual" {
  return offer === "pro_annual" ? "annual" : "monthly";
}

export function resolveCycleFromPriceInterval(interval?: string | null): BillingCycle {
  if (interval === "year") {
    return "annual";
  }

  return "monthly";
}

export function defaultCycleForPlan(plan: BillingPlan): BillingCycle {
  return getMonthlyCycle(plan);
}
