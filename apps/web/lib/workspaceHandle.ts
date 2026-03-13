export const WORKSPACE_HANDLE_HEADER = "x-xpo-handle";

export function normalizeWorkspaceHandle(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(/^@+/, "").toLowerCase();
  return normalized || null;
}

export function getWorkspaceHandleFromRequest(request: Request): string | null {
  const headerHandle = normalizeWorkspaceHandle(request.headers.get(WORKSPACE_HANDLE_HEADER));
  if (headerHandle) {
    return headerHandle;
  }

  try {
    const url = new URL(request.url);
    return normalizeWorkspaceHandle(url.searchParams.get("xHandle"));
  } catch {
    return null;
  }
}

export function buildWorkspaceHandleHeaders(
  xHandle: string | null | undefined,
  headers?: HeadersInit,
): HeadersInit | undefined {
  const normalizedHandle = normalizeWorkspaceHandle(xHandle);
  if (!normalizedHandle) {
    return headers;
  }

  const nextHeaders = new Headers(headers);
  nextHeaders.set(WORKSPACE_HANDLE_HEADER, normalizedHandle);
  return nextHeaders;
}

export function buildChatWorkspaceUrl(args: {
  threadId?: string | null;
  xHandle?: string | null;
}): string {
  const normalizedHandle = normalizeWorkspaceHandle(args.xHandle);
  const normalizedThreadId = typeof args.threadId === "string" ? args.threadId.trim() : "";
  const path = normalizedThreadId
    ? `/chat/${encodeURIComponent(normalizedThreadId)}`
    : "/chat";

  if (!normalizedHandle) {
    return path;
  }

  const params = new URLSearchParams();
  params.set("xHandle", normalizedHandle);
  return `${path}?${params.toString()}`;
}
