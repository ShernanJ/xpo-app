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
  resolveExtensionHandleForRequest(args: {
    request: Request;
    userId: string;
    activeXHandle?: string | null;
  }): Promise<
    | {
        ok: true;
        xHandle: string;
      }
    | {
        ok: false;
        status: number;
        field: string;
        message: string;
      }
  >;
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

export async function handleExtensionDraftPublishPost(
  request: Request,
  args: { id: string },
  deps: ExtensionDraftPublishHandlerDeps,
) {
  const auth = await deps.authenticateExtensionRequest(request);
  if (!auth?.user?.id) {
    return jsonError(401, "auth", "Unauthorized");
  }

  const handleResolution = await deps.resolveExtensionHandleForRequest({
    request,
    userId: auth.user.id,
    activeXHandle: auth.user.activeXHandle,
  });
  if (!handleResolution.ok) {
    return jsonError(handleResolution.status, handleResolution.field, handleResolution.message);
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
    xHandle: handleResolution.xHandle,
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
