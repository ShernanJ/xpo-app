import { buildCreatorAgentContext } from "./agentContext";
import {
  buildDeterministicCreatorChatReply,
  type CreatorChatIntent,
} from "./chatAgent";
import type { OnboardingResult } from "./types";

export interface CreatorRegressionCaseInput {
  runId: string;
  minOverallScore?: number;
  allowedModes?: Array<
    ReturnType<typeof buildCreatorAgentContext>["readiness"]["recommendedMode"]
  >;
  groundingChecks?: CreatorGroundingRegressionInput[];
}

export interface CreatorGroundingRegressionInput {
  label?: string;
  prompt?: string;
  intent?: CreatorChatIntent;
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
  requireValidatorPass?: boolean;
}

export interface CreatorGroundingRegressionResult {
  label: string;
  passed: boolean;
  outputShape:
    | "ideation_angles"
    | "short_form_post"
    | "long_form_post"
    | "thread_seed"
    | "reply_candidate"
    | "quote_candidate";
  topDraftPreview: string | null;
  topDraftScore: number | null;
  evidenceCoverage: number;
  genericPhraseCount: number;
  strategyLeakCount: number;
  validatorPass: boolean | null;
  validatorErrors: string[];
  issues: string[];
}

export interface CreatorRegressionCaseResult {
  runId: string;
  account: string;
  overallScore: number;
  readinessScore: number;
  readinessStatus: ReturnType<typeof buildCreatorAgentContext>["readiness"]["status"];
  recommendedMode: ReturnType<
    typeof buildCreatorAgentContext
  >["readiness"]["recommendedMode"];
  groundingChecks: CreatorGroundingRegressionResult[];
  passed: boolean;
  failures: string[];
}

export interface CreatorRegressionSuiteResult {
  generatedAt: string;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  cases: CreatorRegressionCaseResult[];
}

const DEFAULT_MIN_OVERALL_SCORE = 60;
const DEFAULT_ALLOWED_MODES: Array<
  ReturnType<typeof buildCreatorAgentContext>["readiness"]["recommendedMode"]
> = [
  "full_generation",
  "conservative_generation",
];
const DEFAULT_MIN_EVIDENCE_COVERAGE = 1;
const DEFAULT_MAX_GENERIC_PHRASE_COUNT = 0;
const DEFAULT_MAX_STRATEGY_LEAK_COUNT = 0;

function runGroundingRegressionCheck(params: {
  runId: string;
  onboarding: OnboardingResult;
  check: CreatorGroundingRegressionInput;
}): CreatorGroundingRegressionResult {
  const prompt =
    params.check.prompt?.trim() ||
    params.check.selectedAngle?.trim() ||
    params.check.contentFocus?.trim() ||
    "write a grounded post using the strongest concrete evidence from my recent posts";
  const intent = params.check.intent ?? "draft";
  const reply = buildDeterministicCreatorChatReply({
    runId: params.runId,
    onboarding: params.onboarding,
    userMessage: prompt,
    intent,
    contentFocus: params.check.contentFocus ?? null,
    selectedAngle: params.check.selectedAngle?.trim() || null,
  });
  const topDiagnostic = reply.debug.draftDiagnostics[0] ?? null;
  const issues: string[] = [];

  if (
    params.check.expectedOutputShape &&
    reply.outputShape !== params.check.expectedOutputShape
  ) {
    issues.push(
      `output shape ${reply.outputShape} does not match expected ${params.check.expectedOutputShape}`,
    );
  }

  if (intent !== "ideate" && !topDiagnostic) {
    issues.push("no draft diagnostics were produced for the top draft");
  }

  if (topDiagnostic) {
    const minEvidenceCoverage =
      params.check.minEvidenceCoverage ?? DEFAULT_MIN_EVIDENCE_COVERAGE;
    const maxGenericPhraseCount =
      params.check.maxGenericPhraseCount ?? DEFAULT_MAX_GENERIC_PHRASE_COUNT;
    const maxStrategyLeakCount =
      params.check.maxStrategyLeakCount ?? DEFAULT_MAX_STRATEGY_LEAK_COUNT;

    if (topDiagnostic.evidenceCoverage.total < minEvidenceCoverage) {
      issues.push(
        `evidence coverage ${topDiagnostic.evidenceCoverage.total} is below ${minEvidenceCoverage}`,
      );
    }

    if (topDiagnostic.genericPhraseCount > maxGenericPhraseCount) {
      issues.push(
        `generic phrase count ${topDiagnostic.genericPhraseCount} exceeds ${maxGenericPhraseCount}`,
      );
    }

    if (topDiagnostic.strategyLeakCount > maxStrategyLeakCount) {
      issues.push(
        `strategy leak count ${topDiagnostic.strategyLeakCount} exceeds ${maxStrategyLeakCount}`,
      );
    }

    if (
      params.check.requireBlueprintMatch &&
      topDiagnostic.matchesBlueprint === false
    ) {
      issues.push("top draft missed the structural blueprint");
    }

    if (
      params.check.requireSkeletonMatch &&
      topDiagnostic.matchesSkeleton === false
    ) {
      issues.push("top draft missed the long-form content skeleton");
    }

    if (
      params.check.requireProofReuse &&
      topDiagnostic.evidenceCoverage.metricMatches +
        topDiagnostic.evidenceCoverage.proofMatches ===
        0
    ) {
      issues.push("top draft did not reuse a metric or proof signal");
    }

    if (params.check.requireValidatorPass) {
      if (!topDiagnostic.validator) {
        issues.push("top draft did not expose validator diagnostics");
      } else if (!topDiagnostic.validator.pass) {
        issues.push(
          `top draft failed validator: ${topDiagnostic.validator.errors.join(", ") || "unknown errors"}`,
        );
      }
    }
  }

  return {
    label:
      params.check.label?.trim() ||
      params.check.selectedAngle?.trim() ||
      prompt,
    passed: issues.length === 0,
    outputShape: reply.outputShape,
    topDraftPreview: topDiagnostic?.preview ?? null,
    topDraftScore: topDiagnostic?.score ?? null,
    evidenceCoverage: topDiagnostic?.evidenceCoverage.total ?? 0,
    genericPhraseCount: topDiagnostic?.genericPhraseCount ?? 0,
    strategyLeakCount: topDiagnostic?.strategyLeakCount ?? 0,
    validatorPass: topDiagnostic?.validator?.pass ?? null,
    validatorErrors: topDiagnostic?.validator?.errors ?? [],
    issues,
  };
}

export function runCreatorRegressionSuite(params: {
  cases: Array<CreatorRegressionCaseInput & { onboarding: OnboardingResult }>;
}): CreatorRegressionSuiteResult {
  const results = params.cases.map((testCase) => {
    const context = buildCreatorAgentContext({
      runId: testCase.runId,
      onboarding: testCase.onboarding,
    });

    const failures: string[] = [];
    const minOverallScore =
      testCase.minOverallScore ?? DEFAULT_MIN_OVERALL_SCORE;
    const allowedModes = testCase.allowedModes ?? DEFAULT_ALLOWED_MODES;

    if (context.confidence.evaluationOverallScore < minOverallScore) {
      failures.push(
        `overall score ${context.confidence.evaluationOverallScore} is below ${minOverallScore}`,
      );
    }

    if (!allowedModes.includes(context.readiness.recommendedMode)) {
      failures.push(
        `recommended mode ${context.readiness.recommendedMode} is outside the allowed set`,
      );
    }

    const groundingChecks = (testCase.groundingChecks ?? []).map((check) =>
      runGroundingRegressionCheck({
        runId: testCase.runId,
        onboarding: testCase.onboarding,
        check,
      }),
    );

    for (const groundingCheck of groundingChecks) {
      if (!groundingCheck.passed) {
        failures.push(
          `grounding check "${groundingCheck.label}" failed: ${groundingCheck.issues.join(
            "; ",
          )}`,
        );
      }
    }

    return {
      runId: testCase.runId,
      account: testCase.onboarding.account,
      overallScore: context.confidence.evaluationOverallScore,
      readinessScore: context.readiness.score,
      readinessStatus: context.readiness.status,
      recommendedMode: context.readiness.recommendedMode,
      groundingChecks,
      passed: failures.length === 0,
      failures,
    };
  });

  const passedCases = results.filter((result) => result.passed).length;

  return {
    generatedAt: new Date().toISOString(),
    totalCases: results.length,
    passedCases,
    failedCases: results.length - passedCases,
    cases: results,
  };
}
