import { z } from "zod";
import { fetchJsonFromGroq } from "./llm";
import type { VoiceStyleCard } from "../core/styleProfile";
import type {
  ConversationState,
  DraftFormatPreference,
  DraftPreference,
} from "../contracts/chat";
import {
  buildAntiPatternBlock,
  buildConversationToneBlock,
  buildDraftPreferenceBlock,
  buildFormatPreferenceBlock,
  buildGoalHydrationBlock,
  buildStateHydrationBlock,
  buildVoiceHydrationBlock,
} from "../prompts/promptHydrator";
import type { DraftRevisionDirective } from "../orchestrator/draftRevision";
import {
  collectGroundingFactualAuthority,
  type GroundingPacket,
} from "../orchestrator/groundingPacket";
import {
  trimToXCharacterLimit,
  type ThreadFramingStyle,
} from "../../onboarding/draftArtifacts";

export const ReviserOutputSchema = z.object({
  revisedDraft: z.string().describe("The revised draft text"),
  supportAsset: z.string().nullable().describe("Idea for what image or video to attach"),
  issuesFixed: z.array(z.string()).describe("Short list of what changed"),
});

export type ReviserOutput = z.infer<typeof ReviserOutputSchema>;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanupEditedDraft(text: string): string {
  return text
    .replace(/\(\s*\)/g, "")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,.;:!?]){2,}/g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripEmojiCharacters(value: string): string {
  return value.replace(/[\p{Extended_Pictographic}\uFE0F]/gu, "");
}

function tryDeterministicPhraseRemoval(args: {
  activeDraft: string;
  targetText: string | null;
  maxCharacterLimit: number;
}): ReviserOutput | null {
  if (!args.targetText) {
    return null;
  }

  const escapedTarget = escapeRegExp(args.targetText);
  const parentheticalPattern = new RegExp(`\\s*\\([^)]*${escapedTarget}[^)]*\\)`, "i");
  const phrasePattern = new RegExp(escapedTarget, "i");
  let nextDraft = args.activeDraft;

  if (parentheticalPattern.test(nextDraft)) {
    nextDraft = nextDraft.replace(parentheticalPattern, "");
  } else if (phrasePattern.test(nextDraft)) {
    nextDraft = nextDraft.replace(phrasePattern, "");
  } else {
    return null;
  }

  nextDraft = trimToXCharacterLimit(cleanupEditedDraft(nextDraft), args.maxCharacterLimit);
  if (!nextDraft) {
    return null;
  }

  return {
    revisedDraft: nextDraft,
    supportAsset: null,
    issuesFixed: [`Removed or replaced "${args.targetText}".`],
  };
}

function tryDeterministicLastLineRemoval(args: {
  activeDraft: string;
  maxCharacterLimit: number;
}): ReviserOutput | null {
  const lines = args.activeDraft
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  if (lines.length <= 1) {
    return null;
  }

  const nextDraft = trimToXCharacterLimit(
    cleanupEditedDraft(lines.slice(0, -1).join("\n")),
    args.maxCharacterLimit,
  );
  if (!nextDraft) {
    return null;
  }

  return {
    revisedDraft: nextDraft,
    supportAsset: null,
    issuesFixed: ["Removed the final line or CTA."],
  };
}

function tryDeterministicEmojiRemoval(args: {
  activeDraft: string;
  maxCharacterLimit: number;
}): ReviserOutput | null {
  const stripped = cleanupEditedDraft(stripEmojiCharacters(args.activeDraft));
  if (!stripped || stripped === args.activeDraft.trim()) {
    return null;
  }

  const nextDraft = trimToXCharacterLimit(stripped, args.maxCharacterLimit);
  if (!nextDraft) {
    return null;
  }

  return {
    revisedDraft: nextDraft,
    supportAsset: null,
    issuesFixed: ["Removed emojis and kept the draft otherwise intact."],
  };
}

function buildRevisionChangeGuidance(
  revision: DraftRevisionDirective,
  maxCharacterLimit: number,
): string {
  if (revision.changeKind === "hook_only_edit") {
    return `
HOOK EDIT MODE:
- Rewrite only the opening beat unless a tiny downstream flow fix is necessary.
- Keep the body, claims, and core point materially the same.
- Do NOT use a hook rewrite as an excuse to add new proof, metrics, named entities, or product claims.
    `.trim();
  }

  if (revision.changeKind === "specificity_tune") {
    return `
SPECIFICITY MODE:
- The user wants the draft to feel less generic, not more embellished.
- Sharpen abstract wording into clearer concrete language only when that wording is already supported by the draft, current user note, recent chat, or grounding packet.
- Do NOT add invented metrics, outcomes, experiments, customer names, product mechanics, follower spikes, or autobiographical proof to make it sound more specific.
- If grounded specifics are thin, improve specificity through cleaner verbs, tighter nouns, clearer sequencing, or a more direct point instead of inventing evidence.
- Keep the same overall angle and structure unless a tiny flow fix is necessary.
    `.trim();
  }

  if (revision.changeKind === "tone_shift") {
    return `
TONE SHIFT MODE:
- Change the feel, not the facts.
- You may soften, sharpen, humanize, or de-corporatize the wording, but keep the same substantive claims and overall structure unless the flow clearly breaks.
- Do NOT add new proof, results, experiments, customer names, or autobiographical details to make the tone feel stronger.
    `.trim();
  }

  if (revision.changeKind === "length_expand") {
    return `
EXPANSION MODE:
- The user asked for a fuller version, not a new angle.
- Add detail by unpacking points already present in the draft, recent chat, topic anchors, or hard grounding.
- Do NOT introduce new proof points, experiments, tactics, metrics, follower spikes, timelines, product behavior, or first-person claims unless they already appear in grounded context.
- If the source material is thin, expand through clarity, explanation, sequence, or sharper phrasing instead of inventing specifics.
- Still stay under ${maxCharacterLimit.toLocaleString()} weighted X characters.
    `.trim();
  }

  if (revision.changeKind === "full_rewrite") {
    return `
FULL REWRITE MODE:
- A full rewrite may change structure and phrasing, but it must still stay inside the same factual boundary.
- You may rebuild the flow, but do NOT introduce new proof points, customer names, product mechanics, timelines, outcomes, or autobiographical claims unless they are already grounded.
    `.trim();
  }

  if (revision.changeKind === "generic") {
    return `
GENERIC EDIT MODE:
- Interpret the request conservatively.
- Prefer the smallest meaningful edit that satisfies the user's note.
- Stay close to the current draft's claims, structure, and factual content.
- Do NOT add new proof, metrics, outcomes, customer names, product behavior, or autobiographical details just to make the revision sound stronger.
    `.trim();
  }

  return "";
}

function buildRevisionGroundingBlock(
  groundingPacket: GroundingPacket | null | undefined,
): string {
  if (!groundingPacket) {
    return "";
  }

  const sourceMaterialLines = groundingPacket.sourceMaterials
    .slice(0, 3)
    .map((item) => {
      const claim = item.claims[0] ? ` | claim: ${item.claims[0]}` : "";
      const snippet = item.snippets[0] ? ` | snippet: ${item.snippets[0]}` : "";
      return `- [${item.type}] ${item.title}${claim}${snippet}`;
    });
  const factualAuthority = collectGroundingFactualAuthority(groundingPacket);

  return `
GROUNDING PACKET:
- Durable facts: ${groundingPacket.durableFacts.join(" | ") || "None"}
- Turn grounding: ${groundingPacket.turnGrounding.join(" | ") || "None"}
- Allowed first-person claims: ${groundingPacket.allowedFirstPersonClaims.join(" | ") || "None"}
- Allowed numbers: ${groundingPacket.allowedNumbers.join(" | ") || "None"}
- Unknowns: ${groundingPacket.unknowns.join(" | ") || "None"}
- Voice context hints: ${groundingPacket.voiceContextHints?.join(" | ") || "None"}
- Factual authority: ${factualAuthority.join(" | ") || "None"}
${sourceMaterialLines.length > 0 ? `- Source material details:\n${sourceMaterialLines.join("\n")}` : "- Source material details: None"}

Use this packet as the factual boundary for any revision.
Voice context hints can shape emphasis or lane, but they are not factual support by themselves.
Do not upgrade voice/style examples into proof unless the same detail appears in the factual authority above.
If a detail is not supported here, in the current draft, or in the current user note, do not add it.
If the user asks for more specificity but the packet is thin, make the draft clearer or fuller without inventing proof.
  `.trim();
}

export async function generateRevisionDraft(args: {
  activeDraft: string;
  revision: DraftRevisionDirective;
  styleCard: VoiceStyleCard | null;
  topicAnchors: string[];
  activeConstraints: string[];
  recentHistory: string;
  options?: {
    conversationState?: ConversationState;
    antiPatterns?: string[];
    maxCharacterLimit?: number;
    threadPostMaxCharacterLimit?: number;
    goal?: string;
    draftPreference?: DraftPreference;
    formatPreference?: DraftFormatPreference;
    threadFramingStyle?: ThreadFramingStyle | null;
    sourceUserMessage?: string;
    groundingPacket?: GroundingPacket | null;
  };
}): Promise<ReviserOutput | null> {
  const conversationState = args.options?.conversationState || "editing";
  const antiPatterns = args.options?.antiPatterns || [];
  const maxCharacterLimit = args.options?.maxCharacterLimit ?? 280;
  const threadPostMaxCharacterLimit = args.options?.threadPostMaxCharacterLimit ?? null;
  const goal = args.options?.goal || "audience growth";
  const draftPreference = args.options?.draftPreference || "balanced";
  const formatPreference = args.options?.formatPreference || "shortform";
  const threadFramingStyle = args.options?.threadFramingStyle || null;
  const sourceUserMessage = args.options?.sourceUserMessage?.trim() || "";
  const revisionChangeGuidance = buildRevisionChangeGuidance(
    args.revision,
    maxCharacterLimit,
  );
  const groundingBlock = buildRevisionGroundingBlock(args.options?.groundingPacket);

  if (args.revision.changeKind === "local_phrase_edit") {
    const deterministic = tryDeterministicPhraseRemoval({
      activeDraft: args.activeDraft,
      targetText: args.revision.targetText,
      maxCharacterLimit,
    });

    if (deterministic) {
      return deterministic;
    }
  }

  if (args.revision.changeKind === "line_level_edit") {
    const deterministic = tryDeterministicLastLineRemoval({
      activeDraft: args.activeDraft,
      maxCharacterLimit,
    });

    if (deterministic) {
      return deterministic;
    }
  }

  if (args.revision.changeKind === "emoji_cleanup") {
    const deterministic = tryDeterministicEmojiRemoval({
      activeDraft: args.activeDraft,
      maxCharacterLimit,
    });

    if (deterministic) {
      return deterministic;
    }
  }

  const instruction = `
You are an elite X (Twitter) revision editor.
Your job is to revise an existing draft with minimal drift.

${buildConversationToneBlock("draft")}
${buildGoalHydrationBlock(goal, "draft")}
${buildStateHydrationBlock(conversationState, "draft")}
${buildDraftPreferenceBlock(draftPreference, "draft")}
${buildFormatPreferenceBlock(formatPreference, "draft")}
${buildVoiceHydrationBlock(args.styleCard)}
${buildAntiPatternBlock(antiPatterns)}

CURRENT DRAFT (THIS IS THE CANONICAL BASE TEXT):
${args.activeDraft}

CURRENT USER NOTE:
${sourceUserMessage || args.revision.instruction}

REVISION REQUEST:
${args.revision.instruction}

RECENT CHAT HISTORY:
${args.recentHistory}

TOPIC / VOICE REFERENCES:
${args.topicAnchors.join("\n---") || "None"}

ACTIVE SESSION CONSTRAINTS:
${args.activeConstraints.join(" | ") || "None"}

${revisionChangeGuidance ? `${revisionChangeGuidance}\n` : ""}
${groundingBlock ? `${groundingBlock}\n` : ""}

REQUIREMENTS:
1. Preserve the subject, core meaning, and overall structure unless the revision request explicitly asks for a deeper rewrite.
2. Apply only the requested change. Prefer local edits over fresh reframing.
3. Never invent a new angle, new premise, or random new hook unless the user explicitly asks for one.
4. If the user is removing or questioning a specific phrase, remove or replace that phrase and keep the rest as intact as possible.
5. If this is a local phrase edit or line-level edit, preserve all non-targeted lines.
6. If this is a hook-only edit, rewrite only the opening beat and preserve the body.
7. If this is a tone shift, you may rewrite wording but keep the same structure unless the flow truly breaks.
8. Only a full rewrite may substantially restructure the post. If the revision request converts a single post into a thread, you may rebuild the flow across posts instead of mechanically chopping the original draft into fragments.
9. Keep the draft sounding like the user. Match their casing and pacing.
10. If the user uses list markers like "-" or ">", preserve that formatting style when the revised draft uses lists.
11. Verification is not a professionalism signal. Do not make the revision sound more polished or corporate just because the account is verified.
12. HARD LENGTH CAP: the revised draft must stay at or under ${maxCharacterLimit.toLocaleString()} weighted X characters. If this is a thread, keep every post under ${threadPostMaxCharacterLimit?.toLocaleString() || "the account's allowed"} weighted X character limit, and do not over-compress verified-account thread posts toward legacy 280-character brevity when a fuller beat would read better.${buildThreadFramingRequirement(threadFramingStyle)}
13. If any Active Session Constraint starts with "Correction lock:" or "Topic grounding:", treat it as hard factual grounding.
14. X does NOT support markdown styling. Remove or avoid bold, italics, headings, or markdown markers like **text**, __text__, *text*, # heading, or backticks.
15. Do NOT introduce empty engagement-bait CTAs like "reply 'FOCUS'" or "comment 'X'" unless the reader clearly gets something concrete in return (DM, template, checklist, link, copy, or access). If there is no real payoff, use a more natural CTA.
16. Do NOT add new metrics, results, follower spikes, experiments, timelines, named customers, product mechanics, or autobiographical usage claims unless they already exist in the current draft, current user note, or grounding packet.

Respond ONLY with valid JSON:
{
  "revisedDraft": "...",
  "supportAsset": null,
  "issuesFixed": ["what changed"]
}
  `.trim();

  const data = await fetchJsonFromGroq<unknown>({
    model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    reasoning_effort: "medium",
    temperature: 0.25,
    max_tokens: 4096,
    messages: [
      { role: "system", content: instruction },
      { role: "user", content: "Revise the draft now." },
    ],
  });

  if (!data) {
    return null;
  }

  try {
    const parsed = ReviserOutputSchema.parse(data);
    return {
      ...parsed,
      revisedDraft: trimToXCharacterLimit(parsed.revisedDraft, maxCharacterLimit),
    };
  } catch (error) {
    console.error("Reviser validation failed", error);
    return null;
  }
}

function buildThreadFramingRequirement(
  threadFramingStyle: ThreadFramingStyle | null,
): string {
  switch (threadFramingStyle) {
    case "numbered":
      return " If this is a thread revision, preserve or apply numbered framing like 1/5, 2/5, 3/5 across the posts, but keep the opener readable and avoid dense bullet blocks.";
    case "soft_signal":
      return " If this is a thread revision, make the opener feel naturally threaded through a clean opening sentence or short setup paragraph. Avoid x/x numbering unless the user explicitly asks for it, and avoid canned prefixes like here's what happened unless they genuinely fit.";
    case "none":
      return " If this is a thread revision, keep the framing natural and avoid x/x numbering or explicit thread labels unless the user explicitly asks for them. Avoid a list-heavy opener.";
    default:
      return "";
  }
}
