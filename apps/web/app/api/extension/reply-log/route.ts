import { NextRequest } from "next/server.js";

import { Prisma } from "../../../../lib/generated/prisma/client.ts";
import { prisma } from "../../../../lib/db.ts";
import { authenticateExtensionRequest } from "../../../../lib/extension/auth.ts";
import { logExtensionRouteFailure } from "../../../../lib/extension/http.ts";
import { mergeStoredOpportunityNotes } from "../../../../lib/extension/opportunityBatch.ts";
import { recordProductEvent } from "../../../../lib/productEvents.ts";
import { parseExtensionReplyLogRequest } from "./route.logic.ts";
import { handleExtensionReplyLogPost } from "./route.handler.ts";

export async function POST(request: NextRequest) {
  return handleExtensionReplyLogPost(request, {
    authenticateExtensionRequest,
    parseExtensionReplyLogRequest,
    findReplyOpportunity: async (args) =>
      args.opportunityId
        ? prisma.replyOpportunity.findFirst({
            where: {
              id: args.opportunityId,
              userId: args.userId,
            },
          })
        : prisma.replyOpportunity.findUnique({
            where: {
              userId_tweetId: {
                userId: args.userId,
                tweetId: args.postId,
              },
            },
          }),
    mergeStoredOpportunityNotes: (record, patch) =>
      mergeStoredOpportunityNotes(record, patch as never),
    updateReplyOpportunity: async (args) => {
      await prisma.replyOpportunity.update({
        where: { id: args.id },
        data: args.data as Prisma.ReplyOpportunityUncheckedUpdateInput,
      });
    },
    recordProductEvent,
    logExtensionRouteFailure,
  });
}
