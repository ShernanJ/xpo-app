import type { ExtensionDraftsResponse } from "../../../../lib/extension/types.ts";

interface ExtensionAuthResult {
  user: {
    id: string;
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

function normalizeHandle(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/^@+/, "").toLowerCase() || "";
  return normalized || null;
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

  const xHandle = normalizeHandle(requestedHandle);
  if (!xHandle) {
    return jsonError(400, "handle", "A handle query parameter is required.");
  }

  const drafts = await deps.listDrafts({
    userId: auth.user.id,
    xHandle,
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
