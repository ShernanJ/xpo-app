import type {
  ResponseShapePlan,
  SurfaceMode,
  V2ChatOutputShape,
} from "../contracts/chat";

interface ShapeResponseArgs {
  response: string;
  outputShape: V2ChatOutputShape;
  plan: ResponseShapePlan;
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

function shapeBySurfaceMode(response: string, surfaceMode: SurfaceMode): string {
  if (surfaceMode === "answer_directly" || surfaceMode === "revise_and_return") {
    return removeTrailingFollowUpQuestion(response);
  }

  if (surfaceMode === "generate_full_output") {
    return removeTrailingFollowUpQuestion(response);
  }

  return response;
}

export function shapeAssistantResponse(args: ShapeResponseArgs): string {
  let nextResponse = normalizeWhitespace(args.response);
  nextResponse = stripFeedbackNotice(nextResponse);
  nextResponse = removeAutomaticDraftPrompt(nextResponse);
  nextResponse = shapeBySurfaceMode(nextResponse, args.plan.surfaceMode);

  if (
    args.outputShape === "coach_question" &&
    args.plan.maxFollowUps === 0
  ) {
    nextResponse = removeTrailingFollowUpQuestion(nextResponse);
  }

  return normalizeWhitespace(nextResponse);
}
