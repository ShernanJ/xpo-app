"use client";

import type { BillingStatePayload } from "../billing/billingViewState";
import type { SourceMaterialAsset } from "../source-materials/sourceMaterialsState";
import type { DraftArtifactDetails } from "@/lib/onboarding/draftArtifacts";
import type { ProfileAnalysisArtifact } from "@/lib/chat/profileAnalysisArtifact";
import type { AgentProgressRun } from "@/lib/chat/agentProgress";
import type { SelectedAngleFormatHint } from "../../../../lib/agent-v2/contracts/turnContract.ts";
import type {
  ChatMediaAttachmentRef,
  ImageTurnContext,
} from "@/lib/chat/chatMedia";

export interface CreatorChatSuccess {
  ok: true;
  data: {
    reply: string;
    angles: unknown[];
    ideationFormatHint?: SelectedAngleFormatHint | null;
    quickReplies?: ChatQuickReply[];
    plan?: {
      objective: string;
      angle: string;
      targetLane: "original" | "reply" | "quote";
      mustInclude: string[];
      mustAvoid: string[];
      hookType: string;
      pitchResponse: string;
      formatPreference?: "shortform" | "longform" | "thread";
    } | null;
    draft?: string | null;
    drafts: string[];
    draftArtifacts: DraftArtifact[];
    draftVersions?: DraftVersionEntry[];
    activeDraftVersionId?: string;
    draftBundle?: DraftBundlePayload | null;
    previousVersionSnapshot?: DraftVersionSnapshot | null;
    revisionChainId?: string;
    supportAsset: string | null;
    mediaAttachments?: ChatMediaAttachmentRef[];
    groundingSources?: DraftArtifact["groundingSources"];
    autoSavedSourceMaterials?: {
      count: number;
      assets: Array<{
        id: string;
        title: string;
        deletable: boolean;
      }>;
    } | null;
    outputShape:
      | "coach_question"
      | "ideation_angles"
      | "planning_outline"
      | "profile_analysis"
      | "short_form_post"
      | "long_form_post"
      | "thread_seed"
      | "reply_candidate"
      | "quote_candidate";
    surfaceMode?:
      | "answer_directly"
      | "ask_one_question"
      | "revise_and_return"
      | "offer_options"
      | "generate_full_output";
    replyArtifacts?: ReplyArtifacts | null;
    replyParse?: ReplyParseEnvelope | null;
    contextPacket?: {
      version: string;
      summary: string;
    } | null;
    profileAnalysisArtifact?: ProfileAnalysisArtifact | null;
    newThreadId?: string;
    turnId?: string;
    messageId?: string;
    threadTitle?: string;
    billing?: BillingStatePayload;
    memory?: {
      conversationState: string;
      activeConstraints: string[];
      topicSummary: string | null;
      concreteAnswerCount: number;
      currentDraftArtifactId: string | null;
      activeDraftRef?: {
        messageId: string;
        versionId: string;
        revisionChainId?: string | null;
      } | null;
      rollingSummary?: string | null;
      pendingPlan?: {
        objective: string;
        angle: string;
        targetLane: "original" | "reply" | "quote";
        mustInclude: string[];
        mustAvoid: string[];
        hookType: string;
        pitchResponse: string;
        formatPreference?: "shortform" | "longform" | "thread";
      } | null;
      clarificationState?: {
        branchKey: string;
        stepKey: string;
        seedTopic: string | null;
      } | null;
      assistantTurnCount?: number;
      latestRefinementInstruction?: string | null;
      unresolvedQuestion?: string | null;
      clarificationQuestionsAsked?: number;
      preferredSurfaceMode?: "natural" | "structured" | null;
      formatPreference?: "shortform" | "longform" | "thread" | null;
      activeReplyContext?: {
        sourceText: string;
        sourceUrl: string | null;
        authorHandle: string | null;
        selectedReplyOptionId: string | null;
      } | null;
      voiceFidelity?: "balanced";
    };
  };
}

export type ChatTurnStatus =
  | "queued"
  | "running"
  | "cancel_requested"
  | "cancelled"
  | "completed"
  | "failed";

export interface ChatActiveTurn {
  turnId: string;
  threadId: string | null;
  status: ChatTurnStatus;
  progressStepId?: string | null;
  progressLabel?: string | null;
  progressExplanation?: string | null;
  assistantMessageId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type DraftArtifact = DraftArtifactDetails;
export type DraftVersionSource = "assistant_generated" | "assistant_revision" | "manual_save";

export interface DraftVersionEntry {
  id: string;
  content: string;
  source: DraftVersionSource;
  createdAt: string;
  basedOnVersionId: string | null;
  weightedCharacterCount: number;
  maxCharacterLimit: number;
  supportAsset: string | null;
  artifact?: DraftArtifact;
}

export interface DraftVersionSnapshot {
  messageId: string;
  versionId: string;
  content: string;
  source: DraftVersionSource;
  createdAt: string;
  maxCharacterLimit?: number;
  revisionChainId?: string;
}

export interface DraftBundleOption {
  id: string;
  label: string;
  framing?: string;
  versionId: string;
  content: string;
  artifact: DraftArtifact;
}

export interface DraftBundlePayload {
  kind: "sibling_options";
  selectedOptionId: string;
  options: DraftBundleOption[];
}

export interface ReplyIntentMetadata {
  label: string;
  strategyPillar: string;
  anchor: string;
  rationale: string;
}

export interface ReplyArtifactOption {
  id: string;
  label: string;
  text: string;
  intent?: ReplyIntentMetadata;
}

export type ReplyArtifacts =
  | {
      kind: "reply_options";
      sourceText: string;
      sourceUrl: string | null;
      authorHandle: string | null;
      options: ReplyArtifactOption[];
      groundingNotes: string[];
      warnings: string[];
      selectedOptionId: string | null;
    }
  | {
      kind: "reply_draft";
      sourceText: string;
      sourceUrl: string | null;
      authorHandle: string | null;
      options: ReplyArtifactOption[];
      notes: string[];
      selectedOptionId: string | null;
    };

export interface ReplyParseEnvelope {
  detected: boolean;
  confidence: "low" | "medium" | "high";
  needsConfirmation: boolean;
  parseReason: string;
}

export interface DraftDrawerSelection {
  messageId: string;
  versionId: string;
  revisionChainId?: string;
}

export type MessageFeedbackValue = "up" | "down";

export interface ChatMessage {
  id: string;
  threadId?: string;
  role: "assistant" | "user";
  content: string;
  createdAt?: string;
  excludeFromHistory?: boolean;
  quickReplies?: ChatQuickReply[];
  angles?: unknown[];
  ideationFormatHint?: SelectedAngleFormatHint | null;
  plan?: CreatorChatSuccess["data"]["plan"];
  draft?: string | null;
  drafts?: string[];
  draftArtifacts?: DraftArtifact[];
  draftVersions?: DraftVersionEntry[];
  activeDraftVersionId?: string;
  draftBundle?: DraftBundlePayload | null;
  previousVersionSnapshot?: DraftVersionSnapshot | null;
  revisionChainId?: string;
  supportAsset?: string | null;
  mediaAttachments?: ChatMediaAttachmentRef[];
  groundingSources?: DraftArtifact["groundingSources"];
  autoSavedSourceMaterials?: {
    count: number;
    assets: Array<{
      id: string;
      title: string;
      deletable: boolean;
    }>;
  } | null;
  promotedSourceMaterials?: {
    count: number;
    assets: SourceMaterialAsset[];
  } | null;
  whyThisWorks?: string[];
  watchOutFor?: string[];
  outputShape?: CreatorChatSuccess["data"]["outputShape"];
  surfaceMode?: CreatorChatSuccess["data"]["surfaceMode"];
  replyArtifacts?: ReplyArtifacts | null;
  replyParse?: ReplyParseEnvelope | null;
  contextPacket?: {
    version: string;
    summary: string;
  } | null;
  profileAnalysisArtifact?: ProfileAnalysisArtifact | null;
  imageTurnContext?: ImageTurnContext | null;
  feedbackValue?: MessageFeedbackValue | null;
  isStreaming?: boolean;
  agentProgress?: AgentProgressRun | null;
}

export type ChatIntent =
  | "coach"
  | "ideate"
  | "plan"
  | "planner_feedback"
  | "draft"
  | "review"
  | "edit";

export type ChatContentFocus =
  | "project_showcase"
  | "technical_insight"
  | "build_in_public"
  | "operator_lessons"
  | "social_observation";

export interface ChatQuickReply {
  kind:
    | "content_focus"
    | "example_reply"
    | "planner_action"
    | "clarification_choice"
    | "ideation_angle"
    | "image_post_confirmation";
  value: string;
  label: string;
  suggestedFocus?: ChatContentFocus;
  explicitIntent?: ChatIntent;
  formatPreference?: "shortform" | "longform" | "thread";
  angle?: string;
  formatHint?: SelectedAngleFormatHint;
  supportAsset?: string;
  imageAssetId?: string;
  decision?: "confirm" | "decline";
}
