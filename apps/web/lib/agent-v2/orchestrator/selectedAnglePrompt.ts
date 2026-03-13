import type { SelectedAngleFormatHint } from "../contracts/turnContract.ts";

export type { SelectedAngleFormatHint } from "../contracts/turnContract.ts";

const QUESTION_SHAPED_ANGLE =
  /^(?:what|what's|why|how|when|where|who|which|is|are|can|could|should|do|does|did)\b/i;

const SELECTED_ANGLE_PROMPT_PREFIXES = [
  /^(?:turn the following angle into a draft:|use the selected angle as the primary direction:)\s*/i,
  /^draft a (?:post|thread) that directly answers this question in the user's voice:\s*/i,
  /^draft a (?:post|thread) in the user's voice that answers this question with a strong hook, at least one concrete detail, and a clean ending\. do not repeat the question or answer it in a single flat sentence:\s*/i,
  /^draft a (?:post|thread) from this chosen direction in the user's voice:\s*/i,
];

export function isQuestionShapedSelectedAngle(value: string): boolean {
  const normalized = value.trim();
  return QUESTION_SHAPED_ANGLE.test(normalized) || normalized.endsWith("?");
}

export function buildSelectedAngleDraftPrompt(args: {
  angle: string;
  formatHint: SelectedAngleFormatHint;
}): string {
  const normalized = args.angle.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return normalized;
  }

  if (isQuestionShapedSelectedAngle(normalized)) {
    return `draft a ${args.formatHint} in the user's voice that answers this question with a strong hook, at least one concrete detail, and a clean ending. do not repeat the question or answer it in a single flat sentence: ${normalized}`;
  }

  return `draft a ${args.formatHint} from this chosen direction in the user's voice: ${normalized}`;
}

export function stripSelectedAnglePromptPrefix(value: string): string {
  let normalized = value.trim();
  for (const pattern of SELECTED_ANGLE_PROMPT_PREFIXES) {
    normalized = normalized.replace(pattern, "").trim();
  }
  return normalized.replace(/\s+/g, " ");
}
