ALTER TABLE "BillingEntitlement"
ALTER COLUMN "creditsRemaining" SET DEFAULT 100;

ALTER TABLE "BillingEntitlement"
ALTER COLUMN "creditLimit" SET DEFAULT 100;

UPDATE "BillingEntitlement"
SET
  "creditsRemaining" = LEAST("creditsRemaining" + (100 - "creditLimit"), 100),
  "creditLimit" = 100,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "plan" = 'free'::"BillingPlan"
  AND "creditLimit" < 100;
