import type {
  SessionConstraint,
  SessionConstraintSource,
  StrategyPlan,
} from "../contracts/chat";

function normalizeConstraintText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeSessionConstraintTexts(values: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const value of values) {
    const normalized = normalizeConstraintText(value);
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    next.push(normalized);
  }

  return next;
}

function buildConstraintEntries(
  values: string[],
  source: SessionConstraintSource,
): SessionConstraint[] {
  return normalizeSessionConstraintTexts(values).map((text) => ({
    source,
    text,
  }));
}

export function resolvePlanExtractedConstraints(
  plan?: Pick<StrategyPlan, "extractedConstraints"> | null,
): string[] {
  return normalizeSessionConstraintTexts(plan?.extractedConstraints || []);
}

export function buildSessionConstraints(args: {
  activeConstraints: string[];
  inferredConstraints?: string[] | null;
  pendingPlan?: Pick<StrategyPlan, "extractedConstraints"> | null;
}): SessionConstraint[] {
  const explicit = buildConstraintEntries(args.activeConstraints, "explicit");
  const explicitKeys = new Set(explicit.map((constraint) => constraint.text.toLowerCase()));
  const inferred = buildConstraintEntries(
    args.inferredConstraints || resolvePlanExtractedConstraints(args.pendingPlan),
    "inferred",
  ).filter((constraint) => !explicitKeys.has(constraint.text.toLowerCase()));

  return [...explicit, ...inferred];
}

export function sessionConstraintsToLegacyStrings(
  sessionConstraints: SessionConstraint[],
): string[] {
  return normalizeSessionConstraintTexts(
    sessionConstraints.map((constraint) => constraint.text),
  );
}
