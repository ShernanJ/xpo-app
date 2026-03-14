import type { VoiceStyleCard } from "../core/styleProfile";
import type { CreatorChatQuickReply, StrategyPlan } from "../contracts/chat";

function compactTopicLabel(value: string): string {
  const cleaned = value
    .trim()
    .replace(/^[@#]+/, "")
    .replace(/[.?!,]+$/, "")
    .replace(/\s+/g, " ");

  if (!cleaned) {
    return "your usual lane";
  }

  const reduced =
    cleaned.split(/\b(?:while|because|but|so|and|with)\b/i)[0].trim() || cleaned;
  const words = reduced.split(/\s+/);
  const compact = words.length > 5 ? words.slice(0, 5).join(" ") : reduced;
  return compact.length > 34 ? `${compact.slice(0, 31).trimEnd()}...` : compact;
}

type PlannerQuickReplyContext = "approval" | "reject";

interface BuildPlannerQuickRepliesArgs {
  plan: StrategyPlan | null;
  styleCard: VoiceStyleCard | null;
  seedTopic?: string | null;
  context?: PlannerQuickReplyContext;
}

function deterministicIndex(seed: string, modulo: number): number {
  if (modulo <= 1) {
    return 0;
  }

  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  return hash % modulo;
}

function pickDeterministic(options: string[], seed: string): string {
  return options[deterministicIndex(seed, options.length)];
}

function inferLowercasePreference(styleCard: VoiceStyleCard | null): boolean {
  if (!styleCard) {
    return false;
  }

  const explicitCasing = styleCard.userPreferences?.casing;
  if (explicitCasing === "lowercase") {
    return true;
  }
  if (explicitCasing === "normal" || explicitCasing === "uppercase") {
    return false;
  }

  const signals = [
    ...(styleCard.formattingRules || []),
    ...(styleCard.customGuidelines || []),
  ]
    .join(" ")
    .toLowerCase();

  return (
    signals.includes("all lowercase") ||
    signals.includes("always lowercase") ||
    signals.includes("never uses capitalization") ||
    signals.includes("no uppercase")
  );
}

function inferConcisePreference(styleCard: VoiceStyleCard | null): boolean {
  const pacing = styleCard?.pacing?.toLowerCase() || "";
  const guidance = (styleCard?.customGuidelines || []).join(" ").toLowerCase();
  const writingGoal = styleCard?.userPreferences?.writingGoal;

  return (
    writingGoal === "growth_first" ||
    pacing.includes("short") ||
    pacing.includes("punchy") ||
    pacing.includes("bullet") ||
    pacing.includes("scan") ||
    guidance.includes("blunt") ||
    guidance.includes("direct") ||
    guidance.includes("tight")
  );
}

function applyVoiceCase(value: string, lowercase: boolean): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!lowercase) {
    return normalized;
  }

  return normalized.toLowerCase();
}

function titleCaseLabel(value: string): string {
  return value.replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

function normalizeLabel(value: string, lowercase: boolean): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  const base = lowercase ? trimmed.toLowerCase() : titleCaseLabel(trimmed);
  return base.length > 30 ? `${base.slice(0, 27).trimEnd()}...` : base;
}

function resolveTopicLabel(args: BuildPlannerQuickRepliesArgs): string | null {
  const seed = args.plan?.objective || args.seedTopic || "";
  const compact = compactTopicLabel(seed);
  if (!compact || compact === "your usual lane") {
    return null;
  }

  return compact;
}

export function buildPlannerQuickReplies(
  args: BuildPlannerQuickRepliesArgs,
): CreatorChatQuickReply[] {
  const context = args.context || "approval";
  const lowercase = inferLowercasePreference(args.styleCard);
  const concise = inferConcisePreference(args.styleCard);
  const topicLabel = resolveTopicLabel(args);
  const seed = [
    context,
    args.plan?.objective || "",
    args.plan?.angle || "",
    args.plan?.hookType || "",
    args.styleCard?.pacing || "",
  ]
    .join("|")
    .toLowerCase();

  if (context === "reject") {
    const tightenValue = applyVoiceCase(
      pickDeterministic(
        [
          "keep the same direction, but make the framing tighter and more concrete.",
          "same angle, but sharpen the hook and trim the filler.",
        ],
        `${seed}|reject|tighten`,
      ),
      lowercase,
    );
    const personalValue = applyVoiceCase(
      pickDeterministic(
        [
          "keep the topic, but make it more personal and story-led using a real moment i can stand behind.",
          "same topic, but shift it to a personal, lived example instead of generic framing.",
        ],
        `${seed}|reject|personal`,
      ),
      lowercase,
    );
    const differentAngleValue = applyVoiceCase(
      topicLabel
        ? `same topic (${topicLabel}), different angle. avoid repeating the last framing.`
        : "same topic, different angle. avoid repeating the last framing.",
      lowercase,
    );

    return [
      {
        kind: "planner_action",
        value: tightenValue,
        label: normalizeLabel(
          concise ? "same angle, sharper hook" : "keep angle, sharper hook",
          lowercase,
        ),
        explicitIntent: "planner_feedback",
      },
      {
        kind: "planner_action",
        value: personalValue,
        label: normalizeLabel(
          concise ? "make it more personal" : "same topic, more personal",
          lowercase,
        ),
        explicitIntent: "planner_feedback",
      },
      {
        kind: "planner_action",
        value: differentAngleValue,
        label: normalizeLabel(
          topicLabel ? `new angle on ${topicLabel}` : "try different angle",
          lowercase,
        ),
        explicitIntent: "planner_feedback",
      },
    ];
  }

  const approveValue = applyVoiceCase(
    pickDeterministic(
      [
        "looks good. write this version now.",
        "this works. draft this version.",
      ],
      `${seed}|approve|ship`,
    ),
    lowercase,
  );
  const tightenValue = applyVoiceCase(
    pickDeterministic(
      [
        "keep this angle, but tighten the framing, sharpen the hook, and remove filler.",
        "same direction, but make the opening punchier and the language tighter.",
      ],
      `${seed}|approve|tighten`,
    ),
    lowercase,
  );
  const newAngleValue = applyVoiceCase(
    topicLabel
      ? `same topic (${topicLabel}), but give me a different angle that feels fresher.`
      : "same topic, but give me a different angle that feels fresher.",
    lowercase,
  );

  return [
    {
      kind: "planner_action",
      value: approveValue,
      label: normalizeLabel(
        concise ? "write this" : "write this version",
        lowercase,
      ),
      explicitIntent: "planner_feedback",
    },
    {
      kind: "planner_action",
      value: tightenValue,
      label: normalizeLabel(
        concise ? "same angle, sharper hook" : "keep angle, sharpen hook",
        lowercase,
      ),
      explicitIntent: "planner_feedback",
    },
    {
      kind: "planner_action",
      value: newAngleValue,
      label: normalizeLabel(
        topicLabel ? `new angle on ${topicLabel}` : "different angle",
        lowercase,
      ),
      explicitIntent: "planner_feedback",
    },
  ];
}
