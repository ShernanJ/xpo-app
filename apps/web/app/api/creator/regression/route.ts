import { NextResponse } from "next/server";

import { runCreatorRegressionSuite } from "@/lib/onboarding/regression";
import { readOnboardingRunById } from "@/lib/onboarding/store";
import type { OnboardingResult } from "@/lib/onboarding/types";

interface CreatorRegressionRequestCase {
  runId?: unknown;
  minOverallScore?: unknown;
  allowedModes?: unknown;
  groundingChecks?: unknown;
}

interface CreatorRegressionRequest {
  cases?: unknown;
}

export async function POST(request: Request) {
  let body: CreatorRegressionRequest;

  try {
    body = (await request.json()) as CreatorRegressionRequest;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ field: "cases", message: "Request body must be valid JSON." }],
      },
      { status: 400 },
    );
  }

  const cases = Array.isArray(body.cases) ? body.cases : [];
  if (cases.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ field: "cases", message: "At least one regression case is required." }],
      },
      { status: 400 },
    );
  }

  const preparedCases: Array<{
    runId: string;
    onboarding: OnboardingResult;
    minOverallScore?: number;
    allowedModes?: Array<"full_generation" | "conservative_generation" | "analysis_only">;
    groundingChecks?: Array<{
      label?: string;
      prompt?: string;
      intent?: "ideate" | "draft" | "review";
      contentFocus?: string | null;
      selectedAngle?: string | null;
      expectedOutputShape?:
        | "ideation_angles"
        | "short_form_post"
        | "long_form_post"
        | "thread_seed"
        | "reply_candidate"
        | "quote_candidate";
      minEvidenceCoverage?: number;
      maxGenericPhraseCount?: number;
      maxStrategyLeakCount?: number;
      requireBlueprintMatch?: boolean;
      requireSkeletonMatch?: boolean;
      requireProofReuse?: boolean;
    }>;
  }> = [];

  for (const rawCase of cases as CreatorRegressionRequestCase[]) {
    const runId = typeof rawCase.runId === "string" ? rawCase.runId.trim() : "";
    if (!runId) {
      return NextResponse.json(
        {
          ok: false,
          errors: [{ field: "runId", message: "Each regression case requires a runId." }],
        },
        { status: 400 },
      );
    }

    const storedRun = await readOnboardingRunById(runId);
    if (!storedRun) {
      return NextResponse.json(
        {
          ok: false,
          errors: [{ field: "runId", message: `Onboarding run not found: ${runId}` }],
        },
        { status: 404 },
      );
    }

    const minOverallScore =
      typeof rawCase.minOverallScore === "number" &&
      Number.isFinite(rawCase.minOverallScore)
        ? rawCase.minOverallScore
        : undefined;

    const allowedModes = Array.isArray(rawCase.allowedModes)
      ? rawCase.allowedModes.filter(
          (value): value is "full_generation" | "conservative_generation" | "analysis_only" =>
            value === "full_generation" ||
            value === "conservative_generation" ||
            value === "analysis_only",
        )
      : undefined;

    const groundingChecks = Array.isArray(rawCase.groundingChecks)
      ? rawCase.groundingChecks
          .map((value) =>
            typeof value === "object" && value !== null
              ? {
                  label:
                    typeof (value as { label?: unknown }).label === "string"
                      ? (value as { label?: string }).label
                      : undefined,
                  prompt:
                    typeof (value as { prompt?: unknown }).prompt === "string"
                      ? (value as { prompt?: string }).prompt
                      : undefined,
                  intent:
                    (value as { intent?: unknown }).intent === "ideate" ||
                    (value as { intent?: unknown }).intent === "draft" ||
                    (value as { intent?: unknown }).intent === "review"
                      ? ((value as { intent?: "ideate" | "draft" | "review" }).intent ??
                        undefined)
                      : undefined,
                  contentFocus:
                    typeof (value as { contentFocus?: unknown }).contentFocus === "string"
                      ? (value as { contentFocus?: string }).contentFocus
                      : undefined,
                  selectedAngle:
                    typeof (value as { selectedAngle?: unknown }).selectedAngle === "string"
                      ? (value as { selectedAngle?: string }).selectedAngle
                      : undefined,
                  expectedOutputShape:
                    (value as { expectedOutputShape?: unknown }).expectedOutputShape ===
                      "ideation_angles" ||
                    (value as { expectedOutputShape?: unknown }).expectedOutputShape ===
                      "short_form_post" ||
                    (value as { expectedOutputShape?: unknown }).expectedOutputShape ===
                      "long_form_post" ||
                    (value as { expectedOutputShape?: unknown }).expectedOutputShape ===
                      "thread_seed" ||
                    (value as { expectedOutputShape?: unknown }).expectedOutputShape ===
                      "reply_candidate" ||
                    (value as { expectedOutputShape?: unknown }).expectedOutputShape ===
                      "quote_candidate"
                      ? ((value as {
                          expectedOutputShape?:
                            | "ideation_angles"
                            | "short_form_post"
                            | "long_form_post"
                            | "thread_seed"
                            | "reply_candidate"
                            | "quote_candidate";
                        }).expectedOutputShape ?? undefined)
                      : undefined,
                  minEvidenceCoverage:
                    typeof (value as { minEvidenceCoverage?: unknown })
                      .minEvidenceCoverage === "number" &&
                    Number.isFinite(
                      (value as { minEvidenceCoverage?: number }).minEvidenceCoverage,
                    )
                      ? (value as { minEvidenceCoverage?: number }).minEvidenceCoverage
                      : undefined,
                  maxGenericPhraseCount:
                    typeof (value as { maxGenericPhraseCount?: unknown })
                      .maxGenericPhraseCount === "number" &&
                    Number.isFinite(
                      (value as { maxGenericPhraseCount?: number }).maxGenericPhraseCount,
                    )
                      ? (value as { maxGenericPhraseCount?: number }).maxGenericPhraseCount
                      : undefined,
                  maxStrategyLeakCount:
                    typeof (value as { maxStrategyLeakCount?: unknown })
                      .maxStrategyLeakCount === "number" &&
                    Number.isFinite(
                      (value as { maxStrategyLeakCount?: number }).maxStrategyLeakCount,
                    )
                      ? (value as { maxStrategyLeakCount?: number }).maxStrategyLeakCount
                      : undefined,
                  requireBlueprintMatch:
                    typeof (value as { requireBlueprintMatch?: unknown })
                      .requireBlueprintMatch === "boolean"
                      ? (value as { requireBlueprintMatch?: boolean }).requireBlueprintMatch
                      : undefined,
                  requireSkeletonMatch:
                    typeof (value as { requireSkeletonMatch?: unknown })
                      .requireSkeletonMatch === "boolean"
                      ? (value as { requireSkeletonMatch?: boolean }).requireSkeletonMatch
                      : undefined,
                  requireProofReuse:
                    typeof (value as { requireProofReuse?: unknown }).requireProofReuse ===
                    "boolean"
                      ? (value as { requireProofReuse?: boolean }).requireProofReuse
                      : undefined,
                }
              : null,
          )
          .filter(
            (
              value,
            ): value is NonNullable<typeof value> => value !== null,
          )
      : undefined;

    preparedCases.push({
      runId,
      onboarding: storedRun.result,
      minOverallScore,
      allowedModes: allowedModes && allowedModes.length > 0 ? allowedModes : undefined,
      groundingChecks:
        groundingChecks && groundingChecks.length > 0 ? groundingChecks : undefined,
    });
  }

  return NextResponse.json(
    {
      ok: true,
      data: runCreatorRegressionSuite({
        cases: preparedCases,
      }),
    },
    { status: 200 },
  );
}
