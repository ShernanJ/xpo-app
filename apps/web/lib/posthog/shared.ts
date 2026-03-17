export const POSTHOG_DISTINCT_ID_HEADER = "X-POSTHOG-DISTINCT-ID";
export const POSTHOG_SESSION_ID_HEADER = "X-POSTHOG-SESSION-ID";

function trimOrNull(value: string | undefined | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function getPostHogProjectToken(): string | null {
  return (
    trimOrNull(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN) ??
    trimOrNull(process.env.NEXT_PUBLIC_POSTHOG_KEY)
  );
}

export function resolvePostHogHost(): string {
  return trimOrNull(process.env.NEXT_PUBLIC_POSTHOG_HOST) ?? "https://us.i.posthog.com";
}

export function resolvePostHogApiHost(): string {
  return "/ingest";
}

export function resolvePostHogUiHost(): string | undefined {
  const host = resolvePostHogHost();

  if (host === "https://us.i.posthog.com") {
    return "https://us.posthog.com";
  }

  if (host === "https://eu.i.posthog.com") {
    return "https://eu.posthog.com";
  }

  return undefined;
}

export function readPostHogRequestContext(request: Request | null | undefined): {
  clientDistinctId: string | null;
  sessionId: string | null;
} {
  if (!request) {
    return {
      clientDistinctId: null,
      sessionId: null,
    };
  }

  return {
    clientDistinctId: trimOrNull(request.headers.get(POSTHOG_DISTINCT_ID_HEADER)),
    sessionId: trimOrNull(request.headers.get(POSTHOG_SESSION_ID_HEADER)),
  };
}

export function buildPostHogServerProperties(args: {
  request?: Request | null;
  properties?: Record<string, unknown>;
}): Record<string, unknown> {
  const context = readPostHogRequestContext(args.request);

  return {
    ...(args.properties ?? {}),
    ...(context.clientDistinctId ? { client_distinct_id: context.clientDistinctId } : {}),
    ...(context.sessionId ? { $session_id: context.sessionId } : {}),
  };
}
