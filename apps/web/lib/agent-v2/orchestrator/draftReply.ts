import type { DraftPreference } from "../contracts/chat";
import type { VoiceStyleCard } from "../core/styleProfile";

interface BuildDraftReplyArgs {
  userMessage: string;
  draftPreference: DraftPreference;
  isEdit: boolean;
  issuesFixed?: string[];
  styleCard?: VoiceStyleCard | null;
}

type CadenceTone = "blunt" | "balanced" | "warm";

interface CadenceProfile {
  lowercase: boolean;
  tone: CadenceTone;
}

interface ToneBuckets {
  blunt: string[];
  balanced: string[];
  warm: string[];
}

function deterministicIndex(seed: string, modulo: number): number {
  if (modulo <= 1) {
    return 0;
  }

  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 33 + seed.charCodeAt(index)) >>> 0;
  }

  return hash % modulo;
}

function pickDeterministic(options: string[], seed: string): string {
  return options[deterministicIndex(seed, options.length)];
}

function mentionsTrim(issuesFixed: string[]): boolean {
  return issuesFixed.some((issue) => issue.toLowerCase().includes("trimmed"));
}

function inferLowercasePreference(styleCard: VoiceStyleCard | null | undefined): boolean {
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

function inferCadenceTone(
  userMessage: string,
  styleCard: VoiceStyleCard | null | undefined,
): CadenceTone {
  const normalized = userMessage.trim().toLowerCase();
  const styleSignals = [
    styleCard?.pacing || "",
    ...(styleCard?.customGuidelines || []),
    ...(styleCard?.sentenceOpenings || []),
    ...(styleCard?.sentenceClosers || []),
  ]
    .join(" ")
    .toLowerCase();

  let bluntScore = 0;
  let warmScore = 0;

  if (styleCard?.userPreferences?.writingGoal === "growth_first") {
    bluntScore += 1;
  }
  if (styleCard?.userPreferences?.writingGoal === "voice_first") {
    warmScore += 1;
  }

  if (
    [
      "blunt",
      "direct",
      "tight",
      "concise",
      "short",
      "punchy",
      "no fluff",
    ].some((cue) => styleSignals.includes(cue))
  ) {
    bluntScore += 2;
  }

  if (
    [
      "warm",
      "friendly",
      "human",
      "casual",
      "conversational",
      "supportive",
      "empathetic",
      "playful",
    ].some((cue) => styleSignals.includes(cue))
  ) {
    warmScore += 2;
  }

  if (
    [
      "just",
      "do it",
      "write it",
      "ship it",
      "go ahead",
      "make it",
      "tighten",
      "shorter",
      "faster",
      "quick",
    ].some((cue) => normalized.includes(cue))
  ) {
    bluntScore += 1;
  }

  if (
    [
      "please",
      "pls",
      "could you",
      "can you",
      "would you",
      "thanks",
      "thank you",
      "appreciate",
      "haha",
      "lol",
    ].some((cue) => normalized.includes(cue))
  ) {
    warmScore += 1;
  }

  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  if (wordCount > 0 && wordCount <= 4) {
    bluntScore += 1;
  }

  if (bluntScore >= warmScore + 2) {
    return "blunt";
  }

  if (warmScore >= bluntScore + 2) {
    return "warm";
  }

  return "balanced";
}

function resolveCadenceProfile(args: BuildDraftReplyArgs): CadenceProfile {
  return {
    lowercase: inferLowercasePreference(args.styleCard),
    tone: inferCadenceTone(args.userMessage, args.styleCard),
  };
}

function applyCadenceCase(value: string, profile: CadenceProfile): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!profile.lowercase) {
    return normalized;
  }

  return normalized.toLowerCase();
}

function pickToneOption(
  options: ToneBuckets,
  profile: CadenceProfile,
  seed: string,
): string {
  const bucket =
    profile.tone === "blunt"
      ? options.blunt
      : profile.tone === "warm"
        ? options.warm
        : options.balanced;

  return pickDeterministic(bucket, `${seed}|${profile.tone}`);
}

function buildCadenceReply(args: {
  action: ToneBuckets;
  followUp: ToneBuckets;
  profile: CadenceProfile;
  seed: string;
}): string {
  const actionLine = pickToneOption(args.action, args.profile, `${args.seed}|action`);
  const followUp = pickToneOption(args.followUp, args.profile, `${args.seed}|follow`);
  return applyCadenceCase(`${actionLine} ${followUp}`, args.profile);
}

export function buildDraftReply(args: BuildDraftReplyArgs): string {
  const normalized = args.userMessage.trim().toLowerCase();
  const issuesFixed = args.issuesFixed || [];
  const cadenceProfile = resolveCadenceProfile(args);
  const seed = [
    normalized,
    args.draftPreference,
    args.isEdit ? "edit" : "draft",
    issuesFixed.join("|").toLowerCase(),
    cadenceProfile.tone,
    cadenceProfile.lowercase ? "lowercase" : "normal",
  ].join("|");
  const isRevisionRequest =
    args.isEdit ||
    [
      "edit",
      "change",
      "tweak",
      "revise",
      "rewrite",
      "fix",
      "make it",
      "update",
    ].some((cue) => normalized.includes(cue));

  if (isRevisionRequest) {
    if (args.draftPreference === "voice_first") {
      return buildCadenceReply({
        action: {
          blunt: [
            "updated it in your voice.",
            "reworked it in your tone.",
          ],
          balanced: [
            "updated it and kept your voice intact.",
            "made that edit in your tone.",
            "reworked it in your voice.",
          ],
          warm: [
            "updated it in your voice and kept it natural.",
            "reworked it to stay true to your tone.",
          ],
        },
        followUp: {
          blunt: [
            "want one more tweak?",
            "want another pass?",
          ],
          balanced: [
            "want another pass?",
            "want me to tune it more?",
            "does this work better?",
          ],
          warm: [
            "want another tweak?",
            "want me to tune it a bit more?",
          ],
        },
        profile: cadenceProfile,
        seed: `${seed}|rev|voice`,
      });
    }

    if (args.draftPreference === "growth_first") {
      return buildCadenceReply({
        action: {
          blunt: [
            "updated it with a sharper hook.",
            "tightened the framing for reach.",
          ],
          balanced: [
            "updated it with a sharper hook.",
            "tightened the framing for reach.",
            "reworked the opening to hit faster.",
          ],
          warm: [
            "updated it and sharpened the hook for reach.",
            "reworked the opening so it lands faster.",
          ],
        },
        followUp: {
          blunt: [
            "want it even punchier?",
            "want one more tweak?",
          ],
          balanced: [
            "want it punchier?",
            "want another tweak?",
            "want me to push it further?",
          ],
          warm: [
            "want me to tweak the hook more?",
            "want me to tune it further?",
          ],
        },
        profile: cadenceProfile,
        seed: `${seed}|rev|growth`,
      });
    }

    if (mentionsTrim(issuesFixed)) {
      return buildCadenceReply({
        action: {
          blunt: [
            "trimmed it down and kept the point tight.",
            "shortened it and cleaned the flow.",
          ],
          balanced: [
            "trimmed it down and kept the point tight.",
            "shortened it and cleaned the flow.",
          ],
          warm: [
            "trimmed it down while keeping the point intact.",
            "shortened it and smoothed the flow.",
          ],
        },
        followUp: {
          blunt: [
            "want it tighter?",
            "want another trim pass?",
          ],
          balanced: [
            "want it tighter?",
            "good to post or trim more?",
          ],
          warm: [
            "want one more trim pass?",
            "good to post or trim more?",
          ],
        },
        profile: cadenceProfile,
        seed: `${seed}|rev|trim`,
      });
    }

    return buildCadenceReply({
      action: {
        blunt: [
          "made the edit.",
          "updated it based on your note.",
        ],
        balanced: [
          "made the edit.",
          "updated it based on your note.",
        ],
        warm: [
          "made the edit based on your note.",
          "updated it and kept your direction.",
        ],
      },
      followUp: {
        blunt: [
          "want another tweak?",
          "does this work better?",
        ],
        balanced: [
          "does this work better?",
          "want another tweak?",
        ],
        warm: [
          "want any tweaks?",
          "want me to keep tuning it?",
        ],
      },
      profile: cadenceProfile,
      seed: `${seed}|rev|default`,
    });
  }

  if (args.draftPreference === "voice_first") {
    return buildCadenceReply({
      action: {
        blunt: [
          "drafted it in your voice.",
          "kept this close to your tone.",
        ],
        balanced: [
          "ran with your angle and kept it in your voice.",
          "drafted this to sound like you.",
          "put together a version that stays natural to your tone.",
        ],
        warm: [
          "ran with your angle and kept it true to your voice.",
          "put together this version to feel natural to your tone.",
        ],
      },
      followUp: {
        blunt: [
          "want a tweak?",
          "want another pass?",
        ],
        balanced: [
          "want changes?",
          "want another pass?",
          "want edits?",
        ],
        warm: [
          "want any tweaks?",
          "want me to tune it more?",
        ],
      },
      profile: cadenceProfile,
      seed: `${seed}|draft|voice`,
    });
  }

  if (args.draftPreference === "growth_first") {
    return buildCadenceReply({
      action: {
        blunt: [
          "drafted it with a stronger hook for reach.",
          "leaned into sharper framing.",
        ],
        balanced: [
          "ran with a stronger hook for reach.",
          "drafted it with a growth-first opening.",
          "leaned into a sharper framing.",
        ],
        warm: [
          "drafted it with a stronger growth hook.",
          "leaned into a sharper opening for reach.",
        ],
      },
      followUp: {
        blunt: [
          "want it softer or punchier?",
          "push it further or keep it balanced?",
        ],
        balanced: [
          "want it softer or punchier?",
          "want me to tune the tone?",
          "push it further or keep it balanced?",
        ],
        warm: [
          "want me to tune the tone?",
          "want me to adjust the framing?",
        ],
      },
      profile: cadenceProfile,
      seed: `${seed}|draft|growth`,
    });
  }

  if (mentionsTrim(issuesFixed)) {
    return buildCadenceReply({
      action: {
        blunt: [
          "kept it tight and post-ready.",
          "tightened it so it reads fast.",
        ],
        balanced: [
          "kept it tight and post-ready.",
          "tightened it up so it reads fast.",
        ],
        warm: [
          "kept it tight while preserving the point.",
          "tightened it so it reads fast and clean.",
        ],
      },
      followUp: {
        blunt: [
          "want it even tighter?",
          "good to post or trim more?",
        ],
        balanced: [
          "want it even tighter?",
          "good to post or trim more?",
        ],
        warm: [
          "want another trim pass?",
          "good to post or tighten more?",
        ],
      },
      profile: cadenceProfile,
      seed: `${seed}|draft|trim`,
    });
  }

  if (
    ["looks good", "write it", "draft it", "go ahead", "ship it"].some((cue) =>
      normalized.includes(cue),
    )
  ) {
    return buildCadenceReply({
      action: {
        blunt: [
          "ran with that idea and drafted this.",
          "drafted it as-is.",
        ],
        balanced: [
          "ran with that idea and drafted this.",
          "put together the draft from that angle.",
          "drafted it as-is.",
        ],
        warm: [
          "ran with that idea and drafted this version for you.",
          "put together this draft from that angle.",
        ],
      },
      followUp: {
        blunt: [
          "want tweaks before posting?",
          "adjust tone, hook, or length?",
        ],
        balanced: [
          "want tweaks before posting?",
          "want changes?",
          "adjust tone, hook, or length?",
        ],
        warm: [
          "want any tweaks before posting?",
          "want me to adjust tone, hook, or length?",
        ],
      },
      profile: cadenceProfile,
      seed: `${seed}|draft|approved`,
    });
  }

  return buildCadenceReply({
    action: {
      blunt: [
        "drafted a version.",
        "put together a draft.",
      ],
      balanced: [
        "drafted a version for you.",
        "here's one take.",
        "put together a draft you can use.",
      ],
      warm: [
        "put together a draft for you.",
        "ran with this direction and drafted a version.",
      ],
    },
    followUp: {
      blunt: [
        "what should i tweak?",
        "tune tone, hook, or length?",
      ],
      balanced: [
        "what should i tweak?",
        "tune tone, hook, or length?",
        "want another pass?",
      ],
      warm: [
        "what should i tweak?",
        "want me to tune tone, hook, or length?",
      ],
    },
    profile: cadenceProfile,
    seed: `${seed}|draft|default`,
  });
}
