import { NextRequest } from "next/server.js";

import { authenticateExtensionRequest } from "../../../../lib/extension/auth.ts";
import {
  listContentItemsForWorkspace,
  serializeContentItem,
} from "../../../../lib/content/contentHub.ts";
import { assertExtensionDraftsResponseShape } from "./route.logic.ts";
import { handleExtensionDraftsGet } from "./route.handler.ts";

export async function GET(request: NextRequest) {
  return handleExtensionDraftsGet(request, {
    authenticateExtensionRequest,
    listDrafts: async ({ userId, xHandle }) =>
      (
        await listContentItemsForWorkspace({
          userId,
          xHandle,
          status: "DRAFT",
          take: 100,
        })
      ).map((draft) => {
        const serialized = serializeContentItem(draft);
        return {
          id: serialized.id,
          title: serialized.title,
          sourcePrompt: serialized.sourcePrompt,
          sourcePlaybook: serialized.sourcePlaybook,
          outputShape: serialized.outputShape,
          status: serialized.status,
          reviewStatus: serialized.reviewStatus,
          folder: serialized.folder,
          artifact: serialized.artifact
            ? {
                id: serialized.artifact.id,
                title: serialized.artifact.title,
                kind: serialized.artifact.kind,
                content: serialized.artifact.content,
                posts: serialized.artifact.posts.map((post) => ({
                  id: post.id,
                  content: post.content,
                  weightedCharacterCount: post.weightedCharacterCount,
                  maxCharacterLimit: post.maxCharacterLimit,
                  isWithinXLimit: post.isWithinXLimit,
                })),
              }
            : null,
          createdAt: serialized.createdAt,
          updatedAt: serialized.updatedAt,
        };
      }),
    assertExtensionDraftsResponseShape,
  });
}
