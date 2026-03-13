import type { DraftFormatPreference, V2ChatIntent } from "./chat.ts";
import type {
  ChatArtifactContext,
  ChatTurnSource,
  SelectedDraftContextPayload,
} from "./turnContract.ts";
import type { ThreadFramingStyle } from "../../onboarding/draftArtifacts.ts";
import { normalizeWorkspaceHandle } from "../../workspaceHandle.ts";

export interface CreatorChatTransportRequest {
  runId?: string;
  threadId?: string;
  workspaceHandle?: string | null;
  clientTurnId?: string | null;
  message?: string;
  history?: unknown[];
  turnSource?: ChatTurnSource;
  artifactContext?: ChatArtifactContext | null;
  intent?: V2ChatIntent | null;
  contentFocus?: string | null;
  selectedDraftContext?: SelectedDraftContextPayload | null;
  formatPreference?: DraftFormatPreference | null;
  threadFramingStyle?: ThreadFramingStyle | null;
  preferenceConstraints?: string[];
  preferenceSettings?: unknown;
  replyContext?: unknown;
  goal?: unknown;
  toneRisk?: unknown;
  provider?: string | null;
  stream?: boolean;
}

export interface BuildCreatorChatTransportRequestInput
  extends CreatorChatTransportRequest {}

export function createClientTurnId(): string {
  return `turn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeClientTurnId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, 120);
}

export function buildCreatorChatTransportRequest(
  input: BuildCreatorChatTransportRequestInput,
): CreatorChatTransportRequest {
  const message = typeof input.message === "string" ? input.message.trim() : "";
  const workspaceHandle = normalizeWorkspaceHandle(input.workspaceHandle);
  const clientTurnId = normalizeClientTurnId(input.clientTurnId);
  const request: CreatorChatTransportRequest = {
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.threadId ? { threadId: input.threadId } : {}),
    ...(workspaceHandle ? { workspaceHandle } : {}),
    ...(clientTurnId ? { clientTurnId } : {}),
    ...(message ? { message } : {}),
    ...(Array.isArray(input.history) ? { history: input.history } : {}),
    ...(input.turnSource ? { turnSource: input.turnSource } : {}),
    ...(input.artifactContext ? { artifactContext: input.artifactContext } : {}),
    ...(input.intent ? { intent: input.intent } : {}),
    ...(typeof input.contentFocus === "string" && input.contentFocus.trim()
      ? { contentFocus: input.contentFocus.trim() }
      : {}),
    ...(input.selectedDraftContext ? { selectedDraftContext: input.selectedDraftContext } : {}),
    ...(input.formatPreference ? { formatPreference: input.formatPreference } : {}),
    ...(input.threadFramingStyle ? { threadFramingStyle: input.threadFramingStyle } : {}),
    ...(Array.isArray(input.preferenceConstraints) && input.preferenceConstraints.length > 0
      ? { preferenceConstraints: input.preferenceConstraints }
      : {}),
    ...(input.preferenceSettings ? { preferenceSettings: input.preferenceSettings } : {}),
    ...(input.replyContext ? { replyContext: input.replyContext } : {}),
    ...(input.goal !== undefined ? { goal: input.goal } : {}),
    ...(input.toneRisk !== undefined ? { toneRisk: input.toneRisk } : {}),
    ...(typeof input.provider === "string" && input.provider.trim()
      ? { provider: input.provider.trim() }
      : {}),
    ...(typeof input.stream === "boolean" ? { stream: input.stream } : {}),
  };

  return request;
}
