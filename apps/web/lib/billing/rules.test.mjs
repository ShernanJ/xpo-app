import test from "node:test";
import assert from "node:assert/strict";

import {
  canAccessDraftAnalysis,
  shouldActivateProFromCheckoutSession,
} from "./rules.ts";

test("free plan can access draft analysis analyze mode", () => {
  assert.equal(canAccessDraftAnalysis("free", "analyze"), true);
});

test("free plan cannot access draft analysis compare mode", () => {
  assert.equal(canAccessDraftAnalysis("free", "compare"), false);
});

test("paid plans can access draft analysis compare mode", () => {
  assert.equal(canAccessDraftAnalysis("pro", "compare"), true);
  assert.equal(canAccessDraftAnalysis("lifetime", "compare"), true);
});

test("completed paid checkout should activate pro immediately", () => {
  assert.equal(
    shouldActivateProFromCheckoutSession({
      status: "complete",
      paymentStatus: "paid",
      hasSubscriptionId: true,
    }),
    true,
  );
});

test("completed subscription checkout with a subscription id should activate pro", () => {
  assert.equal(
    shouldActivateProFromCheckoutSession({
      status: "complete",
      paymentStatus: "unpaid",
      hasSubscriptionId: true,
    }),
    true,
  );
});

test("incomplete checkout should not activate pro", () => {
  assert.equal(
    shouldActivateProFromCheckoutSession({
      status: "open",
      paymentStatus: "paid",
      hasSubscriptionId: true,
    }),
    false,
  );
});
