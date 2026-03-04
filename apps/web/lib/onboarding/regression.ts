import { buildCreatorAgentContext } from "./agentContext";
import type { OnboardingResult } from "./types";

type LegacyRegressionIntent = "coach" | "ideate" | "draft" | "review";

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
  intent?: LegacyRegressionIntent;
  contentFocus?: string | null;
  selectedAngle?: string | null;
  expectedOutputShape?:
    | "coach_question"
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
    | "coach_question"
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
  const fallbackShape =
    params.check.expectedOutputShape ??
    (intent === "coach"
      ? "coach_question"
      : intent === "ideate"
        ? "ideation_angles"
        : "short_form_post");
  const issues = [
    "Legacy grounding regression checks are deprecated. Use the v2 response-quality and orchestrator suites instead.",
  ];

  return {
    label:
      params.check.label?.trim() ||
      params.check.selectedAngle?.trim() ||
      prompt,
    passed: false,
    outputShape: fallbackShape,
    topDraftPreview: null,
    topDraftScore: null,
    evidenceCoverage: 0,
    genericPhraseCount: 0,
    strategyLeakCount: 0,
    validatorPass: null,
    validatorErrors: [],
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
