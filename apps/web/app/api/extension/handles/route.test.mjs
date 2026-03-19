import test from "node:test";
import assert from "node:assert/strict";

import { handleExtensionHandlesGet } from "./route.handler.ts";

test("GET /api/extension/handles returns 401 when auth fails", async () => {
  const response = await handleExtensionHandlesGet(
    new Request("http://localhost/api/extension/handles", {
      method: "GET",
      headers: {
        authorization: "Bearer revoked_token",
      },
    }),
    {
      authenticateExtensionRequest: async () => null,
      listExtensionHandlesForUser: async () => [],
    },
  );

  assert.equal(response.status, 401);
});

test("GET /api/extension/handles returns normalized sorted attached handles", async () => {
  const response = await handleExtensionHandlesGet(
    new Request("http://localhost/api/extension/handles", {
      method: "GET",
      headers: {
        authorization: "Bearer token_123",
      },
    }),
    {
      authenticateExtensionRequest: async () => ({
        user: {
          id: "user_1",
          activeXHandle: "standev",
        },
      }),
      listExtensionHandlesForUser: async (args) => {
        assert.deepEqual(args, {
          userId: "user_1",
          activeXHandle: "standev",
        });
        return ["zeta", "alpha", "standev"];
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    handles: ["alpha", "standev", "zeta"],
  });
});
