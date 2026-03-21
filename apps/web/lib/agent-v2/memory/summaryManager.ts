import type { DraftFormatPreference, StrategyPlan } from "../contracts/chat";

interface SummaryArgs {
  currentSummary: string | null;
  topicSummary: string | null;
  approvedPlan: StrategyPlan | null;
  activeConstraints: string[];
  inferredSessionConstraints?: string[];
  latestDraftStatus: string;
  formatPreference?: DraftFormatPreference | null;
  unresolvedQuestion?: string | null;
}

function pickSummaryValue(currentSummary: string | null, prefix: string): string | null {
  if (!currentSummary) {
    return null;
  }

  const match = currentSummary
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith(prefix));

  if (!match) {
    return null;
  }

  return match.slice(prefix.length).trim() || null;
}

export function shouldRefreshRollingSummary(
  assistantTurnCount: number,
  force: boolean,
): boolean {
  if (force) {
    return true;
  }

  return assistantTurnCount > 0 && assistantTurnCount % 3 === 0;
}

export function buildRollingSummary(args: SummaryArgs): string {
  const correctionLocks = args.activeConstraints
    .filter((constraint) => constraint.startsWith("Correction lock:"))
    .map((constraint) => constraint.replace(/^Correction lock:\s*/i, "").trim())
    .filter(Boolean);
  const persistentStyleConstraints = args.activeConstraints
    .filter((constraint) => !constraint.startsWith("Correction lock:"))
    .slice(-2);
  const inferredSessionConstraints = (args.inferredSessionConstraints || []).slice(-3);
  const currentKnownFacts =
    pickSummaryValue(args.currentSummary, "Known facts:") || "none recorded";
  const knownFacts = correctionLocks.length > 0 ? correctionLocks.join(" | ") : currentKnownFacts;
  const parts = [
    `Current topic: ${args.topicSummary || args.approvedPlan?.objective || "not locked yet"}`,
    `Approved angle: ${args.approvedPlan?.angle || "none yet"}`,
    `Format preference: ${args.formatPreference || args.approvedPlan?.formatPreference || "shortform"}`,
    `Known facts: ${knownFacts}`,
    `Preferences discovered: ${persistentStyleConstraints.join(" | ") || "none recorded"}`,
    `Inferred turn constraints: ${inferredSessionConstraints.join(" | ") || "none recorded"}`,
    `Latest draft status: ${args.latestDraftStatus}`,
  ];

  if (args.unresolvedQuestion?.trim()) {
    parts.push(`Open question: ${args.unresolvedQuestion.trim()}`);
  }

  const nextSummary = parts.join("\n");
  if (!args.currentSummary) {
    return nextSummary;
  }

  return nextSummary;
}
