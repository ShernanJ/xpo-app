CREATE TYPE "BillingPlan" AS ENUM ('free', 'pro', 'lifetime');
CREATE TYPE "BillingStatus" AS ENUM ('active', 'past_due', 'canceled', 'blocked_fair_use');
CREATE TYPE "BillingCycle" AS ENUM ('monthly', 'annual', 'lifetime');
CREATE TYPE "CreditActionType" AS ENUM ('monthly_grant', 'debit', 'refund', 'manual_adjustment', 'migration_grant');
CREATE TYPE "LifetimeReservationStatus" AS ENUM ('pending', 'completed', 'expired', 'canceled');

CREATE TABLE "BillingEntitlement" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "plan" "BillingPlan" NOT NULL DEFAULT 'free',
  "status" "BillingStatus" NOT NULL DEFAULT 'active',
  "billingCycle" "BillingCycle" NOT NULL DEFAULT 'monthly',
  "stripeCustomerId" TEXT,
  "stripeSubscriptionId" TEXT,
  "stripePriceId" TEXT,
  "creditsRemaining" INTEGER NOT NULL DEFAULT 30,
  "creditLimit" INTEGER NOT NULL DEFAULT 30,
  "creditCycleResetsAt" TIMESTAMP(3) NOT NULL,
  "showFirstPricingModal" BOOLEAN NOT NULL DEFAULT true,
  "lifetimeGrantedAt" TIMESTAMP(3),
  "fairUseSoftWarningAt" TIMESTAMP(3),
  "fairUseReviewAt" TIMESTAMP(3),
  "fairUseBlockedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingEntitlement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CreditLedgerEntry" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "billingEntitlementId" TEXT,
  "actionType" "CreditActionType" NOT NULL,
  "deltaCredits" INTEGER NOT NULL,
  "balanceAfter" INTEGER NOT NULL,
  "idempotencyKey" TEXT,
  "source" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreditLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StripeWebhookEvent" (
  "id" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'processing',
  "errorMessage" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LifetimeSlotReservation" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "stripeCheckoutSessionId" TEXT,
  "status" "LifetimeReservationStatus" NOT NULL DEFAULT 'pending',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  CONSTRAINT "LifetimeSlotReservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingEntitlement_userId_key" ON "BillingEntitlement"("userId");
CREATE UNIQUE INDEX "BillingEntitlement_stripeCustomerId_key" ON "BillingEntitlement"("stripeCustomerId");
CREATE INDEX "BillingEntitlement_plan_status_idx" ON "BillingEntitlement"("plan", "status");
CREATE INDEX "BillingEntitlement_creditCycleResetsAt_idx" ON "BillingEntitlement"("creditCycleResetsAt");

CREATE UNIQUE INDEX "CreditLedgerEntry_idempotencyKey_key" ON "CreditLedgerEntry"("idempotencyKey");
CREATE INDEX "CreditLedgerEntry_userId_createdAt_idx" ON "CreditLedgerEntry"("userId", "createdAt");
CREATE INDEX "CreditLedgerEntry_billingEntitlementId_createdAt_idx" ON "CreditLedgerEntry"("billingEntitlementId", "createdAt");

CREATE UNIQUE INDEX "LifetimeSlotReservation_stripeCheckoutSessionId_key" ON "LifetimeSlotReservation"("stripeCheckoutSessionId");
CREATE INDEX "LifetimeSlotReservation_status_expiresAt_idx" ON "LifetimeSlotReservation"("status", "expiresAt");
CREATE INDEX "LifetimeSlotReservation_userId_status_createdAt_idx" ON "LifetimeSlotReservation"("userId", "status", "createdAt");

ALTER TABLE "BillingEntitlement"
ADD CONSTRAINT "BillingEntitlement_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreditLedgerEntry"
ADD CONSTRAINT "CreditLedgerEntry_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreditLedgerEntry"
ADD CONSTRAINT "CreditLedgerEntry_billingEntitlementId_fkey"
FOREIGN KEY ("billingEntitlementId") REFERENCES "BillingEntitlement"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LifetimeSlotReservation"
ADD CONSTRAINT "LifetimeSlotReservation_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
