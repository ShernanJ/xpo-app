import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateLifetimeRefundEligibility,
  evaluateSubscriptionRefundEligibility,
} from "./policy.ts";

test("subscription refunds are eligible inside 7 days within the usage threshold", () => {
  const now = new Date("2026-03-05T12:00:00.000Z");
  const purchase = new Date("2026-03-01T12:00:00.000Z");

  const result = evaluateSubscriptionRefundEligibility({
    purchasedAt: purchase,
    now,
    creditsUsed: 10,
  });

  assert.equal(result.eligible, true);
});

test("subscription refunds are denied outside the 7-day window", () => {
  const now = new Date("2026-03-12T12:00:00.000Z");
  const purchase = new Date("2026-03-01T11:00:00.000Z");

  const result = evaluateSubscriptionRefundEligibility({
    purchasedAt: purchase,
    now,
    creditsUsed: 1,
  });

  assert.equal(result.eligible, false);
  assert.match(result.reason, /outside the 7-day/i);
});

test("subscription refunds are denied when usage exceeds 120 credits", () => {
  const now = new Date("2026-03-05T12:00:00.000Z");
  const purchase = new Date("2026-03-02T12:00:00.000Z");

  const result = evaluateSubscriptionRefundEligibility({
    purchasedAt: purchase,
    now,
    creditsUsed: 121,
  });

  assert.equal(result.eligible, false);
  assert.match(result.reason, /usage exceeded/i);
});

test("lifetime refunds are denied when usage is too high", () => {
  const now = new Date("2026-03-05T12:00:00.000Z");
  const purchase = new Date("2026-03-04T12:00:00.000Z");

  const result = evaluateLifetimeRefundEligibility({
    purchasedAt: purchase,
    now,
    creditsUsed: 150,
  });

  assert.equal(result.eligible, false);
  assert.match(result.reason, /usage exceeded/i);
});

test("lifetime refunds are denied when usage exceeds 60 credits", () => {
  const now = new Date("2026-03-05T12:00:00.000Z");
  const purchase = new Date("2026-03-04T18:00:00.000Z");

  const result = evaluateLifetimeRefundEligibility({
    purchasedAt: purchase,
    now,
    creditsUsed: 61,
  });

  assert.equal(result.eligible, false);
  assert.match(result.reason, /usage exceeded/i);
});
