import type { VoiceStyleCard } from "../core/styleProfile";
import type { CreatorChatQuickReply, StrategyPlan } from "../contracts/chat";
import { compactTopicLabel } from "./draftTopicSelector.ts";
import {
  applyQuickReplyVoiceCase,
  normalizeQuickReplyLabel,
  resolveQuickReplyVoiceProfile,
} from "./quickReplyVoice.ts";

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
  const voice = resolveQuickReplyVoiceProfile(args.styleCard);
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
    const tightenValue = applyQuickReplyVoiceCase(
      pickDeterministic(
        [
          "keep the same direction, but make the framing tighter and more concrete.",
          "same angle, but sharpen the hook and trim the filler.",
        ],
        `${seed}|reject|tighten`,
      ),
      voice,
    );
    const personalValue = applyQuickReplyVoiceCase(
      pickDeterministic(
        [
          "keep the topic, but make it more personal and story-led using a real moment i can stand behind.",
          "same topic, but shift it to a personal, lived example instead of generic framing.",
        ],
        `${seed}|reject|personal`,
      ),
      voice,
    );
    const differentAngleValue = applyQuickReplyVoiceCase(
      topicLabel
        ? `same topic (${topicLabel}), different angle. avoid repeating the last framing.`
        : "same topic, different angle. avoid repeating the last framing.",
      voice,
    );

    return [
      {
        kind: "planner_action",
        value: tightenValue,
        label: normalizeQuickReplyLabel(
          voice.concise ? "same angle, sharper hook" : "keep angle, sharper hook",
          voice,
        ),
        explicitIntent: "planner_feedback",
      },
      {
        kind: "planner_action",
        value: personalValue,
        label: normalizeQuickReplyLabel(
          voice.concise ? "make it more personal" : "same topic, more personal",
          voice,
        ),
        explicitIntent: "planner_feedback",
      },
      {
        kind: "planner_action",
        value: differentAngleValue,
        label: normalizeQuickReplyLabel(
          topicLabel ? `new angle on ${topicLabel}` : "try different angle",
          voice,
        ),
        explicitIntent: "planner_feedback",
      },
    ];
  }

  const approveValue = applyQuickReplyVoiceCase(
    pickDeterministic(
      [
        "looks good. write this version now.",
        "this works. draft this version.",
      ],
      `${seed}|approve|ship`,
    ),
    voice,
  );
  const tightenValue = applyQuickReplyVoiceCase(
    pickDeterministic(
      [
        "keep this angle, but tighten the framing, sharpen the hook, and remove filler.",
        "same direction, but make the opening punchier and the language tighter.",
      ],
      `${seed}|approve|tighten`,
    ),
    voice,
  );
  const newAngleValue = applyQuickReplyVoiceCase(
    topicLabel
      ? `same topic (${topicLabel}), but give me a different angle that feels fresher.`
      : "same topic, but give me a different angle that feels fresher.",
    voice,
  );

  return [
    {
      kind: "planner_action",
      value: approveValue,
      label: normalizeQuickReplyLabel(
        voice.concise ? "write this" : "write this version",
        voice,
      ),
      explicitIntent: "planner_feedback",
    },
    {
      kind: "planner_action",
      value: tightenValue,
      label: normalizeQuickReplyLabel(
        voice.concise ? "same angle, sharper hook" : "keep angle, sharpen hook",
        voice,
      ),
      explicitIntent: "planner_feedback",
    },
    {
      kind: "planner_action",
      value: newAngleValue,
      label: normalizeQuickReplyLabel(
        topicLabel ? `new angle on ${topicLabel}` : "different angle",
        voice,
      ),
      explicitIntent: "planner_feedback",
    },
  ];
}
