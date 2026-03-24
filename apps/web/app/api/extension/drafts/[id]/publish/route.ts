import { NextRequest } from "next/server.js";

import { authenticateExtensionRequest } from "../../../../../../lib/extension/auth.ts";
import { finalizeDraftPublishForWorkspace } from "../../../../../../lib/content/publishFinalization.ts";
import { resolveExtensionHandleForRequest } from "../../../../../../lib/extension/handles.ts";
import { parseExtensionDraftPublishRequest } from "../../route.logic.ts";
import { handleExtensionDraftPublishPost } from "./route.handler.ts";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return handleExtensionDraftPublishPost(request, { id }, {
    authenticateExtensionRequest,
    resolveExtensionHandleForRequest,
    parseExtensionDraftPublishRequest,
    finalizeDraftPublish: async ({ id: draftId, userId, xHandle, finalPublishedText, publishedTweetId }) =>
      finalizeDraftPublishForWorkspace({
        id: draftId,
        userId,
        xHandle,
        finalPublishedText,
        publishedTweetId,
      }),
  });
}
