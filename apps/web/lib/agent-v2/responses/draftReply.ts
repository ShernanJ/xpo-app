import type { DraftPreference } from "../contracts/chat";
import type { VoiceStyleCard } from "../core/styleProfile";
import type {
  DraftRevisionChangeKind,
  DraftRevisionTargetFormat,
} from "../capabilities/revision/draftRevision.ts";
import {
  buildCadenceReply,
  resolveCadenceProfile,
} from "./draftReplyCadence.ts";
import {
  mentionsTrim,
  resolveDraftReplyIntent,
} from "./draftReplyIntent.ts";

interface BuildDraftReplyArgs {
  userMessage: string;
  draftPreference: DraftPreference;
  isEdit: boolean;
  issuesFixed?: string[];
  styleCard?: VoiceStyleCard | null;
  revisionChangeKind?: DraftRevisionChangeKind;
  revisionTargetFormat?: DraftRevisionTargetFormat | null;
  directReturn?: boolean;
}

function buildDirectRevisionReply(args: {
  normalized: string;
  revisionChangeKind?: DraftRevisionChangeKind;
  revisionTargetFormat?: DraftRevisionTargetFormat | null;
}): string {
  if (args.revisionTargetFormat === "thread") {
    return "made it a thread.";
  }

  if (
    args.revisionTargetFormat === "shortform" ||
    args.revisionTargetFormat === "longform"
  ) {
    return "collapsed it into one post.";
  }

  if (
    args.revisionChangeKind === "specificity_tune" ||
    /\b(?:punchier|sharper|more specific|less generic|less vague)\b/i.test(args.normalized)
  ) {
    return "sharpened it.";
  }

  if (
    args.revisionChangeKind === "length_trim" ||
    /\b(?:trim|shorter|tighten)\b/i.test(args.normalized)
  ) {
    return "trimmed it.";
  }

  return "updated it.";
}

export function buildDraftReply(args: BuildDraftReplyArgs): string {
  const normalized = args.userMessage.trim().toLowerCase();
  const issuesFixed = args.issuesFixed || [];
  const cadenceProfile = resolveCadenceProfile({
    userMessage: args.userMessage,
    styleCard: args.styleCard,
  });
  const seed = [
    normalized,
    args.draftPreference,
    args.isEdit ? "edit" : "draft",
    issuesFixed.join("|").toLowerCase(),
    cadenceProfile.tone,
    cadenceProfile.lowercase ? "lowercase" : "normal",
  ].join("|");
  const {
    isRevisionRequest,
    canUseTrimSpecificCopy,
    canUseExpandSpecificCopy,
    canUseSpecificityCopy,
  } = resolveDraftReplyIntent({
    normalizedMessage: normalized,
    isEdit: args.isEdit,
    revisionChangeKind: args.revisionChangeKind,
  });

  if (isRevisionRequest) {
    if (args.directReturn) {
      return buildDirectRevisionReply({
        normalized,
        revisionChangeKind: args.revisionChangeKind,
        revisionTargetFormat: args.revisionTargetFormat,
      });
    }

    if (mentionsTrim(issuesFixed) && canUseTrimSpecificCopy) {
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

    if (canUseExpandSpecificCopy) {
      return buildCadenceReply({
        action: {
          blunt: [
            "opened it up and added detail.",
            "made it fuller without changing the angle.",
          ],
          balanced: [
            "opened it up and added detail.",
            "made it longer and kept the angle intact.",
          ],
          warm: [
            "opened it up and added more detail while keeping the same point.",
            "made it fuller without losing the original angle.",
          ],
        },
        followUp: {
          blunt: [
            "want it even fuller?",
            "want another pass?",
          ],
          balanced: [
            "want it even fuller?",
            "does this feel closer?",
          ],
          warm: [
            "want me to add another layer of detail?",
            "does this feel closer to what you wanted?",
          ],
        },
        profile: cadenceProfile,
        seed: `${seed}|rev|expand`,
      });
    }

    if (canUseSpecificityCopy) {
      return buildCadenceReply({
        action: {
          blunt: [
            "sharpened it and made the point clearer.",
            "made it more specific without changing the angle.",
          ],
          balanced: [
            "sharpened it and made the point clearer.",
            "made it more specific without changing the angle.",
          ],
          warm: [
            "sharpened it and made the point more concrete without changing the angle.",
            "made it less generic while keeping the same point.",
          ],
        },
        followUp: {
          blunt: [
            "want it even sharper?",
            "want another pass?",
          ],
          balanced: [
            "want it even sharper?",
            "does this feel clearer?",
          ],
          warm: [
            "want me to sharpen it one more step?",
            "does this feel clearer now?",
          ],
        },
        profile: cadenceProfile,
        seed: `${seed}|rev|specificity`,
      });
    }

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
          "kept this in your voice.",
          "drafted it close to your tone.",
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

  if (mentionsTrim(issuesFixed) && canUseTrimSpecificCopy) {
    return buildCadenceReply({
      action: {
        blunt: [
          "kept it tight.",
          "tightened it so it reads fast.",
        ],
        balanced: [
          "kept it tight.",
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
          "drafted it from that angle.",
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
        "drafted a version.",
        "ran with this.",
        "put together a draft.",
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
