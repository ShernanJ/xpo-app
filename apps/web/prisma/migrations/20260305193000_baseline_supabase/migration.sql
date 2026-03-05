-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "BillingPlan" AS ENUM ('free', 'pro', 'lifetime');

-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('active', 'past_due', 'canceled', 'blocked_fair_use');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('monthly', 'annual', 'lifetime');

-- CreateEnum
CREATE TYPE "CreditActionType" AS ENUM ('monthly_grant', 'debit', 'refund', 'manual_adjustment', 'migration_grant');

-- CreateEnum
CREATE TYPE "LifetimeReservationStatus" AS ENUM ('pending', 'completed', 'expired', 'canceled');

-- CreateEnum
CREATE TYPE "ChatMessageFeedbackValue" AS ENUM ('up', 'down');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "handle" TEXT,
    "activeXHandle" TEXT,
    "name" TEXT,
    "email" TEXT,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "input" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapeCaptureCache" (
    "id" TEXT NOT NULL,
    "captureId" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "profile" JSONB NOT NULL,
    "posts" JSONB NOT NULL,
    "replyPosts" JSONB NOT NULL,
    "quotePosts" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScrapeCaptureCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatThread" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "xHandle" TEXT,
    "title" TEXT NOT NULL DEFAULT 'New Chat',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessageFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "value" "ChatMessageFeedbackValue" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatMessageFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "xHandle" TEXT,
    "text" TEXT NOT NULL,
    "lane" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationMemory" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "runId" TEXT,
    "threadId" TEXT,
    "topicSummary" TEXT,
    "activeConstraints" JSONB,
    "concreteAnswerCount" INTEGER NOT NULL DEFAULT 0,
    "lastDraftArtifactId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "xHandle" TEXT,
    "niche" TEXT,
    "styleCard" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoiceProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackSubmission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "xHandle" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "title" TEXT,
    "message" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "context" JSONB NOT NULL,
    "attachments" JSONB NOT NULL,
    "submittedByUserHandle" TEXT,
    "submittedByXHandle" TEXT,
    "statusUpdatedAt" TIMESTAMP(3),
    "statusUpdatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedbackSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingEntitlement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plan" "BillingPlan" NOT NULL DEFAULT 'free',
    "status" "BillingStatus" NOT NULL DEFAULT 'active',
    "billingCycle" "BillingCycle" NOT NULL DEFAULT 'monthly',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "creditsRemaining" INTEGER NOT NULL DEFAULT 100,
    "creditLimit" INTEGER NOT NULL DEFAULT 100,
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateIndex
CREATE UNIQUE INDEX "User_handle_key" ON "User"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapeCaptureCache_captureId_key" ON "ScrapeCaptureCache"("captureId");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapeCaptureCache_account_key" ON "ScrapeCaptureCache"("account");

-- CreateIndex
CREATE INDEX "ScrapeCaptureCache_expiresAt_idx" ON "ScrapeCaptureCache"("expiresAt");

-- CreateIndex
CREATE INDEX "ScrapeCaptureCache_capturedAt_idx" ON "ScrapeCaptureCache"("capturedAt");

-- CreateIndex
CREATE INDEX "ChatMessageFeedback_messageId_idx" ON "ChatMessageFeedback"("messageId");

-- CreateIndex
CREATE INDEX "ChatMessageFeedback_threadId_createdAt_idx" ON "ChatMessageFeedback"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessageFeedback_userId_createdAt_idx" ON "ChatMessageFeedback"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessageFeedback_userId_messageId_key" ON "ChatMessageFeedback"("userId", "messageId");

-- CreateIndex
CREATE INDEX "FeedbackSubmission_userId_xHandle_createdAt_idx" ON "FeedbackSubmission"("userId", "xHandle", "createdAt");

-- CreateIndex
CREATE INDEX "FeedbackSubmission_userId_xHandle_status_createdAt_idx" ON "FeedbackSubmission"("userId", "xHandle", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingEntitlement_userId_key" ON "BillingEntitlement"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingEntitlement_stripeCustomerId_key" ON "BillingEntitlement"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "BillingEntitlement_plan_status_idx" ON "BillingEntitlement"("plan", "status");

-- CreateIndex
CREATE INDEX "BillingEntitlement_creditCycleResetsAt_idx" ON "BillingEntitlement"("creditCycleResetsAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreditLedgerEntry_idempotencyKey_key" ON "CreditLedgerEntry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CreditLedgerEntry_userId_createdAt_idx" ON "CreditLedgerEntry"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CreditLedgerEntry_billingEntitlementId_createdAt_idx" ON "CreditLedgerEntry"("billingEntitlementId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LifetimeSlotReservation_stripeCheckoutSessionId_key" ON "LifetimeSlotReservation"("stripeCheckoutSessionId");

-- CreateIndex
CREATE INDEX "LifetimeSlotReservation_status_expiresAt_idx" ON "LifetimeSlotReservation"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "LifetimeSlotReservation_userId_status_createdAt_idx" ON "LifetimeSlotReservation"("userId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "OnboardingRun" ADD CONSTRAINT "OnboardingRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessageFeedback" ADD CONSTRAINT "ChatMessageFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessageFeedback" ADD CONSTRAINT "ChatMessageFeedback_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessageFeedback" ADD CONSTRAINT "ChatMessageFeedback_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMemory" ADD CONSTRAINT "ConversationMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMemory" ADD CONSTRAINT "ConversationMemory_runId_fkey" FOREIGN KEY ("runId") REFERENCES "OnboardingRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMemory" ADD CONSTRAINT "ConversationMemory_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceProfile" ADD CONSTRAINT "VoiceProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackSubmission" ADD CONSTRAINT "FeedbackSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingEntitlement" ADD CONSTRAINT "BillingEntitlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_billingEntitlementId_fkey" FOREIGN KEY ("billingEntitlementId") REFERENCES "BillingEntitlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LifetimeSlotReservation" ADD CONSTRAINT "LifetimeSlotReservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

