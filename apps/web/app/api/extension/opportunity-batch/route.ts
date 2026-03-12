import { NextRequest } from "next/server.js";

import { authenticateExtensionRequest } from "../../../../lib/extension/auth.ts";
import { loadExtensionUserContext } from "../../../../lib/extension/context.ts";
import { logExtensionRouteFailure } from "../../../../lib/extension/http.ts";
import {
  persistRankedOpportunity,
  rankOpportunityBatch,
} from "../../../../lib/extension/opportunityBatch.ts";
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
    rankOpportunityBatch,
    persistRankedOpportunity,
    assertExtensionOpportunityBatchResponseShape,
    recordProductEvent,
    logExtensionRouteFailure,
  });
}
