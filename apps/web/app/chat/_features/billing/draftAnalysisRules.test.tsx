import { afterEach, expect, test } from "vitest";
import { canAccessDraftAnalysis } from "@/lib/billing/rules";

afterEach(() => {
  delete process.env.NEXT_PUBLIC_ENABLE_MONETIZATION;
});

test("compare mode stays available when monetization is disabled", () => {
  delete process.env.NEXT_PUBLIC_ENABLE_MONETIZATION;

  expect(canAccessDraftAnalysis("free", "compare")).toBe(true);
});
