import type {
  ResponsePresentationStyle,
  ResponseShapePlan,
  SurfaceMode,
  V2ChatOutputShape,
  V2ConversationMemory,
} from "../contracts/chat.ts";
import { shapeAssistantResponse } from "./responseShaper.ts";
import { selectResponseShapePlan } from "./surfaceModeSelector.ts";

type OrchestratorMode = "coach" | "ideate" | "plan" | "draft" | "error";

export interface RawResponseEnvelope {
  mode: OrchestratorMode;
  outputShape: V2ChatOutputShape;
  response: string;
  data?: unknown;
  memory: V2ConversationMemory;
  presentationStyle?: ResponsePresentationStyle | null;
}

export interface FinalizedResponseEnvelope extends Omit<RawResponseEnvelope, "presentationStyle"> {
  surfaceMode: SurfaceMode;
  responseShapePlan: ResponseShapePlan;
}

export type RawFastReplyEnvelope<TData = unknown> =
  RawResponseEnvelope & {
    data?: TData;
  };

export type FinalizedFastReplyEnvelope<TData = unknown> =
  FinalizedResponseEnvelope & {
    data?: TData;
  };

export function finalizeResponseEnvelope<T extends RawResponseEnvelope>(
  rawResponse: T,
): Omit<T, "presentationStyle"> & {
  surfaceMode: SurfaceMode;
  responseShapePlan: ResponseShapePlan;
} {
  const { presentationStyle, ...rawResponseWithoutPresentationStyle } = rawResponse;
  const resultData =
    rawResponse.data && typeof rawResponse.data === "object" && !Array.isArray(rawResponse.data)
      ? (rawResponse.data as Record<string, unknown>)
      : undefined;
  const responseShapePlan = selectResponseShapePlan({
    outputShape: rawResponse.outputShape,
    response: rawResponse.response,
    hasQuickReplies:
      Array.isArray(resultData?.quickReplies) && resultData.quickReplies.length > 0,
    hasAngles: Array.isArray(resultData?.angles) && resultData.angles.length > 0,
    hasPlan: Boolean(resultData?.plan),
    hasDraft: typeof resultData?.draft === "string" && resultData.draft.length > 0,
    conversationState: rawResponse.memory.conversationState,
    preferredSurfaceMode: rawResponse.memory.preferredSurfaceMode,
  });

  return {
    ...rawResponseWithoutPresentationStyle,
    response: shapeAssistantResponse({
      response: rawResponse.response,
      outputShape: rawResponse.outputShape,
      plan: responseShapePlan,
      presentationStyle,
    }),
    surfaceMode: responseShapePlan.surfaceMode,
    responseShapePlan,
  };
}

export function buildFastReplyOrchestratorResponse<TData = unknown>(args: {
  response: string;
  memory: V2ConversationMemory;
  data?: TData;
  presentationStyle?: ResponsePresentationStyle | null;
}): FinalizedFastReplyEnvelope<TData> {
  return finalizeResponseEnvelope(
    buildFastReplyRawResponse(args),
  ) as FinalizedFastReplyEnvelope<TData>;
}

export function buildFastReplyRawResponse<TData = unknown>(args: {
  response: string;
  memory: V2ConversationMemory;
  data?: TData;
  presentationStyle?: ResponsePresentationStyle | null;
}): RawFastReplyEnvelope<TData> {
  return {
    mode: "coach",
    outputShape: "coach_question",
    response: args.response,
    data: args.data,
    memory: args.memory,
    presentationStyle: args.presentationStyle ?? undefined,
  };
}
