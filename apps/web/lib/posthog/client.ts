"use client";

import posthog from "posthog-js";
import type { AppSessionUser } from "@/lib/auth/types";
import {
  getPostHogProjectToken,
  POSTHOG_DISTINCT_ID_HEADER,
  POSTHOG_SESSION_ID_HEADER,
} from "./shared";

function isPostHogReady(): boolean {
  return typeof window !== "undefined" && Boolean(getPostHogProjectToken());
}

function trimOrUndefined(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function buildPostHogHeaders(headers?: HeadersInit): Headers {
  const nextHeaders = new Headers(headers);

  if (!isPostHogReady()) {
    return nextHeaders;
  }

  const distinctId = trimOrUndefined(posthog.get_distinct_id());
  const sessionId = trimOrUndefined(posthog.get_session_id());

  if (distinctId) {
    nextHeaders.set(POSTHOG_DISTINCT_ID_HEADER, distinctId);
  }

  if (sessionId) {
    nextHeaders.set(POSTHOG_SESSION_ID_HEADER, sessionId);
  }

  return nextHeaders;
}

export function capturePostHogEvent(event: string, properties?: Record<string, unknown>) {
  if (!isPostHogReady()) {
    return;
  }

  posthog.capture(event, properties);
}

export function capturePostHogException(
  error: unknown,
  additionalProperties?: Record<string, unknown>,
) {
  if (!isPostHogReady()) {
    return;
  }

  posthog.captureException(error, additionalProperties);
}

export function identifyPostHogUser(user: Partial<AppSessionUser> | null | undefined) {
  const distinctId = trimOrUndefined(user?.id);
  if (!isPostHogReady() || !distinctId) {
    return;
  }

  posthog.identify(distinctId, {
    email: trimOrUndefined(user?.email),
    name: trimOrUndefined(user?.name),
    handle: trimOrUndefined(user?.handle),
    active_x_handle: trimOrUndefined(user?.activeXHandle),
  });
}

export function resetPostHogUser() {
  if (!isPostHogReady()) {
    return;
  }

  posthog.reset();
}
