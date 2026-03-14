import type { StrategyPlan } from "../contracts/chat.ts";
import type { GroundingPacketSourceMaterial } from "./groundingPacket.ts";

function dedupeList(values: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const value of values) {
    const normalized = value.trim().replace(/\s+/g, " ");
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }

    seen.add(key);
    next.push(normalized);
  }

  return next;
}

function isGenericHookType(hookType: string | null | undefined): boolean {
  if (!hookType) {
    return true;
  }

  return /^(direct|general|default|story|framework)$/i.test(hookType.trim());
}

function buildAnchorInstruction(sourceMaterial: GroundingPacketSourceMaterial): string {
  const typeLabel = sourceMaterial.type.replace(/_/g, " ");
  return `Anchor the draft to the saved ${typeLabel}: ${sourceMaterial.title}.`;
}

function buildPrimaryClaimInstruction(sourceMaterial: GroundingPacketSourceMaterial): string | null {
  const primaryClaim = sourceMaterial.claims[0]?.trim();
  if (!primaryClaim) {
    return null;
  }

  return `Use this grounded source detail if it fits naturally: ${primaryClaim}`;
}

export function applySourceMaterialBiasToPlan(
  plan: StrategyPlan,
  sourceMaterials: GroundingPacketSourceMaterial[],
  options?: {
    hasAutobiographicalGrounding?: boolean;
  },
): StrategyPlan {
  if (sourceMaterials.length === 0) {
    return plan;
  }

  const primary = sourceMaterials[0];
  const primaryClaimInstruction = buildPrimaryClaimInstruction(primary);
  const nextPlan: StrategyPlan = {
    ...plan,
    mustInclude: dedupeList([
      ...plan.mustInclude,
      buildAnchorInstruction(primary),
      ...(primaryClaimInstruction ? [primaryClaimInstruction] : []),
    ]),
    mustAvoid: [...plan.mustAvoid],
  };

  if (primary.type === "story") {
    if (isGenericHookType(nextPlan.hookType)) {
      nextPlan.hookType = "story";
    }

    if (!options?.hasAutobiographicalGrounding) {
      nextPlan.mustAvoid = dedupeList([
        ...nextPlan.mustAvoid,
        "Do not invent extra first-person beats beyond the saved story details.",
      ]);
    }
  }

  if (primary.type === "case_study") {
    if (isGenericHookType(nextPlan.hookType)) {
      nextPlan.hookType = "case study";
    }

    nextPlan.mustAvoid = dedupeList([
      ...nextPlan.mustAvoid,
      "Do not generalize away from the saved case study into vague abstract advice.",
    ]);
  }

  if (primary.type === "framework") {
    if (isGenericHookType(nextPlan.hookType)) {
      nextPlan.hookType = "framework";
    }

    nextPlan.mustAvoid = dedupeList([
      ...nextPlan.mustAvoid,
      "Do not turn the saved framework into a generic personal anecdote.",
    ]);
  }

  if (primary.type === "playbook") {
    if (isGenericHookType(nextPlan.hookType)) {
      nextPlan.hookType = "playbook";
    }

    nextPlan.mustAvoid = dedupeList([
      ...nextPlan.mustAvoid,
      "Do not collapse the saved playbook into generic advice or a vague founder story.",
    ]);
  }

  return nextPlan;
}
