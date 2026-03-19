import { NextRequest } from "next/server.js";

import { authenticateExtensionRequest } from "../../../../lib/extension/auth.ts";
import { listExtensionHandleProfilesForUser } from "../../../../lib/extension/handles.ts";
import { handleExtensionHandlesGet } from "./route.handler.ts";

export async function GET(request: NextRequest) {
  return handleExtensionHandlesGet(request, {
    authenticateExtensionRequest,
    listExtensionHandleProfilesForUser,
  });
}
