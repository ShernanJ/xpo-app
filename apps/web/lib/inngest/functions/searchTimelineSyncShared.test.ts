import { describe, expect, test } from "vitest";

import { shouldTreatEmptyPageAsSoftLimit } from "./searchTimelineSyncShared";

describe("shouldTreatEmptyPageAsSoftLimit", () => {
  test("does not treat a terminal empty page with no next cursor as a soft limit", () => {
    expect(
      shouldTreatEmptyPageAsSoftLimit({
        originalPostCount: 0,
        nextCursor: null,
        currentCursor: "cursor-1",
        previousCursor: "cursor-0",
        yearSeenPostCount: 14,
      }),
    ).toBe(false);
  });

  test("does not treat a repeated cursor empty page as a soft limit", () => {
    expect(
      shouldTreatEmptyPageAsSoftLimit({
        originalPostCount: 0,
        nextCursor: "cursor-1",
        currentCursor: "cursor-1",
        previousCursor: "cursor-0",
        yearSeenPostCount: 14,
      }),
    ).toBe(false);
  });

  test("treats an empty page with a fresh cursor in an active year as a soft limit", () => {
    expect(
      shouldTreatEmptyPageAsSoftLimit({
        originalPostCount: 0,
        nextCursor: "cursor-2",
        currentCursor: "cursor-1",
        previousCursor: "cursor-0",
        yearSeenPostCount: 14,
      }),
    ).toBe(true);
  });
});
