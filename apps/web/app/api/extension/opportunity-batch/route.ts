import { NextRequest } from "next/server.js";

import { authenticateExtensionRequest } from "../../../../lib/extension/auth.ts";
import { loadExtensionUserContext } from "../../../../lib/extension/context.ts";
import { logExtensionRouteFailure } from "../../../../lib/extension/http.ts";
import { scoreOpportunityBatchWithGroq } from "../../../../lib/extension/opportunityBatchGroq.ts";
import { getReplyInsightsForUser } from "../../../../lib/extension/replyOpportunities.ts";
import { recordProductEvent } from "../../../../lib/productEvents.ts";
import {
  assertExtensionOpportunityBatchResponseShape,
  parseExtensionOpportunityBatchRequest,
} from "./route.logic.ts";
import { handleExtensionOpportunityBatchPost } from "./route.handler.ts";

export async function POST(request: NextRequest) {
  return handleExtensionOpportunityBatchPost(request, {
    authenticateExtensionRequest,
    parseExtensionOpportunityBatchRequest,
    loadExtensionUserContext,
    getReplyInsightsForUser,
    scoreOpportunityBatch: scoreOpportunityBatchWithGroq,
    assertExtensionOpportunityBatchResponseShape,
    recordProductEvent,
    logExtensionRouteFailure,
  });
}
