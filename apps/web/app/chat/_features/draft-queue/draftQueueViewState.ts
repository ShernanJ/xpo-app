import type { DraftArtifactDetails } from "@/lib/onboarding/draftArtifacts";

export type DraftCandidateStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "edited"
  | "posted"
  | "observed";

type DraftArtifact = DraftArtifactDetails;

export interface DraftQueueCandidate {
  id: string;
  title: string;
  sourcePrompt: string;
  sourcePlaybook: string | null;
  outputShape: string;
  status: DraftCandidateStatus;
  artifact: DraftArtifact;
  voiceTarget: DraftArtifact["voiceTarget"];
  noveltyNotes: string[] | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  editedAt: string | null;
  postedAt: string | null;
  observedAt: string | null;
  observedMetrics: Record<string, unknown> | null;
}

export type DraftQueueMutationAction =
  | "approve"
  | "reject"
  | "edit"
  | "posted"
  | "observed"
  | "regenerate";

export interface DraftQueueMutationPayload {
  action: DraftQueueMutationAction;
  content?: string;
  rejectionReason?: string;
  observedMetrics?: Record<string, unknown>;
}

export type DraftQueueObservedMetricsCandidate = Pick<
  DraftQueueCandidate,
  "id" | "observedMetrics"
>;

function formatEnumLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatDraftQueueStatusLabel(status: DraftCandidateStatus): string {
  switch (status) {
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "edited":
      return "Edited";
    case "posted":
      return "Posted";
    case "observed":
      return "Observed";
    case "pending":
    default:
      return "Pending";
  }
}

export function getDraftQueueStatusClassName(status: DraftCandidateStatus): string {
  switch (status) {
    case "approved":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
    case "rejected":
      return "border-red-500/30 bg-red-500/10 text-red-200";
    case "edited":
      return "border-sky-500/30 bg-sky-500/10 text-sky-200";
    case "posted":
      return "border-violet-500/30 bg-violet-500/10 text-violet-200";
    case "observed":
      return "border-amber-500/30 bg-amber-500/10 text-amber-200";
    case "pending":
    default:
      return "border-white/10 bg-white/[0.05] text-zinc-300";
  }
}

export function summarizeVoiceTarget(
  voiceTarget: DraftArtifact["voiceTarget"] | null | undefined,
): string | null {
  if (!voiceTarget) {
    return null;
  }

  const parts = [
    voiceTarget.lane ? formatEnumLabel(voiceTarget.lane) : null,
    voiceTarget.compression ? formatEnumLabel(voiceTarget.compression) : null,
    voiceTarget.hookStyle ? formatEnumLabel(voiceTarget.hookStyle) : null,
    voiceTarget.formality ? formatEnumLabel(voiceTarget.formality) : null,
    voiceTarget.emojiPolicy ? formatEnumLabel(voiceTarget.emojiPolicy) : null,
  ].filter(Boolean) as string[];

  return parts.length > 0 ? parts.slice(0, 3).join(" • ") : null;
}

export function summarizeGroundingSource(
  source: DraftArtifact["groundingSources"][number],
): string | null {
  return source.claims[0] || source.snippets[0] || null;
}

export function getDraftGroundingLabel(
  artifact: Pick<DraftArtifact, "groundingMode">,
): string | null {
  switch (artifact.groundingMode) {
    case "saved_sources":
      return "Using saved stories";
    case "current_chat":
      return "Using this chat";
    case "mixed":
      return "Using saved stories + this chat";
    case "safe_framework":
      return "Safe framework mode";
    default:
      return null;
  }
}

export function getDraftGroundingToneClasses(
  artifact: Pick<DraftArtifact, "groundingMode">,
): {
  container: string;
  label: string;
} {
  if (artifact.groundingMode === "safe_framework") {
    return {
      container: "border-sky-500/20 bg-sky-500/[0.06]",
      label: "text-sky-300/80",
    };
  }

  return {
    container: "border-emerald-500/20 bg-emerald-500/[0.06]",
    label: "text-emerald-300/80",
  };
}
