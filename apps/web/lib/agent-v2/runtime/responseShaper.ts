import type {
  ResponsePresentationStyle,
  ResponseShapePlan,
  SurfaceMode,
  V2ChatOutputShape,
} from "../contracts/chat";
import { scrubXpoPleasantries } from "../core/sparringPartnerTone.ts";

interface ShapeResponseArgs {
  response: string;
  outputShape: V2ChatOutputShape;
  plan: ResponseShapePlan;
  presentationStyle?: ResponsePresentationStyle | null;
}

const FEEDBACK_NOTICE_REPLIES = new Set([
  "Noted - I'll remember that context for next drafts.",
  "Noted - I'll remember that feedback for next drafts.",
  "noted - i'll remember that context for next drafts.",
  "noted - i'll remember that feedback for next drafts.",
]);

function stripFeedbackNotice(response: string): string {
  const parts = response
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    return response.trim();
  }

  if (!FEEDBACK_NOTICE_REPLIES.has(parts[0] || "")) {
    return response.trim();
  }

  return parts.slice(1).join("\n\n").trim();
}

const FORMULAIC_LEAD_INS = [
  "love that.",
  "love this.",
  "got it.",
  "noted.",
  "makes sense.",
  "fair.",
  "fair enough.",
  "sounds good.",
  "that works.",
  "good call.",
  "totally.",
  "yep.",
  "yeah.",
];

function stripFormulaicLeadIn(response: string): string {
  const trimmed = response.trim();
  if (!trimmed) {
    return trimmed;
  }

  const leadIn = FORMULAIC_LEAD_INS.find((candidate) =>
    trimmed.toLowerCase().startsWith(candidate),
  );
  if (!leadIn) {
    return trimmed;
  }

  const remainder = trimmed.slice(leadIn.length).trimStart();
  if (!remainder) {
    return trimmed;
  }

  return remainder;
}

function removeTrailingFollowUpQuestion(response: string): string {
  const trimmed = response.trim();
  if (!trimmed.includes("?")) {
    return trimmed;
  }

  const lines = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length > 1) {
    const lastLine = lines[lines.length - 1] || "";
    if (/\?$/.test(lastLine)) {
      return lines.slice(0, -1).join("\n").trim();
    }
  }

  const sentenceSplit = trimmed.match(/^(.*?[.?!])\s+[^.?!]*\?\s*$/);
  if (sentenceSplit?.[1]) {
    return sentenceSplit[1].trim();
  }

  return trimmed.replace(/\s*(?:want|should|does|do|anything|which)\b[^?]*\?\s*$/i, "").trim();
}

function splitTrailingFollowUpQuestion(
  response: string,
): { body: string; question: string | null } {
  const trimmed = response.trim();
  if (!trimmed.includes("?")) {
    return { body: trimmed, question: null };
  }

  const lines = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length > 1) {
    const lastLine = lines[lines.length - 1] || "";
    if (/\?$/.test(lastLine)) {
      return {
        body: lines.slice(0, -1).join("\n").trim(),
        question: lastLine,
      };
    }
  }

  const sentenceSplit = trimmed.match(/^(.*?[.?!])\s+([^.?!]*\?)\s*$/);
  if (sentenceSplit?.[1] && sentenceSplit[2]) {
    return {
      body: sentenceSplit[1].trim(),
      question: sentenceSplit[2].trim(),
    };
  }

  return { body: trimmed, question: null };
}

function removeAutomaticDraftPrompt(response: string): string {
  return response
    .replace(/\s*want me to turn that into a post\?\s*$/i, "")
    .replace(/\s*want me to draft (?:it|that)\?\s*$/i, "")
    .replace(/\s*or tell me what to tweak\.\s*$/i, ".")
    .trim();
}

function normalizeWhitespace(response: string): string {
  return response
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function responseAlreadyStructured(response: string): boolean {
  return (
    /^\s*(?:[-*]\s+|\d+\.\s+|#\s+|##\s+|###\s+|>\s+)/m.test(response) ||
    /\*\*[^*\n]+:\*\*/.test(response)
  );
}

function splitResponseIntoSentences(response: string): string[] {
  return response
    .replace(/\n+/g, " ")
    .replace(/:\s+-\s+/g, ": ")
    .replace(/\s+-\s+(?=[A-Z"(])/g, ". ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .map((sentence) => sentence.replace(/^-+\s*/, ""))
    .filter(Boolean);
}

function groupSentencesIntoBullets(sentences: string[], maxBullets: number): string[] {
  if (sentences.length === 0) {
    return [];
  }

  const targetBulletCount = Math.max(1, Math.min(maxBullets, sentences.length));
  const groupSize = Math.max(1, Math.ceil(sentences.length / targetBulletCount));
  const bullets: string[] = [];

  for (let index = 0; index < sentences.length; index += groupSize) {
    bullets.push(sentences.slice(index, index + groupSize).join(" "));
  }

  return bullets;
}

function formatConversationalReplyForScanability(
  response: string,
  options?: { preferStructure?: boolean },
): string {
  const trimmed = response.trim();
  if (!trimmed || responseAlreadyStructured(trimmed)) {
    return trimmed;
  }

  const sentences = splitResponseIntoSentences(trimmed);
  const preferStructure = options?.preferStructure === true;
  const minimumSentenceCount = preferStructure ? 2 : 3;
  const minimumLength = preferStructure ? 150 : 220;

  if (sentences.length < minimumSentenceCount || trimmed.length < minimumLength) {
    return trimmed;
  }

  const [thesis, ...remainder] = sentences;
  const bullets = groupSentencesIntoBullets(remainder, preferStructure ? 3 : 4);
  const lines = [`**Takeaway:** ${thesis}`];

  if (bullets.length > 0) {
    lines.push("", ...bullets.map((bullet) => `- ${bullet}`));
  }

  return lines.join("\n");
}

function formatConversationalReplyWithFollowUpQuestion(
  response: string,
  options?: { preferStructure?: boolean },
): string {
  const trimmed = response.trim();
  if (!trimmed || responseAlreadyStructured(trimmed)) {
    return trimmed;
  }

  const { body, question } = splitTrailingFollowUpQuestion(trimmed);
  if (!question || !body) {
    return formatConversationalReplyForScanability(trimmed, options);
  }

  const formattedBody = formatConversationalReplyForScanability(body, options);
  const bodyWasFormatted = formattedBody !== body;
  const bodyIsLongEnough = body.trim().length >= (options?.preferStructure ? 150 : 220);

  if (!bodyWasFormatted && !bodyIsLongEnough) {
    return trimmed;
  }

  if (formattedBody.startsWith("- ")) {
    return `${formattedBody}\n${question}`;
  }

  return `${formattedBody}\n\n${question}`;
}

function shapeBySurfaceMode(response: string, surfaceMode: SurfaceMode): string {
  if (surfaceMode === "answer_directly" || surfaceMode === "revise_and_return") {
    return removeTrailingFollowUpQuestion(response);
  }

  return response;
}

export function shapeAssistantResponse(args: ShapeResponseArgs): string {
  let nextResponse = normalizeWhitespace(scrubXpoPleasantries(args.response));
  nextResponse = stripFeedbackNotice(nextResponse);
  nextResponse = stripFormulaicLeadIn(nextResponse);
  nextResponse = removeAutomaticDraftPrompt(nextResponse);
  nextResponse = shapeBySurfaceMode(nextResponse, args.plan.surfaceMode);
  const preferStructure = args.plan.mode === "light_guidance";

  if (
    args.outputShape === "coach_question" &&
    args.plan.maxFollowUps === 0
  ) {
    nextResponse = removeTrailingFollowUpQuestion(nextResponse);
  }

  if (args.outputShape === "coach_question") {
    if (
      args.presentationStyle === "plain_paragraph" ||
      args.presentationStyle === "preserve_authored_structure"
    ) {
      return nextResponse;
    }

    if (args.plan.surfaceMode === "answer_directly") {
      nextResponse = formatConversationalReplyForScanability(nextResponse, { preferStructure });
    }

    if (args.plan.surfaceMode === "ask_one_question") {
      nextResponse = formatConversationalReplyWithFollowUpQuestion(nextResponse, {
        preferStructure,
      });
    }
  }

  return normalizeWhitespace(nextResponse);
}
