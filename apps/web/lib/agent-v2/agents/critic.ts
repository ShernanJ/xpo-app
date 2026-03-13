import { fetchJsonFromGroq } from "./llm";
import { z } from "zod";
import type { WriterOutput } from "./writer";
import type { VoiceStyleCard } from "../core/styleProfile";
import type { VoiceTarget } from "../core/voiceTarget";
import type { DraftFormatPreference, DraftPreference } from "../contracts/chat";
import type { ThreadFramingStyle } from "../../onboarding/draftArtifacts";
import {
  collectGroundingFactualAuthority,
  type GroundingPacket,
} from "../orchestrator/groundingPacket";
// TODO(v3): Import and populate DraftScore for multi-dimensional scoring.
// import type { DraftScore } from "../contracts/chat";
// The CriticOutputSchema could be extended with optional fields:
//   hookScore, clarityScore, noveltyScore, voiceMatchScore
// to power best-of-N selection. See contracts/chat.ts for the DraftScore type.
import type { DraftRevisionChangeKind } from "../orchestrator/draftRevision";
import {
  computeXWeightedCharacterCount,
  trimToXCharacterLimit,
} from "../../onboarding/draftArtifacts";
import { applyFinalDraftPolicyWithReport } from "../core/finalDraftPolicy";
import {
  buildDraftPreferenceBlock,
  buildFormatPreferenceBlock,
} from "../prompts/promptHydrator";
import {
  assessConcreteSceneDrift,
  buildConcreteSceneCriticBlock,
} from "../orchestrator/draftGrounding";

export const CriticOutputSchema = z.object({
  approved: z.boolean().describe("Whether the draft passes the harsh review without major rewrites"),
  finalAngle: z.string().describe("The final underlying angle for the draft"),
  finalDraft: z.string().describe("The final, corrected draft ready for the user"),
  issues: z.array(z.string()).describe("Any minor or major issues found during critique"),
});

export type CriticOutput = z.infer<typeof CriticOutputSchema>;

function normalizeTokens(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2);
}

function computeTokenOverlapRatio(currentDraft: string, previousDraft: string): number {
  const previousTokens = Array.from(new Set(normalizeTokens(previousDraft)));
  if (previousTokens.length === 0) {
    return 1;
  }

  const currentTokenSet = new Set(normalizeTokens(currentDraft));
  const matched = previousTokens.filter((token) => currentTokenSet.has(token)).length;
  return matched / previousTokens.length;
}

function getRevisionOverlapFloor(changeKind: DraftRevisionChangeKind): number {
  switch (changeKind) {
    case "hook_only_edit":
      return 0.45;
    case "specificity_tune":
      return 0.42;
    case "length_expand":
      return 0.42;
    case "length_trim":
      return 0.4;
    case "tone_shift":
      return 0.38;
    case "full_rewrite":
      return 0.12;
    case "generic":
      return 0.3;
    default:
      return 0.55;
  }
}

/**
 * High speed rule-checker. Enforces hard constraints and standardizes
 * the draft output before it is shown to the user.
 */
export async function critiqueDrafts(
  writerOutput: WriterOutput,
  activeConstraints: string[],
  styleCard: VoiceStyleCard | null,
  options?: {
    maxCharacterLimit?: number;
    threadPostMaxCharacterLimit?: number;
    draftPreference?: DraftPreference;
    formatPreference?: DraftFormatPreference;
    previousDraft?: string;
    revisionChangeKind?: DraftRevisionChangeKind;
    sourceUserMessage?: string;
    voiceTarget?: VoiceTarget | null;
    threadFramingStyle?: ThreadFramingStyle | null;
    groundingPacket?: GroundingPacket | null;
  },
): Promise<CriticOutput | null> {
  const maxCharacterLimit = options?.maxCharacterLimit ?? 280;
  const threadPostMaxCharacterLimit = options?.threadPostMaxCharacterLimit ?? null;
  const draftPreference = options?.draftPreference || "balanced";
  const formatPreference = options?.formatPreference || "shortform";
  const concreteSceneBlock = buildConcreteSceneCriticBlock(options?.sourceUserMessage);
  const factualAuthority = options?.groundingPacket
    ? collectGroundingFactualAuthority(options.groundingPacket)
    : [];
  const instruction = `
You are the final Quality Assurance editor for an elite X (Twitter) creator.
Your job is to take a draft and ruthlessly enforce constraints.

RULES:
${buildDraftPreferenceBlock(draftPreference, "critic")}
${buildFormatPreferenceBlock(formatPreference, "critic")}
1. Do NOT change the meaning or the core angle of the draft.
2. If the draft uses emojis and the constraints explicitly say "no emojis", you MUST remove them.
3. If the draft uses the words "Delve", "Unlock", "Testament", or "Embark", you MUST replace them.
4. If the draft contains obvious AI-isms (like "Here are 3 reasons why", "Let's dive in", "A story in 3 parts"), you MUST delete those phrases.
5. If the draft fails fundamentally, set "approved" to false. Otherwise, return true.
6. HARD LENGTH CAP: The final draft must stay at or under ${maxCharacterLimit.toLocaleString()} weighted X characters.${formatPreference === "thread" ? ` Keep every post under ${threadPostMaxCharacterLimit?.toLocaleString() || "the account's allowed"} weighted X character limit, but do not force verified-account threads into legacy 280-character brevity if a fuller beat reads better.` : ""}
6a. If this is NOT a thread, the final draft must be exactly one standalone post. Do NOT use standalone --- separators, thread serialization, or multiple-post formatting.
7. Do NOT allow empty engagement-bait CTAs like "reply 'FOCUS'" or "comment 'X'" unless the reader clearly gets a concrete payoff in return. If there is no payoff, rewrite that CTA into something natural and non-gimmicky.
${formatPreference === "thread" ? `
THREAD-SPECIFIC QUALITY CHECKS (MANDATORY FOR THREADS):
T1. A thread MUST contain at least 3 posts separated by ---. If fewer, add missing beats.
T2. REJECT "chopped essay" pattern: each post must carry a DISTINCT beat (hook, setup, proof, turn, payoff, close). If two consecutive posts say nearly the same thing with different wording, merge or rewrite.
T3. The first post (hook) must create curiosity or tension. It must NOT summarize the entire thread.
T4. Check for transitions: there should be a clear connection between consecutive posts. If a post feels disconnected, add a bridge.
T5. Check for repeated hooks: the opening framing should NOT reappear verbatim in later posts.
T6. The final post must feel like a deliberate ending (takeaway, punchline, or call to action), not a trail-off.
T7. Each post should be self-contained enough to make sense on its own in a timeline, while still advancing the thread narrative.
` : ""}

DRAFT TO REVIEW:
${writerOutput.draft}

ACTIVE CONSTRAINTS:
${activeConstraints.join(" | ") || "None"}
${styleCard && styleCard.customGuidelines.length > 0 ? `\nGLOBAL STYLE RULES (MUST OBEY): ${styleCard.customGuidelines.join(" | ")}` : ""}
${options?.voiceTarget ? `\nVOICE TARGET (AUTHORITATIVE FOR THIS TURN): ${options.voiceTarget.summary}\n${options.voiceTarget.rationale.map((line) => `- ${line}`).join("\n")}` : ""}
${options?.groundingPacket ? `\nGROUNDING PACKET (FACT AUTHORITY):\n- Durable facts: ${options.groundingPacket.durableFacts.join(" | ") || "None"}\n- Turn grounding: ${options.groundingPacket.turnGrounding.join(" | ") || "None"}\n- Allowed first-person claims: ${options.groundingPacket.allowedFirstPersonClaims.join(" | ") || "None"}\n- Allowed numbers: ${options.groundingPacket.allowedNumbers.join(" | ") || "None"}\n- Factual authority: ${factualAuthority.join(" | ") || "None"}\nHistorical posts or style examples are not factual support unless that same detail appears in the factual authority.\nIf a factual detail is not supported here or in the current chat, remove it instead of polishing around it.` : ""}
${concreteSceneBlock ? `\n${concreteSceneBlock}` : ""}

Respond ONLY with a valid JSON matching this schema:
{
  "approved": boolean,
  "finalAngle": "...",
  "finalDraft": "The corrected draft text...",
  "issues": ["Issue 1 found and fixed", "Issue 2 found and fixed"]
}
  `.trim();

  const data = await fetchJsonFromGroq<unknown>({
    model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    reasoning_effort: "medium",
    temperature: 0.1,
    max_tokens: 4096,
    messages: [
      { role: "system", content: instruction },
      { role: "user", content: "Review and correct the draft now." },
    ],
  });

  if (!data) return null;

  try {
    const parsed = CriticOutputSchema.parse(data);
    const initialTrimmedDraft = trimToXCharacterLimit(parsed.finalDraft, maxCharacterLimit);
    const wasTrimmed = initialTrimmedDraft !== parsed.finalDraft;
    const policyResult = applyFinalDraftPolicyWithReport({
      draft: initialTrimmedDraft,
      formatPreference,
      isVerifiedAccount: maxCharacterLimit > 280,
      styleCard,
      maxCharacterLimit,
      threadFramingStyle: options?.threadFramingStyle,
    });
    const styleAlignedDraft = policyResult.draft;
    let nextIssues = wasTrimmed
      ? [...parsed.issues, `Trimmed to fit the ${maxCharacterLimit.toLocaleString()}-char X limit.`]
      : parsed.issues;
    if (policyResult.adjustments.markdownAdjusted) {
      nextIssues = [
        ...nextIssues,
        "Removed unsupported markdown styling for X.",
      ];
    }
    if (policyResult.adjustments.engagementAdjusted) {
      nextIssues = [
        ...nextIssues,
        "Replaced a weak engagement-bait CTA with a more natural close.",
      ];
    }
    if (policyResult.adjustments.styleAdjusted) {
      nextIssues = [
        ...nextIssues,
        "Normalized casing or list formatting to match the creator's voice.",
      ];
    }
    if (policyResult.adjustments.trimmed && !nextIssues.includes(`Trimmed to fit the ${maxCharacterLimit.toLocaleString()}-char X limit.`)) {
      nextIssues = [
        ...nextIssues,
        `Trimmed to fit the ${maxCharacterLimit.toLocaleString()}-char X limit.`,
      ];
    }
    let approved =
      parsed.approved &&
      computeXWeightedCharacterCount(styleAlignedDraft) <= maxCharacterLimit;

    if (
      options?.previousDraft &&
      options?.revisionChangeKind &&
      getRevisionOverlapFloor(options.revisionChangeKind) > 0
    ) {
      const overlapRatio = computeTokenOverlapRatio(styleAlignedDraft, options.previousDraft);
      if (overlapRatio < getRevisionOverlapFloor(options.revisionChangeKind)) {
        nextIssues = [...nextIssues, "Revision drifted farther than the requested edit scope."];
        approved = false;
      }
    }

    const groundingAssessment = assessConcreteSceneDrift({
      sourceUserMessage: options?.sourceUserMessage,
      draft: styleAlignedDraft,
    });
    if (groundingAssessment.hasDrift) {
      nextIssues = [
        ...nextIssues,
        groundingAssessment.reason || "Concrete scene drift detected.",
      ];
      approved = false;
    }

    return {
      ...parsed,
      finalDraft: styleAlignedDraft,
      approved,
      issues: nextIssues,
    };
  } catch (err) {
    console.error("Critic validation failed", err);
    return null;
  }
}
