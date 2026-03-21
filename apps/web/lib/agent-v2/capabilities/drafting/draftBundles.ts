import type { StrategyPlan } from "../../contracts/chat.ts";
import type { VoiceTarget } from "../../core/voiceTarget.ts";
import type { DraftGroundingMode, ThreadFramingStyle } from "../../../onboarding/draftArtifacts.ts";
import type { GroundingPacketSourceMaterial } from "../../grounding/groundingPacket.ts";
import type { SourceMaterialAssetRecord } from "../../grounding/sourceMaterials.ts";

export type DraftBundleFraming =
  | "lesson_reflection"
  | "proof_result"
  | "mistake_turning_point"
  | "playbook_breakdown";

export interface DraftBundleBrief {
  id: DraftBundleFraming;
  label: string;
  prompt: string;
  objective: string;
  angle: string;
  hookType: string;
  mustInclude: string[];
  mustAvoid: string[];
}

export interface DraftBundleOptionResult {
  id: string;
  label: string;
  framing: DraftBundleFraming;
  draft: string;
  supportAsset: string | null;
  issuesFixed: string[];
  voiceTarget: VoiceTarget | null;
  noveltyNotes: string[];
  retrievedAnchorIds?: string[];
  threadFramingStyle: ThreadFramingStyle | null;
  groundingSources?: GroundingPacketSourceMaterial[];
  groundingMode?: DraftGroundingMode | null;
  groundingExplanation?: string | null;
}

export interface DraftBundleResult {
  kind: "sibling_options";
  selectedOptionId: string;
  options: DraftBundleOptionResult[];
}

function normalizeLine(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function firstNonEmpty(values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const normalized = typeof value === "string" ? normalizeLine(value) : "";
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function toTitleFragment(value: string | null): string {
  if (!value) {
    return "your saved context";
  }

  return value.length <= 72 ? value : `${value.slice(0, 69).trimEnd()}...`;
}

function buildSourceSeed(asset: SourceMaterialAssetRecord | null | undefined): string | null {
  if (!asset) {
    return null;
  }

  return firstNonEmpty([
    asset.claims[0],
    asset.snippets[0],
    asset.title,
  ]);
}

function buildSourceReference(sourceMaterials: SourceMaterialAssetRecord[]): string {
  const labels = sourceMaterials
    .map((asset) => normalizeLine(asset.title))
    .filter(Boolean)
    .slice(0, 2);

  if (labels.length === 0) {
    return "your saved stories and proof";
  }

  if (labels.length === 1) {
    return labels[0];
  }

  return `${labels[0]} and ${labels[1]}`;
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const value of values) {
    const normalized = normalizeLine(value);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }

    seen.add(key);
    next.push(normalized);
  }

  return next;
}

export function buildDraftBundleBriefs(args: {
  userMessage: string;
  basePlan: StrategyPlan;
  sourceMaterials: SourceMaterialAssetRecord[];
}): DraftBundleBrief[] {
  const primarySource = args.sourceMaterials[0] ?? null;
  const secondarySource = args.sourceMaterials[1] ?? null;
  const sourceReference = buildSourceReference(args.sourceMaterials);
  const primarySeed = buildSourceSeed(primarySource);
  const secondarySeed = buildSourceSeed(secondarySource);
  const userPromptSeed =
    firstNonEmpty([
      args.basePlan.objective,
      args.basePlan.angle,
      args.userMessage,
    ]) || "your story";
  const primaryPromptSeed = toTitleFragment(primarySeed || userPromptSeed);
  const secondaryPromptSeed = toTitleFragment(secondarySeed || primarySeed || userPromptSeed);

  const sharedAvoid = dedupeStrings([
    ...args.basePlan.mustAvoid,
    "Do not recycle the same opener, payoff, or exact framing across sibling bundle options.",
  ]);

  const sharedContext = [
    `Ground this in ${sourceReference}.`,
    primarySeed ? `Use this concrete seed: ${primarySeed}.` : "",
    secondarySeed && secondarySeed.toLowerCase() !== (primarySeed || "").toLowerCase()
      ? `Optional supporting proof: ${secondarySeed}.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  const briefs: DraftBundleBrief[] = [
    {
      id: "lesson_reflection",
      label: "Lesson / Reflection",
      prompt: `Write a shortform X post that turns ${primaryPromptSeed} into a reflective lesson. ${sharedContext} Lead with the perspective shift, not the timeline.`,
      objective: `${args.basePlan.objective} through a reflective lesson`,
      angle: `Turn ${primaryPromptSeed} into a lesson/reflection post that feels earned and personal.`,
      hookType: "lesson",
      mustInclude: dedupeStrings([
        ...args.basePlan.mustInclude,
        "Lead with the lesson or perspective shift.",
        "Keep it reflective instead of procedural.",
      ]),
      mustAvoid: sharedAvoid,
    },
    {
      id: "proof_result",
      label: "Proof / Result",
      prompt: `Write a shortform X post that uses ${primaryPromptSeed} as proof. ${sharedContext} Lead with the result, consequence, or concrete signal before the explanation.`,
      objective: `${args.basePlan.objective} through proof or result`,
      angle: `Use ${primaryPromptSeed} as a proof/result post with a clear outcome and why it mattered.`,
      hookType: "proof",
      mustInclude: dedupeStrings([
        ...args.basePlan.mustInclude,
        "Open with a result, signal, or proof point.",
        "Make the takeaway feel concrete and earned.",
      ]),
      mustAvoid: sharedAvoid,
    },
    {
      id: "mistake_turning_point",
      label: "Mistake / Turning Point",
      prompt: `Write a shortform X post about the mistake or turning point inside ${secondaryPromptSeed}. ${sharedContext} Lead with the wrong assumption, tension, or turning point before the lesson.`,
      objective: `${args.basePlan.objective} through a mistake or turning point`,
      angle: `Center the mistake, false start, or turning point from ${secondaryPromptSeed}, then land the lesson plainly.`,
      hookType: "turning_point",
      mustInclude: dedupeStrings([
        ...args.basePlan.mustInclude,
        "Name the mistake, wrong assumption, or turning point early.",
        "Keep the payoff grounded in what actually changed.",
      ]),
      mustAvoid: sharedAvoid,
    },
    {
      id: "playbook_breakdown",
      label: "Playbook / Breakdown",
      prompt: `Write a shortform X post that turns ${primaryPromptSeed} into a simple breakdown. ${sharedContext} Make it practical, skimmable, and framed like a reusable playbook instead of a diary entry.`,
      objective: `${args.basePlan.objective} through a practical breakdown`,
      angle: `Turn ${primaryPromptSeed} into a playbook/breakdown post someone can apply immediately.`,
      hookType: "breakdown",
      mustInclude: dedupeStrings([
        ...args.basePlan.mustInclude,
        "Frame it as a simple breakdown or repeatable playbook.",
        "Keep the steps concrete and skimmable.",
      ]),
      mustAvoid: sharedAvoid,
    },
  ];

  const deduped = new Map<string, DraftBundleBrief>();
  for (const brief of briefs) {
    const key = normalizeLine(brief.prompt).toLowerCase();
    if (!deduped.has(key)) {
      deduped.set(key, brief);
    }
  }

  return Array.from(deduped.values());
}
