"use client";

export interface DraftRevealMessageLike {
  id: string;
  role: "assistant" | "user";
  draft?: string | null;
  draftArtifacts?: unknown[];
  draftBundle?: {
    options?: unknown[];
  } | null;
  draftVersions?: unknown[];
}

export function messageHasDraftOutput(message: DraftRevealMessageLike): boolean {
  return Boolean(
    message.draft?.trim() ||
      message.draftArtifacts?.length ||
      message.draftBundle?.options?.length ||
      message.draftVersions?.length,
  );
}

export function hasActiveDraftReveal(
  activeDraftRevealByMessageId: Record<string, string>,
  messageId: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(activeDraftRevealByMessageId, messageId);
}

function resolveDraftRevealPhase(
  activeDraftRevealByMessageId: Record<string, string>,
  messageId: string,
  draftKey: string,
): "none" | "primary" | "secondary" {
  const primaryDraftRevealKey = activeDraftRevealByMessageId[messageId];
  if (!primaryDraftRevealKey) {
    return "none";
  }

  return primaryDraftRevealKey === draftKey ? "primary" : "secondary";
}

export function buildDraftRevealClassName(
  activeDraftRevealByMessageId: Record<string, string>,
  messageId: string,
  draftKey: string,
): string {
  const phase = resolveDraftRevealPhase(
    activeDraftRevealByMessageId,
    messageId,
    draftKey,
  );
  if (phase === "primary") {
    return "animate-draft-card-reveal";
  }
  if (phase === "secondary") {
    return "animate-draft-option-stagger";
  }
  return "";
}

export function shouldAnimateDraftRevealLines(
  activeDraftRevealByMessageId: Record<string, string>,
  messageId: string,
  draftKey: string,
): boolean {
  return (
    resolveDraftRevealPhase(activeDraftRevealByMessageId, messageId, draftKey) ===
    "primary"
  );
}
