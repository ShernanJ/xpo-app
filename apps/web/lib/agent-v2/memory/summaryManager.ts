import type { StrategyPlan } from "../contracts/chat";

interface SummaryArgs {
  currentSummary: string | null;
  topicSummary: string | null;
  approvedPlan: StrategyPlan | null;
  activeConstraints: string[];
  latestDraftStatus: string;
  unresolvedQuestion?: string | null;
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
  const parts = [
    `Current topic: ${args.topicSummary || args.approvedPlan?.objective || "not locked yet"}`,
    `Approved angle: ${args.approvedPlan?.angle || "none yet"}`,
    `Preferences discovered: ${args.activeConstraints.join(" | ") || "none recorded"}`,
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
