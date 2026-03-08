// @ts-expect-error TS5097 - helper is imported directly in node strip-types tests.
import { isConcreteAnecdoteDraftRequest } from "../orchestrator/draftGrounding.ts";

function hasNoFabricationGuardrail(entries: string[]): boolean {
  return entries.some((entry) =>
    /(factual guardrail|invent(?:ed|ing)? personal anecdote|fabricat(?:ed|ing)|offline event|named place|timeline)/i.test(
      entry,
    ),
  );
}

function extractHardFactualGrounding(activeConstraints: string[]): string[] {
  return activeConstraints
    .filter(
      (entry) =>
        /^Correction lock:/i.test(entry) || /^Topic grounding:/i.test(entry),
    )
    .map((entry) =>
      entry
        .replace(/^Correction lock:\s*/i, "")
        .replace(/^Topic grounding:\s*/i, "")
        .trim(),
    )
    .filter(Boolean);
}

export function resolveWriterPromptGuardrails(args: {
  planMustAvoid: string[];
  activeConstraints: string[];
  sourceUserMessage?: string;
  objective: string;
  angle: string;
  mustInclude: string[];
}): {
  noFabricatedAnecdotesGuardrail: boolean;
  sceneSource: string;
  concreteSceneMode: boolean;
  hardFactualGrounding: string[];
} {
  const noFabricatedAnecdotesGuardrail = hasNoFabricationGuardrail([
    ...args.planMustAvoid,
    ...args.activeConstraints,
  ]);
  const hardFactualGrounding = extractHardFactualGrounding(args.activeConstraints);
  const sceneSource =
    args.sourceUserMessage ||
    [args.objective, args.angle, ...args.mustInclude].join(" ");
  const concreteSceneMode =
    noFabricatedAnecdotesGuardrail || isConcreteAnecdoteDraftRequest(sceneSource);

  return {
    noFabricatedAnecdotesGuardrail,
    sceneSource,
    concreteSceneMode,
    hardFactualGrounding,
  };
}
