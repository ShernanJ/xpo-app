interface ExtensionAuthResult {
  user: {
    id: string;
    activeXHandle?: string | null;
  };
}

interface DraftPublishRequest {
  finalPublishedText: string;
  publishedTweetId?: string | null;
}

type FinalizeDraftPublishResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      status: number;
      field: string;
      message: string;
    };

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
    | { ok: false; field: string; message: string };
  finalizeDraftPublish(args: {
    id: string;
    userId: string;
    xHandle: string;
    finalPublishedText: string;
    publishedTweetId?: string | null;
  }): Promise<FinalizeDraftPublishResult>;
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
    return jsonError(400, parsed.field, parsed.message);
  }

  const result = await deps.finalizeDraftPublish({
    id: args.id,
    userId: auth.user.id,
    xHandle: handleResolution.xHandle,
    finalPublishedText: parsed.data.finalPublishedText,
    publishedTweetId: parsed.data.publishedTweetId,
  });
  if (!result.ok) {
    return jsonError(result.status, result.field, result.message);
  }

  return Response.json({ ok: true });
}
