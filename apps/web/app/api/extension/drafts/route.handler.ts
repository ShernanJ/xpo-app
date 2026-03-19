import type { ExtensionDraftsResponse } from "../../../../lib/extension/types.ts";

interface ExtensionAuthResult {
  user: {
    id: string;
    activeXHandle?: string | null;
  };
}

interface ExtensionDraftRecord {
  id: string;
  title: string;
  sourcePrompt: string;
  sourcePlaybook: string | null;
  outputShape: string;
  status: string;
  reviewStatus: string;
  folder: {
    id: string;
    name: string;
    color: string | null;
    createdAt: string;
  } | null;
  artifact: {
    id: string;
    title: string;
    kind: string;
    content: string;
    posts: Array<{
      id: string;
      content: string;
      weightedCharacterCount: number;
      maxCharacterLimit: number;
      isWithinXLimit: boolean;
    }>;
  } | null;
  createdAt: string;
  updatedAt: string;
}

interface ExtensionDraftsHandlerDeps {
  authenticateExtensionRequest(request: Request): Promise<ExtensionAuthResult | null>;
  resolveExtensionHandleForRequest(args: {
    request: Request;
    userId: string;
    requestedHandle?: string | null | undefined;
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
  listDrafts(args: {
    userId: string;
    xHandle: string;
  }): Promise<ExtensionDraftRecord[]>;
  assertExtensionDraftsResponseShape(response: ExtensionDraftsResponse): boolean;
}

function jsonError(status: number, field: string, message: string) {
  return Response.json(
    { ok: false, errors: [{ field, message }] },
    { status },
  );
}

export async function handleExtensionDraftsGet(
  request: Request,
  deps: ExtensionDraftsHandlerDeps,
  requestedHandle: string | null | undefined,
) {
  const auth = await deps.authenticateExtensionRequest(request);
  if (!auth?.user?.id) {
    return jsonError(401, "auth", "Unauthorized");
  }

  const handleResolution = await deps.resolveExtensionHandleForRequest({
    request,
    userId: auth.user.id,
    requestedHandle,
    activeXHandle: auth.user.activeXHandle,
  });
  if (!handleResolution.ok) {
    return jsonError(handleResolution.status, handleResolution.field, handleResolution.message);
  }

  const drafts = await deps.listDrafts({
    userId: auth.user.id,
    xHandle: handleResolution.xHandle,
  });
  const response: ExtensionDraftsResponse = {
    drafts: drafts
      .filter((draft) => draft.artifact && draft.status === "DRAFT")
      .map((draft) => ({
        id: draft.id,
        title: draft.title,
        sourcePrompt: draft.sourcePrompt,
        sourcePlaybook: draft.sourcePlaybook,
        outputShape: draft.outputShape,
        status: "DRAFT",
        reviewStatus: draft.reviewStatus,
        folder: draft.folder,
        artifact: draft.artifact!,
        createdAt: draft.createdAt,
        updatedAt: draft.updatedAt,
      })),
  };

  if (!deps.assertExtensionDraftsResponseShape(response)) {
    return jsonError(500, "response", "Generated invalid extension drafts response.");
  }

  return Response.json(response);
}
