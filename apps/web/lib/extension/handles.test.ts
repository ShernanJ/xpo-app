import test from "node:test";
import assert from "node:assert/strict";

import { prisma } from "../db.ts";
import { WORKSPACE_HANDLE_HEADER } from "../workspaceHandle.ts";
import { resolveExtensionHandleForRequest } from "./handles.ts";

test("resolveExtensionHandleForRequest returns 400 when no explicit handle is provided", async () => {
  const result = await resolveExtensionHandleForRequest({
    request: new Request("https://example.com/api/extension/reply-log"),
    userId: "user_1",
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
    assert.equal(result.field, "xHandle");
  }
});

test("resolveExtensionHandleForRequest rejects handles that are not attached to the user", async () => {
  const userHandleDelegate = prisma.userHandle as { findMany: typeof prisma.userHandle.findMany };
  const userDelegate = prisma.user as { findUnique: typeof prisma.user.findUnique };
  const originalUserHandles = userHandleDelegate.findMany;
  const originalUserFindUnique = userDelegate.findUnique;

  userHandleDelegate.findMany = (async () => [{ xHandle: "handle_a" }]) as unknown as typeof prisma.userHandle.findMany;
  userDelegate.findUnique = (async () => ({
    activeXHandle: "handle_a",
  })) as unknown as typeof prisma.user.findUnique;

  try {
    const result = await resolveExtensionHandleForRequest({
      request: new Request("https://example.com/api/extension/reply-log", {
        headers: {
          [WORKSPACE_HANDLE_HEADER]: "handle_b",
        },
      }),
      userId: "user_1",
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 404);
      assert.equal(result.message, "That X handle is not attached to this Xpo profile.");
    }
  } finally {
    userHandleDelegate.findMany = originalUserHandles;
    userDelegate.findUnique = originalUserFindUnique;
  }
});

test("resolveExtensionHandleForRequest accepts attached handles from the extension header", async () => {
  const userHandleDelegate = prisma.userHandle as { findMany: typeof prisma.userHandle.findMany };
  const userDelegate = prisma.user as { findUnique: typeof prisma.user.findUnique };
  const originalUserHandles = userHandleDelegate.findMany;
  const originalUserFindUnique = userDelegate.findUnique;

  userHandleDelegate.findMany = (async () => [
    { xHandle: "handle_a" },
    { xHandle: "@handle_b" },
  ]) as unknown as typeof prisma.userHandle.findMany;
  userDelegate.findUnique = (async () => ({
    activeXHandle: "handle_c",
  })) as unknown as typeof prisma.user.findUnique;

  try {
    const result = await resolveExtensionHandleForRequest({
      request: new Request("https://example.com/api/extension/reply-log", {
        headers: {
          [WORKSPACE_HANDLE_HEADER]: "@Handle_B",
        },
      }),
      userId: "user_1",
      activeXHandle: "handle_c",
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.xHandle, "handle_b");
      assert.deepEqual(result.attachedHandles.sort(), ["handle_a", "handle_b"]);
    }
  } finally {
    userHandleDelegate.findMany = originalUserHandles;
    userDelegate.findUnique = originalUserFindUnique;
  }
});
