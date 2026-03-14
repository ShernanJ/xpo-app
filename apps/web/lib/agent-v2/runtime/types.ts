import type { VoiceTarget } from "../core/voiceTarget";
import type {
  CreatorChatQuickReply,
  DraftFormatPreference,
  ResponseShapePlan,
  SurfaceMode,
  StrategyPlan,
  V2ChatIntent,
  V2ChatOutputShape,
  V2ConversationMemory,
} from "../contracts/chat";
import type {
  ChatArtifactContext,
  ChatPlanSeedSource,
  ChatResolvedWorkflow,
  ChatTurnSource,
} from "../contracts/turnContract";
import type {
  AgentRuntimeWorkflow,
  RuntimePersistedStateChanges,
  RuntimeResolutionSource,
  RuntimeValidationResult,
  RuntimeWorkerExecution,
  RuntimeWorkerExecutionSummary,
} from "./runtimeContracts.ts";
import type {
  DraftGroundingMode,
  ThreadFramingStyle,
} from "../../onboarding/shared/draftArtifacts.ts";
import type { ConversationalDiagnosticContext } from "./diagnostics.ts";
import type { ConversationRouterState } from "./conversationRouterMachine.ts";
import type {
  CreatorProfileHints,
  GroundingPacketSourceMaterial,
} from "../grounding/groundingPacket.ts";
import type { DraftBundleResult } from "../capabilities/drafting/draftBundles.ts";

export interface OrchestratorInput {
  userId: string;
  xHandle?: string | null;
  runId?: string;
  threadId?: string;
  userMessage: string;
  planSeedMessage?: string | null;
  recentHistory: string;
  explicitIntent?: V2ChatIntent | null;
  activeDraft?: string;
  turnSource?: ChatTurnSource;
  artifactContext?: ChatArtifactContext | null;
  planSeedSource?: ChatPlanSeedSource | null;
  resolvedWorkflow?: ChatResolvedWorkflow | null;
  replyHandlingBypassedReason?: string | null;
  formatPreference?: DraftFormatPreference | null;
  threadFramingStyle?: ThreadFramingStyle | null;
  preferenceConstraints?: string[];
  creatorProfileHints?: CreatorProfileHints | null;
  diagnosticContext?: ConversationalDiagnosticContext | null;
}

export interface OrchestratorData {
  angles?: unknown[];
  plan?: StrategyPlan | null;
  draft?: string | null;
  drafts?: string[];
  draftBundle?: DraftBundleResult | null;
  supportAsset?: string | null;
  issuesFixed?: string[];
  quickReplies?: CreatorChatQuickReply[];
  voiceTarget?: VoiceTarget | null;
  noveltyNotes?: string[];
  threadFramingStyle?: ThreadFramingStyle | null;
  groundingSources?: GroundingPacketSourceMaterial[];
  groundingMode?: DraftGroundingMode | null;
  groundingExplanation?: string | null;
  autoSavedSourceMaterials?: {
    count: number;
    assets: Array<{
      id: string;
      title: string;
      deletable: boolean;
    }>;
  };
  routingTrace?: RoutingTrace;
}

export interface RoutingTrace {
  normalizedTurn: {
    turnSource: ChatTurnSource;
    artifactKind: ChatArtifactContext["kind"] | null;
    planSeedSource: ChatPlanSeedSource | null;
    replyHandlingBypassedReason: string | null;
    resolvedWorkflow: ChatResolvedWorkflow | null;
  };
  runtimeResolution:
    | {
        workflow: AgentRuntimeWorkflow;
        source: RuntimeResolutionSource;
      }
    | null;
  workerExecutions: RuntimeWorkerExecution[];
  workerExecutionSummary: RuntimeWorkerExecutionSummary;
  persistedStateChanges: RuntimePersistedStateChanges | null;
  validations: RuntimeValidationResult[];
  turnPlan: {
    userGoal: string;
    overrideClassifiedIntent: string | null;
    shouldAutoDraftFromPlan: boolean;
  } | null;
  controllerAction: string | null;
  classifiedIntent: string | null;
  resolvedMode: string | null;
  routerState: ConversationRouterState | null;
  planInputSource: "raw_user_message" | "clarification_answer" | "grounded_topic" | null;
  clarification:
    | {
        kind: "question" | "tree";
        reason: string | null;
        branchKey: string | null;
        question: string;
      }
    | null;
  draftGuard:
    | {
        reason:
          | "claim_needs_clarification"
          | "concrete_scene_drift"
          | "product_drift"
          | "delivery_validation_failed";
        issues: string[];
      }
    | null;
  planFailure:
    | {
        reason: string;
      }
    | null;
}

export interface RoutingTracePatch {
  clarification?: RoutingTrace["clarification"];
  draftGuard?: RoutingTrace["draftGuard"];
}

export type OrchestratorResponse = {
  mode: "coach" | "ideate" | "plan" | "draft" | "error";
  outputShape: V2ChatOutputShape;
  response: string;
  surfaceMode: SurfaceMode;
  responseShapePlan: ResponseShapePlan;
  data?: OrchestratorData;
  memory: V2ConversationMemory;
};

export type RawOrchestratorResponse = Omit<
  OrchestratorResponse,
  "surfaceMode" | "responseShapePlan"
>;

export interface ManagedConversationTurnRawResult {
  rawResponse: RawOrchestratorResponse;
  routingTrace: RoutingTrace;
}
