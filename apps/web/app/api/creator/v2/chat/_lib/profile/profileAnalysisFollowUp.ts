import type { ProfileAnalysisArtifact } from "@/lib/chat/profileAnalysisArtifact";
import type { ProfileReplyContext } from "@/lib/agent-v2/grounding/profileReplyContext";
import {
  hasConcreteCorrectionDetail,
  inferCorrectionRepairQuestion,
  looksLikeSemanticCorrection,
  normalizeRepairDetail,
} from "@/lib/agent-v2/responses/semanticRepair";

export const PROFILE_ANALYSIS_FEEDBACK_PROMPT =
  "What's your goal for this profile, and did I get anything wrong?";

type ProfileAnalysisFollowUpRerun = {
  kind: "rerun_audit";
  analysisGoal: string | null;
  analysisCorrectionDetail: string | null;
  leadIn: string;
};

type ProfileAnalysisFollowUpClarify = {
  kind: "clarify_correction";
  question: string;
};

type ProfileAnalysisFollowUpQuestion = {
  kind: "answer_question";
};

type ProfileAnalysisFollowUpBioRewrite = {
  kind: "rewrite_bio";
};

type ProfileAnalysisFollowUpNone = {
  kind: "none";
};

export type ProfileAnalysisFollowUpInterpretation =
  | ProfileAnalysisFollowUpRerun
  | ProfileAnalysisFollowUpClarify
  | ProfileAnalysisFollowUpQuestion
  | ProfileAnalysisFollowUpBioRewrite
  | ProfileAnalysisFollowUpNone;

const DIRECT_CORRECTION_PATTERNS = [
  /\bthat(?:'s| is)? wrong\b/i,
  /\bthat(?:'s| is)? not right\b/i,
  /\bit(?:'s| is| was)? not a link\b/i,
  /\bisn(?:')?t a link\b/i,
  /\bthe reason it did so well\b/i,
  /\bthe reason it did well\b/i,
  /\bit was the image\b/i,
  /\bit(?:'s| is) the image\b/i,
  /\bshould focus on\b/i,
  /\bshould use\b/i,
  /\bwould be strong to use\b/i,
  /\byou should use\b/i,
];

const PROFILE_GOAL_CUES =
  /\b(authority|credibility|followers|inbound|leads|clients|customers|pipeline|recruiters|jobs?|network|investors|awareness|founders?)\b/i;
const PROFILE_GOAL_PREFIX =
  /\b(my goal is|the goal is|i want(?: this profile)? to|i'm trying to|im trying to|trying to|optimize for|i care about|this profile should)\b/i;
const AUDIT_QUESTION_PREFIX = /^(why|how|what|which|can|could|should|do|does|did|is|are)\b/i;
const BIO_REWRITE_REQUEST_PATTERN =
  /\b(?:rewrite|redo|tighten|refine|fix|improve)\b[\s\w]{0,24}\b(?:my\s+)?(?:x\s+)?bio\b|\bbio rewrite\b/i;

function normalizeLine(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function stripTrailingPunctuation(value: string): string {
  return normalizeLine(value).replace(/[.?!,;:]+$/g, "").trim();
}

function truncateSnippet(value: string, maxLength = 96): string {
  const normalized = normalizeLine(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function formatQuotedSnippet(value: string, maxLength = 96): string {
  return `"${truncateSnippet(value, maxLength)}"`;
}

function formatJoinedParts(parts: string[]): string {
  if (parts.length <= 1) {
    return parts[0] || "";
  }

  if (parts.length === 2) {
    return `${parts[0]} and ${parts[1]}`;
  }

  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

function looksLikeDirectCorrection(message: string): boolean {
  return DIRECT_CORRECTION_PATTERNS.some((pattern) => pattern.test(message));
}

function extractCorrectionDetail(message: string): string | null {
  const normalized = stripTrailingPunctuation(message);
  if (!normalized) {
    return null;
  }

  if (
    looksLikeSemanticCorrection(normalized) ||
    looksLikeDirectCorrection(normalized) ||
    /^(actually|it was|it's|its|the reason|should focus|should use|would be strong)/i.test(
      normalized,
    )
  ) {
    const detail = normalizeRepairDetail(normalized);
    return detail.length >= 18 ? detail : null;
  }

  return null;
}

function extractGoalDetail(message: string): string | null {
  const normalized = normalizeLine(message);
  if (!normalized) {
    return null;
  }

  const lower = normalized.toLowerCase();
  const prefixMatch = normalized.match(PROFILE_GOAL_PREFIX);
  if (prefixMatch) {
    const detail = stripTrailingPunctuation(normalized.slice(prefixMatch.index! + prefixMatch[0].length));
    return detail && detail.length >= 6 ? detail : null;
  }

  if (
    !/[?]$/.test(normalized) &&
    normalized.split(/\s+/).length <= 8 &&
    PROFILE_GOAL_CUES.test(normalized) &&
    !looksLikeSemanticCorrection(lower) &&
    !looksLikeDirectCorrection(lower)
  ) {
    return stripTrailingPunctuation(normalized);
  }

  return null;
}

function isAuditQuestion(message: string): boolean {
  const normalized = normalizeLine(message);
  if (!normalized) {
    return false;
  }

  return normalized.endsWith("?") || AUDIT_QUESTION_PREFIX.test(normalized.toLowerCase());
}

function buildRerunLeadIn(args: {
  analysisGoal: string | null;
  analysisCorrectionDetail: string | null;
}): string {
  if (args.analysisGoal && args.analysisCorrectionDetail) {
    return `Thanks, that helps. I've updated the read around ${args.analysisCorrectionDetail} and I'm re-running the audit with your goal of ${args.analysisGoal} in mind.`;
  }

  if (args.analysisCorrectionDetail) {
    return `Thanks, that correction helps. I'm re-running the audit with this locked in: ${args.analysisCorrectionDetail}.`;
  }

  return `Perfect. I'm re-running the audit with your goal of ${args.analysisGoal} as the lens.`;
}

export function interpretProfileAnalysisFollowUp(args: {
  userMessage: string;
  topicSummary?: string | null;
}): ProfileAnalysisFollowUpInterpretation {
  const normalized = normalizeLine(args.userMessage);
  if (!normalized) {
    return { kind: "none" };
  }

  const correctionSignal =
    looksLikeSemanticCorrection(normalized) || looksLikeDirectCorrection(normalized);
  const correctionDetail = extractCorrectionDetail(normalized);
  const goalDetail = extractGoalDetail(normalized);

  if (correctionSignal && !correctionDetail) {
    return {
      kind: "clarify_correction",
      question:
        inferCorrectionRepairQuestion(normalized, args.topicSummary ?? null) ||
        "Fair call. What did I get wrong in the profile read?",
    };
  }

  if (correctionDetail || goalDetail) {
    return {
      kind: "rerun_audit",
      analysisGoal: goalDetail,
      analysisCorrectionDetail: correctionDetail,
      leadIn: buildRerunLeadIn({
        analysisGoal: goalDetail,
        analysisCorrectionDetail: correctionDetail,
      }),
    };
  }

  if (BIO_REWRITE_REQUEST_PATTERN.test(normalized)) {
    return { kind: "rewrite_bio" };
  }

  if (isAuditQuestion(normalized)) {
    return { kind: "answer_question" };
  }

  return { kind: "none" };
}

export function extractPersistedProfileAnalysisArtifact(
  value: unknown,
): ProfileAnalysisArtifact | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const artifact = record.profileAnalysisArtifact;
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    return null;
  }

  const typedArtifact = artifact as Record<string, unknown>;
  const profile =
    typedArtifact.profile &&
    typeof typedArtifact.profile === "object" &&
    !Array.isArray(typedArtifact.profile)
      ? (typedArtifact.profile as Record<string, unknown>)
      : null;
  const audit =
    typedArtifact.audit &&
    typeof typedArtifact.audit === "object" &&
    !Array.isArray(typedArtifact.audit)
      ? (typedArtifact.audit as Record<string, unknown>)
      : null;

  if (!profile || !audit) {
    return null;
  }

  if (
    typeof profile.username !== "string" ||
    typeof audit.headline !== "string" ||
    typeof audit.fingerprint !== "string"
  ) {
    return null;
  }

  return artifact as ProfileAnalysisArtifact;
}

function buildContentPatternAnswer(
  profileReplyContext: ProfileReplyContext | null | undefined,
): string {
  const topInsight = profileReplyContext?.topicInsights?.[0] ?? null;
  const evidence = topInsight?.evidenceSnippets?.[0] ?? null;

  if (!topInsight) {
    return "The content read is still directional because the recent-post sample is thin.";
  }

  return evidence
    ? `Right now the clearest pattern I can defend is ${topInsight.label.toLowerCase()}, based on evidence like ${formatQuotedSnippet(evidence)}.`
    : `Right now the clearest pattern I can defend is ${topInsight.label.toLowerCase()}.`;
}

export function buildProfileAnalysisQuestionResponse(args: {
  userMessage: string;
  artifact: ProfileAnalysisArtifact;
  profileReplyContext?: ProfileReplyContext | null;
}): string {
  const normalized = normalizeLine(args.userMessage).toLowerCase();
  const pinnedProof =
    args.artifact.audit.pinnedTweetCheck.visualEvidenceSummary ||
    args.artifact.pinnedPostImageAnalysis?.strategicSignal ||
    null;
  const strongestPost = args.profileReplyContext?.strongestPost ?? null;

  if (
    /\b(link|strong format|strongest post|top[- ]performing post|top performing post)\b/i.test(
      normalized,
    )
  ) {
    if (strongestPost?.linkSignal === "media_only" && (strongestPost.imageUrls?.length ?? 0) > 0) {
      return [
        "That shouldn't be described as a link-led post if the URL was just the attached X media.",
        pinnedProof
          ? `The stronger read is that the visual proof did the heavy lifting here: ${pinnedProof}`
          : "The stronger read is that the attached visual carried the attention more than the caption alone.",
        "If you want, tell me what else I should keep factual and I'll refresh the audit.",
      ].join(" ");
    }

    return [
      "The top post explanation is meant to describe what likely drove the engagement, not just the caption shape.",
      strongestPost?.reasons?.[0] || "If you think I misread the driver, tell me what actually made that post work and I'll update the audit.",
    ].join(" ");
  }

  if (/\b(score|why .*low|why .*48|why .*61)\b/i.test(normalized)) {
    const leakingSteps = args.artifact.audit.steps
      .filter((step) => step.status !== "pass")
      .map((step) => step.title.toLowerCase());

    return [
      "The score is just a rough roll-up of the bio, banner, pinned asset, and profile coherence.",
      leakingSteps.length > 0
        ? `Right now it's being dragged down most by ${formatJoinedParts(leakingSteps)}.`
        : args.artifact.audit.headline,
      PROFILE_ANALYSIS_FEEDBACK_PROMPT,
    ].join(" ");
  }

  if (/\bbio\b/i.test(normalized)) {
    return [
      args.artifact.audit.bioFormulaCheck.summary,
      `The current bio is ${formatQuotedSnippet(args.artifact.profile.bio || "none", 110)}.`,
      PROFILE_ANALYSIS_FEEDBACK_PROMPT,
    ].join(" ");
  }

  if (/\b(banner|header)\b/i.test(normalized)) {
    return [
      args.artifact.audit.visualRealEstateCheck.summary,
      args.artifact.bannerAnalysis?.feedback.actionable_improvements?.[0] ||
        "The main job there is to make the profile promise legible at a glance.",
      PROFILE_ANALYSIS_FEEDBACK_PROMPT,
    ].join(" ");
  }

  if (/\b(pinned|pin)\b/i.test(normalized)) {
    return [
      args.artifact.audit.pinnedTweetCheck.summary,
      pinnedProof ? pinnedProof : "The pinned asset needs to do more of the authority work on first glance.",
      PROFILE_ANALYSIS_FEEDBACK_PROMPT,
    ].join(" ");
  }

  if (/\b(content|pattern|theme|signal|signals)\b/i.test(normalized)) {
    return [
      buildContentPatternAnswer(args.profileReplyContext),
      pinnedProof
        ? `The pinned proof also matters here because it may be the clearest thing a new visitor notices first: ${pinnedProof}`
        : "",
      PROFILE_ANALYSIS_FEEDBACK_PROMPT,
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (/\b(priority|priorities|first|fix)\b/i.test(normalized)) {
    const topStep = args.artifact.audit.steps.find((step) => step.status !== "pass");
    if (topStep) {
      return [
        `I'd start with ${topStep.actionLabel.toLowerCase()} because ${topStep.summary.toLowerCase()}`,
        PROFILE_ANALYSIS_FEEDBACK_PROMPT,
      ].join(" ");
    }
  }

  return [
    args.artifact.audit.headline,
    pinnedProof
      ? `The clearest authority signal I'm using is still the pinned proof: ${pinnedProof}`
      : "The main read is still about clarifying the value prop and packaging the strongest proof better.",
    PROFILE_ANALYSIS_FEEDBACK_PROMPT,
  ].join(" ");
}

export function buildProfileAnalysisBioRewriteResponse(args: {
  artifact: ProfileAnalysisArtifact;
}): string {
  const currentBio = normalizeLine(args.artifact.profile.bio || "none");
  const alternatives = args.artifact.audit.bioFormulaCheck.alternatives
    .map((alternative) => normalizeLine(alternative.text))
    .filter(Boolean)
    .slice(0, 3);

  if (alternatives.length === 0) {
    return [
      `The current bio is ${formatQuotedSnippet(currentBio, 110)}.`,
      args.artifact.audit.bioFormulaCheck.summary,
      "The audit doesn't have a saved rewrite option yet, but the direction is to make the audience, outcome, and proof more explicit.",
      "If you want, tell me the exact audience you want to attract and I'll tighten it from there.",
    ].join(" ");
  }

  const numberedOptions = alternatives
    .map((alternative, index) => `${index + 1}. ${alternative}`)
    .join("\n");

  return [
    `The current bio is ${formatQuotedSnippet(currentBio, 110)}.`,
    "Here are tighter bio options based on the audit:",
    numberedOptions,
    "Which direction feels closest to how you want the profile to convert?",
  ].join("\n\n");
}
