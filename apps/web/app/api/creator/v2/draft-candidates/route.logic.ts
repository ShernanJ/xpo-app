import type { DraftFormatPreference } from "../../../../../lib/agent-v2/contracts/chat.ts";
import type {
  RawOrchestratorResponse,
  RoutingTrace,
} from "../../../../../lib/agent-v2/runtime/conversationManager.ts";
import type { VoiceTarget } from "../../../../../lib/agent-v2/core/voiceTarget.ts";
import { resolveThreadFramingStyle } from "../../../../../lib/onboarding/shared/draftArtifacts.ts";
import {
  buildInitialDraftVersionPayload,
} from "../chat/_lib/request/routeLogic.ts";

export interface DraftQueueBrief {
  title: string;
  prompt: string;
  formatPreference: DraftFormatPreference;
  sourcePlaybook: string;
}

export interface DraftCandidateGenerationFailure {
  title: string;
  prompt: string;
  sourcePlaybook: string;
  formatPreference: DraftFormatPreference;
  mode: RawOrchestratorResponse["mode"];
  outputShape: RawOrchestratorResponse["outputShape"];
  reason:
    | "clarification_required"
    | "draft_guard"
    | "plan_failure"
    | "non_draft_response"
    | "missing_draft_payload"
    | "missing_artifact";
  traceReason: string | null;
  detail: string | null;
}

export interface DraftCandidateArtifactPayload {
  artifact: NonNullable<
    ReturnType<typeof buildInitialDraftVersionPayload>["draftArtifacts"][number]
  >;
  outputShape: RawOrchestratorResponse["outputShape"];
  draftVersionId: string | null;
  basedOnVersionId: string | null;
  revisionChainId: string | null;
  voiceTarget: VoiceTarget | null;
  noveltyNotes: string[];
  retrievedAnchorIds: string[];
}

function buildFailureBase(
  brief: DraftQueueBrief,
  rawResponse: RawOrchestratorResponse,
): Omit<DraftCandidateGenerationFailure, "reason" | "traceReason" | "detail"> {
  return {
    title: brief.title,
    prompt: brief.prompt,
    sourcePlaybook: brief.sourcePlaybook,
    formatPreference: brief.formatPreference,
    mode: rawResponse.mode,
    outputShape: rawResponse.outputShape,
  };
}

export function buildDraftCandidateOutcome(args: {
  brief: DraftQueueBrief;
  rawResponse: RawOrchestratorResponse;
  routingTrace: RoutingTrace;
  threadPostMaxCharacterLimit: number;
}):
  | { ok: true; candidate: DraftCandidateArtifactPayload }
  | { ok: false; failure: DraftCandidateGenerationFailure } {
  const resultData =
    args.rawResponse.data &&
    typeof args.rawResponse.data === "object" &&
    !Array.isArray(args.rawResponse.data)
      ? (args.rawResponse.data as Record<string, unknown>)
      : null;

  if (args.rawResponse.mode !== "draft") {
    if (args.routingTrace.clarification) {
      return {
        ok: false,
        failure: {
          ...buildFailureBase(args.brief, args.rawResponse),
          reason: "clarification_required",
          traceReason:
            args.routingTrace.clarification.reason ||
            args.routingTrace.clarification.branchKey ||
            null,
          detail: args.routingTrace.clarification.question,
        },
      };
    }

    if (args.routingTrace.draftGuard) {
      return {
        ok: false,
        failure: {
          ...buildFailureBase(args.brief, args.rawResponse),
          reason: "draft_guard",
          traceReason: args.routingTrace.draftGuard.reason,
          detail: args.routingTrace.draftGuard.issues[0] || null,
        },
      };
    }

    if (args.routingTrace.planFailure) {
      return {
        ok: false,
        failure: {
          ...buildFailureBase(args.brief, args.rawResponse),
          reason: "plan_failure",
          traceReason: args.routingTrace.planFailure.reason,
          detail: args.routingTrace.planFailure.reason,
        },
      };
    }

    return {
      ok: false,
      failure: {
        ...buildFailureBase(args.brief, args.rawResponse),
        reason: "non_draft_response",
        traceReason: null,
        detail: null,
      },
    };
  }

  const draft =
    typeof resultData?.draft === "string" && resultData.draft.trim().length > 0
      ? resultData.draft
      : null;
  if (!draft) {
    return {
      ok: false,
      failure: {
        ...buildFailureBase(args.brief, args.rawResponse),
        reason: "missing_draft_payload",
        traceReason: null,
        detail: null,
      },
    };
  }

  const payload = buildInitialDraftVersionPayload({
    draft,
    outputShape: args.rawResponse.outputShape,
    supportAsset:
      typeof resultData?.supportAsset === "string" ? resultData.supportAsset : null,
    selectedDraftContext: null,
    groundingSources: Array.isArray(resultData?.groundingSources)
      ? resultData.groundingSources
      : [],
    voiceTarget:
      resultData?.voiceTarget &&
      typeof resultData.voiceTarget === "object" &&
      !Array.isArray(resultData.voiceTarget)
        ? (resultData.voiceTarget as VoiceTarget)
        : null,
    noveltyNotes: Array.isArray(resultData?.noveltyNotes)
      ? (resultData.noveltyNotes as string[])
      : [],
    retrievedAnchorIds: Array.isArray(resultData?.retrievedAnchorIds)
      ? resultData.retrievedAnchorIds
          .map((value) => (typeof value === "string" ? value.trim() : ""))
          .filter(Boolean)
      : [],
    threadPostMaxCharacterLimit: args.threadPostMaxCharacterLimit,
    threadFramingStyle: resolveThreadFramingStyle(resultData?.threadFramingStyle),
  });

  const artifact = payload.draftArtifacts[0] || null;
  if (!artifact) {
    return {
      ok: false,
      failure: {
        ...buildFailureBase(args.brief, args.rawResponse),
        reason: "missing_artifact",
        traceReason: null,
        detail: null,
      },
    };
  }

  return {
    ok: true,
    candidate: {
      artifact,
      outputShape: args.rawResponse.outputShape,
      draftVersionId: payload.activeDraftVersionId ?? null,
      basedOnVersionId: payload.draftVersions?.[0]?.basedOnVersionId ?? null,
      revisionChainId: payload.revisionChainId ?? null,
      voiceTarget:
        resultData?.voiceTarget &&
        typeof resultData.voiceTarget === "object" &&
        !Array.isArray(resultData.voiceTarget)
          ? (resultData.voiceTarget as VoiceTarget)
          : null,
      noveltyNotes: Array.isArray(resultData?.noveltyNotes)
        ? (resultData.noveltyNotes as string[])
        : [],
      retrievedAnchorIds: artifact.retrievedAnchorIds ?? [],
    },
  };
}
