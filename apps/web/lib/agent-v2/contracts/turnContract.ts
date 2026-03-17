import type { V2ChatIntent } from "./chat";

export type ChatTurnSource =
  | "free_text"
  | "ideation_pick"
  | "quick_reply"
  | "draft_action"
  | "reply_action";

export type ChatResolvedWorkflow =
  | "free_text"
  | "ideate"
  | "plan_then_draft"
  | "revise_draft"
  | "reply_to_post"
  | "analyze_post";

export type ChatPlanSeedSource = "message" | "selected_angle" | "content_focus";

export type SelectedAngleFormatHint = "post" | "thread";

export interface SelectedDraftContextPayload {
  messageId: string;
  versionId: string;
  content: string;
  source?: "assistant_generated" | "assistant_revision" | "manual_save";
  createdAt?: string;
  maxCharacterLimit?: number;
  revisionChainId?: string;
  focusedThreadPostIndex?: number;
}

export interface SelectedAngleArtifactContext {
  kind: "selected_angle";
  angle: string;
  formatHint: SelectedAngleFormatHint;
  supportAsset?: string;
  imageAssetId?: string;
}

export interface ImagePostConfirmationArtifactContext {
  kind: "image_post_confirmation";
  decision: "confirm" | "decline";
  imageAssetId?: string;
}

export interface DraftSelectionArtifactContext {
  kind: "draft_selection";
  action: "edit" | "review";
  selectedDraftContext: SelectedDraftContextPayload;
}

export interface ReplyOptionSelectArtifactContext {
  kind: "reply_option_select";
  optionIndex: number;
}

export interface ReplyConfirmationArtifactContext {
  kind: "reply_confirmation";
  decision: "confirm" | "decline";
}

export type ChatArtifactContext =
  | SelectedAngleArtifactContext
  | ImagePostConfirmationArtifactContext
  | DraftSelectionArtifactContext
  | ReplyOptionSelectArtifactContext
  | ReplyConfirmationArtifactContext;

export interface NormalizedChatTurnDiagnostics {
  turnSource: ChatTurnSource;
  artifactKind: ChatArtifactContext["kind"] | null;
  planSeedSource: ChatPlanSeedSource | null;
  replyHandlingBypassedReason: string | null;
  resolvedWorkflow: ChatResolvedWorkflow;
}

export interface NormalizedChatTurn {
  source: ChatTurnSource;
  message: string;
  transcriptMessage: string;
  orchestrationMessage: string;
  explicitIntent: V2ChatIntent | null;
  selectedDraftContext: SelectedDraftContextPayload | null;
  artifactContext: ChatArtifactContext | null;
  diagnostics: NormalizedChatTurnDiagnostics;
  shouldAllowReplyHandling: boolean;
}
