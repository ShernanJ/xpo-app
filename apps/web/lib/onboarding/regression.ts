import { buildCreatorAgentContext } from "./agentContext";
import type { OnboardingResult } from "./types";

export interface CreatorRegressionCaseInput {
  runId: string;
  minOverallScore?: number;
  allowedModes?: Array<
    ReturnType<typeof buildCreatorAgentContext>["readiness"]["recommendedMode"]
  >;
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

    return {
      runId: testCase.runId,
      account: testCase.onboarding.account,
      overallScore: context.confidence.evaluationOverallScore,
      readinessScore: context.readiness.score,
      readinessStatus: context.readiness.status,
      recommendedMode: context.readiness.recommendedMode,
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
