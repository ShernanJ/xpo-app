import {
  isPendingStatusStepId,
  isPendingStatusWorkflow,
  type PendingStatusStepId,
  type PendingStatusWorkflow,
} from "./agentProgress.ts";

const FALLBACK_STREAM_ERROR_MESSAGE = "The live model failed before the backend could return a response.";
const MAX_STREAM_ERROR_MESSAGE_LENGTH = 240;
const MAX_PROGRESS_LABEL_LENGTH = 120;
const MAX_PROGRESS_EXPLANATION_LENGTH = 200;

export interface ChatStreamProgressEventData {
  workflow: PendingStatusWorkflow;
  activeStepId: PendingStatusStepId;
  label?: string;
  explanation?: string;
}

export interface ChatStreamProgressEvent {
  type: "progress";
  data: ChatStreamProgressEventData;
}

export interface ChatStreamStatusEvent {
  type: "status";
  message: string;
}

export interface ChatStreamResultEvent<TResult> {
  type: "result";
  data: TResult;
}

export interface ChatStreamErrorEvent {
  type: "error";
  message: string;
}

export type ChatStreamEvent<TResult> =
  | ChatStreamProgressEvent
  | ChatStreamStatusEvent
  | ChatStreamResultEvent<TResult>
  | ChatStreamErrorEvent;

export function buildChatStreamProgressEvent(
  data: ChatStreamProgressEventData,
): ChatStreamProgressEvent {
  const label = data.label?.trim();
  const explanation = data.explanation?.trim();

  return {
    type: "progress",
    data: {
      workflow: data.workflow,
      activeStepId: data.activeStepId,
      ...(label ? { label: label.slice(0, MAX_PROGRESS_LABEL_LENGTH) } : {}),
      ...(explanation
        ? {
            explanation: explanation.slice(0, MAX_PROGRESS_EXPLANATION_LENGTH),
          }
        : {}),
    },
  };
}

export function buildChatStreamStatusEvent(message: string): ChatStreamStatusEvent {
  return {
    type: "status",
    message: message.trim(),
  };
}

export function buildChatStreamResultEvent<TResult>(
  data: TResult,
): ChatStreamResultEvent<TResult> {
  return {
    type: "result",
    data,
  };
}

export function buildChatStreamErrorEvent(
  message?: string | null,
): ChatStreamErrorEvent {
  const normalized = message?.trim();
  return {
    type: "error",
    message:
      normalized && normalized.length > 0
        ? normalized.slice(0, MAX_STREAM_ERROR_MESSAGE_LENGTH)
        : FALLBACK_STREAM_ERROR_MESSAGE,
  };
}

export function encodeChatStreamEvent<TResult>(
  event: ChatStreamEvent<TResult>,
): string {
  return `${JSON.stringify(event)}\n`;
}

export function sanitizeChatStreamProgressEventData(
  value: unknown,
): ChatStreamProgressEventData | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const workflow = record.workflow;
  const activeStepId = record.activeStepId;

  if (!isPendingStatusWorkflow(workflow) || !isPendingStatusStepId(activeStepId)) {
    return null;
  }

  const label =
    typeof record.label === "string"
      ? record.label.trim().slice(0, MAX_PROGRESS_LABEL_LENGTH)
      : null;
  const explanation =
    typeof record.explanation === "string"
      ? record.explanation.trim().slice(0, MAX_PROGRESS_EXPLANATION_LENGTH)
      : null;

  return {
    workflow,
    activeStepId,
    ...(label ? { label } : {}),
    ...(explanation ? { explanation } : {}),
  };
}
