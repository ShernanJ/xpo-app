"use client";

import { normalizeWorkspaceHandle } from "@/lib/workspaceHandle";

export type QueuedInitialPromptSource = "composer" | "quick_action";

export interface QueuedInitialPrompt {
  handle: string;
  prompt: string;
  source: QueuedInitialPromptSource;
  createdAt: string;
}

const QUEUED_INITIAL_PROMPT_KEY_PREFIX = "xpo:chat:queued-initial-prompt:";
const JUST_ONBOARDED_HANDLE_KEY_PREFIX = "xpo:chat:just-onboarded:";

function getSessionStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function normalizeHandleKey(handle: string | null | undefined): string | null {
  return normalizeWorkspaceHandle(handle);
}

function getQueuedInitialPromptStorageKey(handle: string): string {
  return `${QUEUED_INITIAL_PROMPT_KEY_PREFIX}${handle}`;
}

function getJustOnboardedStorageKey(handle: string): string {
  return `${JUST_ONBOARDED_HANDLE_KEY_PREFIX}${handle}`;
}

export function readQueuedInitialPrompt(
  handle: string | null | undefined,
): QueuedInitialPrompt | null {
  const normalizedHandle = normalizeHandleKey(handle);
  const storage = normalizedHandle ? getSessionStorage() : null;
  if (!normalizedHandle || !storage) {
    return null;
  }

  try {
    const raw = storage.getItem(getQueuedInitialPromptStorageKey(normalizedHandle));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<QueuedInitialPrompt> | null;
    if (
      !parsed ||
      parsed.handle !== normalizedHandle ||
      typeof parsed.prompt !== "string" ||
      typeof parsed.createdAt !== "string" ||
      (parsed.source !== "composer" && parsed.source !== "quick_action")
    ) {
      storage.removeItem(getQueuedInitialPromptStorageKey(normalizedHandle));
      return null;
    }

    return {
      handle: normalizedHandle,
      prompt: parsed.prompt,
      source: parsed.source,
      createdAt: parsed.createdAt,
    };
  } catch {
    storage.removeItem(getQueuedInitialPromptStorageKey(normalizedHandle));
    return null;
  }
}

export function writeQueuedInitialPrompt(
  prompt: QueuedInitialPrompt,
): QueuedInitialPrompt | null {
  const normalizedHandle = normalizeHandleKey(prompt.handle);
  const trimmedPrompt = prompt.prompt.trim();
  const storage = normalizedHandle ? getSessionStorage() : null;
  if (!normalizedHandle || !trimmedPrompt || !storage) {
    return null;
  }

  const nextValue: QueuedInitialPrompt = {
    handle: normalizedHandle,
    prompt: trimmedPrompt,
    source: prompt.source,
    createdAt: prompt.createdAt,
  };

  storage.setItem(
    getQueuedInitialPromptStorageKey(normalizedHandle),
    JSON.stringify(nextValue),
  );
  return nextValue;
}

export function clearQueuedInitialPrompt(handle: string | null | undefined): void {
  const normalizedHandle = normalizeHandleKey(handle);
  const storage = normalizedHandle ? getSessionStorage() : null;
  if (!normalizedHandle || !storage) {
    return;
  }

  storage.removeItem(getQueuedInitialPromptStorageKey(normalizedHandle));
}

export function markHandleJustOnboarded(handle: string | null | undefined): void {
  const normalizedHandle = normalizeHandleKey(handle);
  const storage = normalizedHandle ? getSessionStorage() : null;
  if (!normalizedHandle || !storage) {
    return;
  }

  storage.setItem(getJustOnboardedStorageKey(normalizedHandle), "1");
}

export function consumeJustOnboardedHandle(handle: string | null | undefined): boolean {
  const normalizedHandle = normalizeHandleKey(handle);
  const storage = normalizedHandle ? getSessionStorage() : null;
  if (!normalizedHandle || !storage) {
    return false;
  }

  const key = getJustOnboardedStorageKey(normalizedHandle);
  const value = storage.getItem(key);
  if (value !== "1") {
    return false;
  }

  storage.removeItem(key);
  return true;
}
