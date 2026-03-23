import { z } from "zod";
import { fetchStructuredJsonFromGroq } from "./llm.ts";
import type { VoiceStyleCard } from "../core/styleProfile.ts";
import type {
  ConversationState,
  DraftFormatPreference,
  DraftPreference,
  SessionConstraint,
  StrategyPlan,
} from "../contracts/chat.ts";
import {
  buildConversationToneBlock,
  buildDraftPreferenceBlock,
  buildFormatPreferenceBlock,
  buildPromptHydrationEnvelope,
  escapeXmlText,
} from "../prompts/promptHydrator.ts";
import type {
  DraftRevisionDirective,
  DraftRevisionTargetSpan,
  DraftRevisionThreadIntent,
} from "../capabilities/revision/draftRevision.ts";
import {
  type CreatorProfileHints,
  type GroundingPacket,
} from "../grounding/groundingPacket.ts";
import { buildGroundingPromptBlock } from "./groundingPromptBlock.ts";
import { buildReviserJsonContract } from "./jsonPromptContracts.ts";
import {
  trimToXCharacterLimit,
  type ThreadFramingStyle,
} from "../../onboarding/draftArtifacts.ts";
import {
  buildEngagementBaitRule,
  buildMarkdownStylingRule,
  buildThreadFramingRequirement,
  buildVerificationProfessionalismRule,
} from "./xPostPromptRules.ts";

export const ReviserOutputSchema = z.object({
  revisedDraft: z.string().describe("The revised draft text"),
  supportAsset: z.string().nullable().describe("Idea for what image or video to attach"),
  issuesFixed: z.array(z.string()).describe("Short list of what changed"),
  coach_note: z
    .string()
    .describe(
      "1-2 sentence explanation of the mechanical changes and why they improve pacing, hook, or readability.",
    )
    .optional(),
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

function buildPhraseRemovalCoachNote(): string {
  return "Cut the flagged phrase to remove clutter and keep the main point landing faster.";
}

function buildLastLineRemovalCoachNote(): string {
  return "Snipped the last line so the post ends on the stronger beat instead of trailing into a softer close.";
}

function buildEmojiCleanupCoachNote(): string {
  return "Removed emojis to tighten the tone and keep the read cleaner.";
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
    coach_note: buildPhraseRemovalCoachNote(),
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
    coach_note: buildLastLineRemovalCoachNote(),
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
    coach_note: buildEmojiCleanupCoachNote(),
  };
}

function buildRevisionChangeGuidance(
  revision: DraftRevisionDirective,
  maxCharacterLimit: number,
): string {
  if (revision.changeKind === "length_trim") {
    return `
LENGTH TRIM MODE:
- The user wants a meaning-preserving compression, not a cosmetic line edit.
- Cut setup, repetition, and lower-value phrasing so the strongest point lands faster.
- Keep the same core idea, factual claims, and overall takeaway unless the wording must be rebuilt to fit cleanly.
- If the current draft is longform and the request is to turn it into a shortform post, compress it into exactly one standalone post instead of returning a lightly shortened near-duplicate.
- Stay under ${maxCharacterLimit.toLocaleString()} weighted X characters.
    `.trim();
  }

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
    const formatSpecificGuidance =
      revision.targetFormat === "thread"
        ? `
- Because the target format is a thread, return a real multi-post serialized thread with distinct beats across posts instead of a slightly longer single post.
- Do not simply chop the original draft into fragments or add thread labels without rebuilding the flow.
        `.trim()
        : revision.targetFormat === "shortform"
          ? `
- Because the target format is shortform, return exactly one standalone post instead of a compressed multi-post structure.
          `.trim()
          : "";

    return `
FULL REWRITE MODE:
- A full rewrite may change structure and phrasing, but it must still stay inside the same factual boundary.
- You may rebuild the flow, but do NOT introduce new proof points, customer names, product mechanics, timelines, outcomes, or autobiographical claims unless they are already grounded.
${formatSpecificGuidance ? formatSpecificGuidance : ""}
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
  return (
    buildGroundingPromptBlock({
      groundingPacket,
      title: "GROUNDING PACKET",
      sourceMaterialLimit: 3,
      claimLabel: "claim",
      snippetLabel: "snippet",
      sourceMaterialFallbackLine: "- Source material details: None",
      guidanceLines: [
        "Use this packet as the factual boundary for any revision.",
        "Voice context hints can shape emphasis or lane, but they are not factual support by themselves.",
        "Do not upgrade voice/style examples into proof unless the same detail appears in the factual authority above.",
        "If a detail is not supported here, in the current draft, or in the current user note, do not add it.",
        "If the user asks for more specificity but the packet is thin, make the draft clearer or fuller without inventing proof.",
      ],
    }) || ""
  );
}

function buildThreadLocalRevisionBlock(args: {
  totalPostCount: number;
  targetSpan: DraftRevisionTargetSpan;
  previousPost: string | null;
  nextPost: string | null;
  threadIntent: DraftRevisionThreadIntent;
  preserveThreadStructure: boolean;
}): string {
  const targetPostCount = args.targetSpan.endIndex - args.targetSpan.startIndex + 1;
  const targetLabel =
    targetPostCount === 1
      ? `post ${args.targetSpan.startIndex + 1}`
      : `posts ${args.targetSpan.startIndex + 1}-${args.targetSpan.endIndex + 1}`;
  const intentLines =
    args.threadIntent === "opening"
      ? [
          "- This span is the opener, so the first targeted post should still function as a hook.",
          "- Return one clean opener post only. Do not include thread separators, a table of contents, or a summary block for the whole thread.",
          "- Make the opener feel like a native hook/introduction with forward pull, not a recap of everything that follows.",
        ].join("\n")
      : args.threadIntent === "ending"
        ? "- This span is the ending, so the final targeted post should still land as a deliberate close or CTA."
        : "";

  return `
THREAD-LOCAL REVISION MODE:
- You are revising only ${targetLabel} of a ${args.totalPostCount}-post serialized thread.
- Return exactly ${targetPostCount} post${targetPostCount === 1 ? "" : "s"} in the revised draft, not the whole thread.
- Keep untouched posts out of the output. The caller will reassemble the full thread around your revised span.
- Maintain continuity with the surrounding posts so the stitched thread reads naturally.
${args.preserveThreadStructure ? "- Do not change the number of posts in the targeted span." : ""}
${intentLines}
- Previous post context: ${args.previousPost || "None"}
- Next post context: ${args.nextPost || "None"}
  `.trim();
}

function buildRevisionInputBlock(args: {
  previousDraft: string;
  userCritique: string | null;
  criticAnalysis: string | null;
}): string {
  return [
    "REVISION INPUTS:",
    `<previous_draft>${escapeXmlText(args.previousDraft)}</previous_draft>`,
    `<user_critique>${escapeXmlText(args.userCritique?.trim() || "None provided.")}</user_critique>`,
    `<critic_analysis>${escapeXmlText(args.criticAnalysis?.trim() || "")}</critic_analysis>`,
  ].join("\n");
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
    userCritique?: string | null;
    criticAnalysis?: string | null;
    sessionConstraints?: SessionConstraint[];
    creatorProfileHints?: CreatorProfileHints | null;
    userContextString?: string;
    activeTaskSummary?: string | null;
    activePlan?: StrategyPlan | null;
    liveContext?: string;
    threadRevisionContext?: {
      totalPostCount: number;
      targetSpan: DraftRevisionTargetSpan;
      previousPost: string | null;
      nextPost: string | null;
      threadIntent: DraftRevisionThreadIntent;
      preserveThreadStructure: boolean;
    } | null;
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
  const userCritique = args.options?.userCritique?.trim() || sourceUserMessage || args.revision.instruction;
  const criticAnalysis = args.options?.criticAnalysis?.trim() || "";
  const revisionChangeGuidance = buildRevisionChangeGuidance(
    args.revision,
    maxCharacterLimit,
  );
  const groundingBlock = buildRevisionGroundingBlock(args.options?.groundingPacket);
  const threadLocalRevisionBlock = args.options?.threadRevisionContext
    ? buildThreadLocalRevisionBlock(args.options.threadRevisionContext)
    : "";
  const hydrationEnvelope = buildPromptHydrationEnvelope({
    mode: "draft",
    goal,
    conversationState,
    styleCard: args.styleCard,
    antiPatterns,
    activeConstraints: args.activeConstraints,
    sessionConstraints: args.options?.sessionConstraints,
    creatorProfileHints: args.options?.creatorProfileHints,
    userContextString: args.options?.userContextString,
    activeTaskSummary: args.options?.activeTaskSummary,
    activePlan: args.options?.activePlan || null,
    activeDraft: args.activeDraft,
    liveContext: args.options?.liveContext,
    latestRefinementInstruction: args.revision.instruction,
  });
  const revisionInputBlock = buildRevisionInputBlock({
    previousDraft: args.activeDraft,
    userCritique,
    criticAnalysis,
  });

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
${hydrationEnvelope}
${buildDraftPreferenceBlock(draftPreference, "draft")}
${buildFormatPreferenceBlock(formatPreference, "draft")}
${revisionInputBlock}

${args.options?.liveContext?.trim()
    ? `CRITICAL: You have been provided with real-time information in the <live_context> tag. Preserve that factual boundary exactly. Do not introduce new external claims beyond it.`
    : ""}

REVISION REQUEST:
${args.revision.instruction}

WORKFLOW CONTEXT PACKET:
${args.recentHistory}

TOPIC / VOICE REFERENCES:
${args.topicAnchors.join("\n---") || "None"}

ACTIVE SESSION CONSTRAINTS:
${args.activeConstraints.join(" | ") || "None"}

${revisionChangeGuidance ? `${revisionChangeGuidance}\n` : ""}
${groundingBlock ? `${groundingBlock}\n` : ""}
${threadLocalRevisionBlock ? `${threadLocalRevisionBlock}\n` : ""}

PROACTIVE COACHING:
- You are an elite editor. You must populate the coach_note JSON field with a 1-2 sentence explanation of the mechanical changes you just made and WHY they improve the post's pacing, hook, or readability.
- Be direct and punchy.
- DO NOT use pleasantries.
- Example: "I broke your wall of text into three distinct paragraphs to prevent scrolling fatigue, and sharpened the hook to create an immediate curiosity gap."

REQUIREMENTS:
1. Preserve the subject, core meaning, and overall structure unless the revision request explicitly asks for a deeper rewrite.
2. Apply only the requested change. Prefer local edits over fresh reframing.
3. If <critic_analysis> is present, treat it as an executable mechanical directive for this retry. Apply it directly unless it conflicts with <user_critique> or hard factual grounding.
4. Never invent a new angle, new premise, or random new hook unless the user explicitly asks for one.
5. If the user is removing or questioning a specific phrase, remove or replace that phrase and keep the rest as intact as possible.
6. If this is a local phrase edit or line-level edit, preserve all non-targeted lines.
7. If this is a hook-only edit, rewrite only the opening beat and preserve the body.
8. If this is a tone shift, you may rewrite wording but keep the same structure unless the flow truly breaks.
9. Only a full rewrite may substantially restructure the post. If the revision request converts a single post into a thread, you may rebuild the flow across posts instead of mechanically chopping the original draft into fragments.
10. Keep the draft sounding like the user. Match their casing and pacing.
11. If the user uses list markers like "-" or ">", preserve that formatting style when the revised draft uses lists.
12. ${buildVerificationProfessionalismRule("revision")}
13. HARD LENGTH CAP: the revised draft must stay at or under ${maxCharacterLimit.toLocaleString()} weighted X characters. If this is a thread, keep every post under ${threadPostMaxCharacterLimit?.toLocaleString() || "the account's allowed"} weighted X character limit, and do not over-compress verified-account thread posts toward legacy 280-character brevity when a fuller beat would read better.${buildThreadFramingRequirement({ threadFramingStyle, mode: "revision" })}
14. If any Active Session Constraint starts with "Correction lock:" or "Topic grounding:", treat it as hard factual grounding.
15. ${buildMarkdownStylingRule("revision")}
16. ${buildEngagementBaitRule("revision")}
17. Do NOT add new metrics, results, follower spikes, experiments, timelines, named customers, product mechanics, or autobiographical usage claims unless they already exist in the <previous_draft>, <user_critique>, or grounding packet.
18. If THREAD-LOCAL REVISION MODE is active, return only the revised target span and preserve the exact number of posts in that span.

You must output your response in JSON format.

${buildReviserJsonContract()}
  `.trim();

  const data = await fetchStructuredJsonFromGroq({
    schema: ReviserOutputSchema,
    forceJsonObject: true,
    modelTier: "writing",
    fallbackModel: "openai/gpt-oss-120b",
    reasoning_effort: "medium",
    temperature: 0.25,
    max_tokens: 4096,
    messages: [
      { role: "system", content: instruction },
      { role: "user", content: "Revise the draft now." },
    ],
  });

  return data
    ? {
        ...data,
        revisedDraft: trimToXCharacterLimit(data.revisedDraft, maxCharacterLimit),
      }
    : null;
}
