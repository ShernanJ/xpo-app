import { NextRequest } from "next/server.js";

import { authenticateExtensionRequest } from "../../../../../../lib/extension/auth.ts";
import {
  findContentItemForWorkspace,
  updateContentItemForWorkspace,
} from "../../../../../../lib/content/contentHub.ts";
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
    findDraft: async ({ id: draftId, userId, xHandle }) =>
      findContentItemForWorkspace({
        id: draftId,
        userId,
        xHandle,
      }).then((draft) =>
        draft
          ? {
              id: draft.id,
              status: draft.status,
              publishedTweetId: draft.publishedTweetId,
            }
          : null,
      ),
    publishDraft: async ({ id: draftId, userId, xHandle, publishedTweetId }) =>
      updateContentItemForWorkspace({
        id: draftId,
        userId,
        xHandle,
        requireIndexedMessage: true,
        data: {
          status: "PUBLISHED",
          reviewStatus: "posted",
          postedAt: new Date(),
          ...(publishedTweetId ? { publishedTweetId } : {}),
        },
      }),
  });
}
