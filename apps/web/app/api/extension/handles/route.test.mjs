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
      listExtensionHandleProfilesForUser: async () => [],
    },
  );

  assert.equal(response.status, 401);
});

test("GET /api/extension/handles returns sorted handle profiles with metadata", async () => {
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
      listExtensionHandleProfilesForUser: async (args) => {
        assert.deepEqual(args, {
          userId: "user_1",
          activeXHandle: "standev",
        });
        return [
          {
            xHandle: "zeta",
            displayName: "Zeta",
            avatarUrl: null,
            isVerified: false,
          },
          {
            xHandle: "alpha",
            displayName: "Alpha",
            avatarUrl: "https://pbs.twimg.com/profile_images/alpha.jpg",
            isVerified: true,
          },
          {
            xHandle: "standev",
            displayName: "Stan Dev",
            avatarUrl: "https://pbs.twimg.com/profile_images/stan.jpg",
            isVerified: false,
          },
        ];
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    handles: [
      {
        xHandle: "alpha",
        displayName: "Alpha",
        avatarUrl: "https://pbs.twimg.com/profile_images/alpha.jpg",
        isVerified: true,
      },
      {
        xHandle: "standev",
        displayName: "Stan Dev",
        avatarUrl: "https://pbs.twimg.com/profile_images/stan.jpg",
        isVerified: false,
      },
      {
        xHandle: "zeta",
        displayName: "Zeta",
        avatarUrl: null,
        isVerified: false,
      },
    ],
  });
});
