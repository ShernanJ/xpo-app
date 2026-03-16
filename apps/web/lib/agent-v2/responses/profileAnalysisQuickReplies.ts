import type { CreatorChatQuickReply } from "../contracts/chat.ts";
import type { ProfileAnalysisArtifact } from "../../chat/profileAnalysisArtifact.ts";

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function truncateLabel(value: string): string {
  const normalized = normalizeText(value);
  return normalized.length > 30 ? `${normalized.slice(0, 27).trimEnd()}...` : normalized;
}

function buildChip(label: string, value: string): CreatorChatQuickReply {
  return {
    kind: "planner_action",
    label: truncateLabel(label),
    value: normalizeText(value),
  };
}

function buildBioChip(artifact: ProfileAnalysisArtifact): CreatorChatQuickReply {
  const suggestedBio = artifact.audit.bioFormulaCheck.alternatives[0]?.text;

  return buildChip(
    "Rewrite bio",
    suggestedBio
      ? `Rewrite my X bio to be clearer and more conversion-focused. Use this direction as the starting point: "${suggestedBio}"`
      : "Rewrite my X bio so it clearly says who I help, the outcome, and the proof.",
  );
}

function buildBannerChip(): CreatorChatQuickReply {
  return buildChip(
    "Fix banner promise",
    "Give me 3 clearer banner or header copy options in plain language so the value proposition is obvious at a glance.",
  );
}

function buildPinnedChip(artifact: ProfileAnalysisArtifact): CreatorChatQuickReply {
  const pinnedPreview = artifact.pinnedPost?.text?.trim();

  return buildChip(
    "Draft pinned post",
    pinnedPreview
      ? `Draft a stronger pinned post that keeps the best proof from this current version: "${pinnedPreview}"`
      : "Draft a stronger pinned post that introduces me with proof and gives new visitors a clear reason to follow.",
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
