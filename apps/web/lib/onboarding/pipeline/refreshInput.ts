import type { OnboardingInput } from "../contracts/types";

export function buildRefreshOnboardingInput(
  baseInput: OnboardingInput,
  account: string,
  scrapeFreshness: OnboardingInput["scrapeFreshness"] = "if_stale",
): OnboardingInput {
  const goal =
    baseInput.goal === "followers" || baseInput.goal === "leads" || baseInput.goal === "authority"
      ? baseInput.goal
      : "followers";
  const timeBudgetMinutes =
    Number.isFinite(baseInput.timeBudgetMinutes) && baseInput.timeBudgetMinutes >= 5
      ? Math.floor(baseInput.timeBudgetMinutes)
      : 30;
  const transformationMode =
    baseInput.transformationMode === "preserve" ||
    baseInput.transformationMode === "optimize" ||
    baseInput.transformationMode === "pivot_soft" ||
    baseInput.transformationMode === "pivot_hard"
      ? baseInput.transformationMode
      : undefined;

  return {
    account,
    goal,
    timeBudgetMinutes,
    postingCadenceCapacity: baseInput.postingCadenceCapacity,
    replyBudgetPerDay: baseInput.replyBudgetPerDay,
    transformationMode,
    transformationModeSource: transformationMode
      ? baseInput.transformationModeSource ?? "default"
      : undefined,
    tone: {
      casing: baseInput.tone?.casing === "normal" ? "normal" : "lowercase",
      risk: baseInput.tone?.risk === "bold" ? "bold" : "safe",
    },
    scrapeFreshness,
  };
}
