import type { ExtensionDraftsResponse } from "../../../../lib/extension/types.ts";
import { WORKSPACE_HANDLE_HEADER } from "../../../../lib/workspaceHandle.ts";

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
    {
      status,
      headers: {
        "Cache-Control": "private, no-store",
        Vary: `Authorization, ${WORKSPACE_HANDLE_HEADER}`,
      },
    },
  );
}

function asNonEmptyString(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeDraftFolder(
  folder: ExtensionDraftRecord["folder"],
) {
  if (!folder) {
    return null;
  }

  const id = asNonEmptyString(folder.id);
  const name = asNonEmptyString(folder.name);
  const createdAt = asNonEmptyString(folder.createdAt);
  if (!id || !name || !createdAt) {
    return null;
  }

  return {
    id,
    name,
    color: asNonEmptyString(folder.color) ?? null,
    createdAt,
  };
}

function normalizeDraftArtifact(
  draft: ExtensionDraftRecord,
) {
  const artifact = draft.artifact;
  if (!artifact) {
    return null;
  }

  const normalizedPosts = artifact.posts
    .map((post, index) => {
      const content = asNonEmptyString(post.content);
      if (!content) {
        return null;
      }

      const maxCharacterLimit =
        Number.isFinite(post.maxCharacterLimit) && post.maxCharacterLimit > 0
          ? post.maxCharacterLimit
          : 280;
      const weightedCharacterCount =
        Number.isFinite(post.weightedCharacterCount) && post.weightedCharacterCount >= 0
          ? post.weightedCharacterCount
          : content.length;

      return {
        id:
          asNonEmptyString(post.id) ??
          `${asNonEmptyString(artifact.id) ?? draft.id}-post-${index + 1}`,
        content,
        weightedCharacterCount,
        maxCharacterLimit,
        isWithinXLimit:
          typeof post.isWithinXLimit === "boolean"
            ? post.isWithinXLimit
            : weightedCharacterCount <= maxCharacterLimit,
      };
    })
    .filter((post): post is NonNullable<typeof post> => Boolean(post))
    .slice(0, 12);

  const content =
    asNonEmptyString(artifact.content) ??
    (normalizedPosts.map((post) => post.content).join("\n\n") || null);

  if (!content) {
    return null;
  }

  const posts =
    normalizedPosts.length > 0
      ? normalizedPosts
      : [
          {
            id: `${asNonEmptyString(artifact.id) ?? draft.id}-post-1`,
            content,
            weightedCharacterCount: content.length,
            maxCharacterLimit: 280,
            isWithinXLimit: content.length <= 280,
          },
        ];

  return {
    id: asNonEmptyString(artifact.id) ?? `${draft.id}-artifact`,
    title:
      asNonEmptyString(artifact.title) ??
      asNonEmptyString(draft.title) ??
      "Workspace post",
    kind:
      asNonEmptyString(artifact.kind) ??
      asNonEmptyString(draft.outputShape) ??
      "short_form_post",
    content,
    posts,
  };
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
  const normalizedDrafts = drafts
    .map((draft) => {
      const artifact = normalizeDraftArtifact(draft);
      if (!artifact) {
        return null;
      }

      return {
        id: draft.id,
        title: asNonEmptyString(draft.title) ?? artifact.title,
        sourcePrompt:
          asNonEmptyString(draft.sourcePrompt) ??
          artifact.content ??
          asNonEmptyString(draft.title) ??
          "Workspace post",
        sourcePlaybook: asNonEmptyString(draft.sourcePlaybook) ?? null,
        outputShape:
          asNonEmptyString(draft.outputShape) ??
          artifact.kind,
        status: "DRAFT" as const,
        reviewStatus: asNonEmptyString(draft.reviewStatus) ?? "pending",
        folder: normalizeDraftFolder(draft.folder),
        artifact,
        createdAt: draft.createdAt,
        updatedAt: draft.updatedAt,
      };
    })
    .filter((draft): draft is NonNullable<typeof draft> => Boolean(draft));

  const response: ExtensionDraftsResponse = {
    drafts: normalizedDrafts,
  };

  if (!deps.assertExtensionDraftsResponseShape(response)) {
    return jsonError(500, "response", "Generated invalid extension drafts response.");
  }

  return Response.json(response, {
    headers: {
      "Cache-Control": "private, no-store",
      Vary: `Authorization, ${WORKSPACE_HANDLE_HEADER}`,
    },
  });
}
