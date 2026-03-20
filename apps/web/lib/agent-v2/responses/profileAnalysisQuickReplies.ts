import type { CreatorChatQuickReply } from "../contracts/chat.ts";
import type { ProfileAnalysisArtifact } from "../../chat/profileAnalysisArtifact.ts";

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function truncateLabel(value: string): string {
  const normalized = normalizeText(value);
  return normalized.length > 30 ? `${normalized.slice(0, 27).trimEnd()}...` : normalized;
}

function clipPromptSnippet(value: string, maxLength: number): string {
  const normalized = normalizeText(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function buildPinnedImagePromptContext(artifact: ProfileAnalysisArtifact): string {
  const analysis = artifact.pinnedPostImageAnalysis;
  if (!analysis) {
    return "";
  }

  const parts = [
    analysis.strategicSignal ? clipPromptSnippet(analysis.strategicSignal, 160) : "",
    analysis.readableText
      ? `Readable text in the image: "${clipPromptSnippet(analysis.readableText, 120)}".`
      : "",
    analysis.keyDetails.length > 0
      ? `Key visual details: ${clipPromptSnippet(analysis.keyDetails.join(", "), 160)}.`
      : "",
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean);

  if (parts.length === 0) {
    return "";
  }

  return ` Preserve the useful image context from the current pinned post: ${parts.join(" ")}`;
}

function buildChip(
  label: string,
  value: string,
  overrides?: Partial<CreatorChatQuickReply>,
): CreatorChatQuickReply {
  return {
    kind: "planner_action",
    label: truncateLabel(label),
    value: normalizeText(value),
    ...overrides,
  };
}

function buildBioChip(artifact: ProfileAnalysisArtifact): CreatorChatQuickReply {
  const suggestedBio = artifact.audit.bioFormulaCheck.alternatives[0]?.text;

  return buildChip(
    "Rewrite bio",
    suggestedBio
      ? `Rewrite my X bio to be clearer and more conversion-focused. Use this direction as the starting point: "${suggestedBio}"`
      : "Rewrite my X bio so it clearly says who I help, the outcome, and the proof.",
    {
      explicitIntent: "coach",
    },
  );
}

function buildBannerChip(): CreatorChatQuickReply {
  return buildChip(
    "Fix banner promise",
    "Give me 3 clearer banner or header copy options in plain language so the value proposition is obvious at a glance.",
    {
      explicitIntent: "coach",
    },
  );
}

function buildPinnedChip(artifact: ProfileAnalysisArtifact): CreatorChatQuickReply {
  const pinnedPreview = artifact.pinnedPost?.text?.trim();
  const pinnedDiagnosis = artifact.audit.pinnedTweetCheck.summary.trim();
  const pinnedImageContext = buildPinnedImagePromptContext(artifact);
  const direction = [
    artifact.audit.pinnedTweetCheck.promptSuggestions?.originStory,
    artifact.audit.pinnedTweetCheck.promptSuggestions?.coreThesis,
  ]
    .map((value) => (typeof value === "string" ? normalizeText(value) : ""))
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(" | ");

  return buildChip(
    "Draft pinned post",
    pinnedPreview
      ? `Draft a stronger pinned post as one shortform post, not a thread. Fix this issue from the audit: ${pinnedDiagnosis} Keep the best proof from the current pinned post: "${clipPromptSnippet(pinnedPreview, 220)}".${
          direction ? ` Use this direction from the audit: ${direction}.` : ""
        }${pinnedImageContext}`
      : `Draft a stronger pinned post as one shortform post, not a thread. Fix this issue from the audit: ${pinnedDiagnosis} Introduce me with proof and give new visitors a clear reason to follow.${
          direction ? ` Use this direction from the audit: ${direction}.` : ""
        }${pinnedImageContext}`,
    {
      explicitIntent: "draft",
    },
  );
}

function buildStepFallbackChip(artifact: ProfileAnalysisArtifact): CreatorChatQuickReply | null {
  const nextStep = artifact.audit.steps.find(
    (step) =>
      step.status !== "pass" &&
      step.key !== "bio_formula" &&
      step.key !== "visual_real_estate" &&
      step.key !== "pinned_tweet",
  );

  if (nextStep) {
    return buildChip(
      nextStep.actionLabel,
      `Help me fix this next profile issue: ${nextStep.summary}`,
    );
  }

  const nextGap = artifact.audit.gaps[0];
  if (nextGap) {
    return buildChip(
      "Fix top gap",
      `Help me fix this next profile issue: ${nextGap}`,
    );
  }

  return null;
}

function buildAdditionalFallbackChips(
  artifact: ProfileAnalysisArtifact,
): CreatorChatQuickReply[] {
  const stepChips = artifact.audit.steps
    .filter(
      (step) =>
        step.status !== "pass" &&
        step.key !== "bio_formula" &&
        step.key !== "visual_real_estate" &&
        step.key !== "pinned_tweet",
    )
    .map((step) =>
      buildChip(step.actionLabel, `Help me fix this next profile issue: ${step.summary}`),
    );
  const gapChips = artifact.audit.gaps.map((gap, index) =>
    buildChip(
      index === 0 ? "Fix top gap" : `Fix gap ${index + 1}`,
      `Help me fix this next profile issue: ${gap}`,
    ),
  );
  const genericChips: CreatorChatQuickReply[] = [
    buildChip(
      "Prioritize fixes",
      "Rank the next profile fixes by leverage and tell me what to change first.",
    ),
    buildChip(
      "Pinned from strongest proof",
      "Turn my strongest proof or authority signal into a pinned post that gives new visitors a clear reason to follow.",
    ),
  ];

  return [...stepChips, ...gapChips, ...genericChips];
}

export function buildProfileAnalysisQuickReplies(
  artifact: ProfileAnalysisArtifact,
): CreatorChatQuickReply[] {
  const replies: CreatorChatQuickReply[] = [];

  if (artifact.audit.bioFormulaCheck.status !== "pass") {
    replies.push(buildBioChip(artifact));
  }

  if (artifact.audit.visualRealEstateCheck.status !== "pass") {
    replies.push(buildBannerChip());
  }

  if (artifact.audit.pinnedTweetCheck.status !== "pass") {
    replies.push(buildPinnedChip(artifact));
  }

  const fallbackChip = buildStepFallbackChip(artifact);
  if (fallbackChip) {
    replies.push(fallbackChip);
  }

  for (const fallback of buildAdditionalFallbackChips(artifact)) {
    if (replies.length >= 3) {
      break;
    }
    if (replies.some((reply) => reply.label === fallback.label)) {
      continue;
    }
    replies.push(fallback);
  }

  return replies.slice(0, 3);
}
