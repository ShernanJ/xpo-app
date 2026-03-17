import { NextRequest } from "next/server.js";

import { authenticateExtensionRequest } from "../../../../../../lib/extension/auth.ts";
import {
  findContentItemForWorkspace,
  updateContentItemById,
} from "../../../../../../lib/content/contentHub.ts";
import { parseExtensionDraftPublishRequest } from "../../route.logic.ts";
import { handleExtensionDraftPublishPost } from "./route.handler.ts";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return handleExtensionDraftPublishPost(request, { id }, {
    authenticateExtensionRequest,
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
              publishedTweetId: draft.publishedTweetId,
            }
          : null,
      ),
    publishDraft: async ({ id: draftId, publishedTweetId }) => {
      await updateContentItemById({
        id: draftId,
        data: {
          status: "PUBLISHED",
          reviewStatus: "posted",
          postedAt: new Date(),
          ...(publishedTweetId ? { publishedTweetId } : {}),
        },
      });
    },
  });
}
