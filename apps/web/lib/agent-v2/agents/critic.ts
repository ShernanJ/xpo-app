import { fetchJsonFromGroq } from "./llm";
import { z } from "zod";
import type { WriterOutput } from "./writer";
import type { VoiceStyleCard } from "../core/styleProfile";
import type { DraftFormatPreference, DraftPreference } from "../contracts/chat";
import type { DraftRevisionChangeKind } from "../orchestrator/draftRevision";
import {
  computeXWeightedCharacterCount,
  trimToXCharacterLimit,
} from "../../onboarding/draftArtifacts";
import { enforceVoiceStyleOnDraft } from "../core/voiceSignals";
import {
  buildDraftPreferenceBlock,
  buildFormatPreferenceBlock,
} from "../prompts/promptHydrator";

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
    case "length_trim":
      return 0.4;
    case "tone_shift":
      return 0.38;
    case "full_rewrite":
    case "generic":
      return 0;
    default:
      return 0.55;
  }
}

function stripUnsupportedXMarkdown(value: string): string {
  return value
    .replace(/\*\*(.*?)\*\*/gs, "$1")
    .replace(/__(.*?)__/gs, "$1")
    .replace(/(^|[\s(])\*(?!\s)([^*\n]+?)\*(?=$|[\s).,!?:;])/g, "$1$2")
    .replace(/(^|[\s(])_(?!\s)([^_\n]+?)_(?=$|[\s).,!?:;])/g, "$1$2")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .trim();
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
    draftPreference?: DraftPreference;
    formatPreference?: DraftFormatPreference;
    previousDraft?: string;
    revisionChangeKind?: DraftRevisionChangeKind;
  },
): Promise<CriticOutput | null> {
  const maxCharacterLimit = options?.maxCharacterLimit ?? 280;
  const draftPreference = options?.draftPreference || "balanced";
  const formatPreference = options?.formatPreference || "shortform";
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
6. HARD LENGTH CAP: The final draft must stay at or under ${maxCharacterLimit.toLocaleString()} weighted X characters.

DRAFT TO REVIEW:
${writerOutput.draft}

ACTIVE CONSTRAINTS:
${activeConstraints.join(" | ") || "None"}
${styleCard && styleCard.customGuidelines.length > 0 ? `\nGLOBAL STYLE RULES (MUST OBEY): ${styleCard.customGuidelines.join(" | ")}` : ""}

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
    const normalizedDraft = trimToXCharacterLimit(parsed.finalDraft, maxCharacterLimit);
    const markdownSanitizedDraft = trimToXCharacterLimit(
      stripUnsupportedXMarkdown(normalizedDraft),
      maxCharacterLimit,
    );
    const styleAlignedDraft = trimToXCharacterLimit(
      enforceVoiceStyleOnDraft(markdownSanitizedDraft, styleCard),
      maxCharacterLimit,
    );
    const wasTrimmed = normalizedDraft !== parsed.finalDraft;
    const markdownAdjusted = markdownSanitizedDraft !== normalizedDraft;
    const styleAdjusted = styleAlignedDraft !== markdownSanitizedDraft;
    let nextIssues = wasTrimmed
      ? [...parsed.issues, `Trimmed to fit the ${maxCharacterLimit.toLocaleString()}-char X limit.`]
      : parsed.issues;
    if (markdownAdjusted) {
      nextIssues = [
        ...nextIssues,
        "Removed unsupported markdown styling for X.",
      ];
    }
    if (styleAdjusted) {
      nextIssues = [
        ...nextIssues,
        "Normalized casing or list formatting to match the creator's voice.",
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
