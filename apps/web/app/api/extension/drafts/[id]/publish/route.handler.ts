interface ExtensionAuthResult {
  user: {
    id: string;
    activeXHandle?: string | null;
  };
}

interface DraftPublishRequest {
  publishedTweetId?: string | null;
}

interface PublishableDraftRecord {
  id: string;
  publishedTweetId: string | null;
}

interface ExtensionDraftPublishHandlerDeps {
  authenticateExtensionRequest(request: Request): Promise<ExtensionAuthResult | null>;
  parseExtensionDraftPublishRequest(body: unknown):
    | { ok: true; data: DraftPublishRequest }
    | { ok: false; message: string };
  findDraft(args: {
    id: string;
    userId: string;
    xHandle: string;
  }): Promise<PublishableDraftRecord | null>;
  publishDraft(args: {
    id: string;
    publishedTweetId?: string | null;
  }): Promise<void>;
}

function jsonError(status: number, field: string, message: string) {
  return Response.json(
    { ok: false, errors: [{ field, message }] },
    { status },
  );
}

function normalizeHandle(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/^@+/, "").toLowerCase() || "";
  return normalized || null;
}

export async function handleExtensionDraftPublishPost(
  request: Request,
  args: { id: string },
  deps: ExtensionDraftPublishHandlerDeps,
) {
  const auth = await deps.authenticateExtensionRequest(request);
  if (!auth?.user?.id) {
    return jsonError(401, "auth", "Unauthorized");
  }

  const xHandle = normalizeHandle(auth.user.activeXHandle);
  if (!xHandle) {
    return jsonError(409, "profile", "No active X handle is connected for this token.");
  }

  let body: unknown = {};
  try {
    const rawBody = await request.text();
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return jsonError(400, "body", "Request body must be valid JSON.");
  }

  const parsed = deps.parseExtensionDraftPublishRequest(body);
  if (!parsed.ok) {
    return jsonError(400, "body", parsed.message);
  }

  const draft = await deps.findDraft({
    id: args.id,
    userId: auth.user.id,
    xHandle,
  });
  if (!draft) {
    return jsonError(404, "id", "Draft not found.");
  }

  await deps.publishDraft({
    id: draft.id,
    publishedTweetId: parsed.data.publishedTweetId ?? draft.publishedTweetId,
  });

  return Response.json({ ok: true });
}
