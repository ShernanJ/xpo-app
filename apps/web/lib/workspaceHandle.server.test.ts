import test from "node:test";
import assert from "node:assert/strict";

import { prisma } from "./db.ts";
import { WORKSPACE_HANDLE_HEADER } from "./workspaceHandle.ts";
import {
  listWorkspaceHandlesForUser,
  resolveOwnedThreadForWorkspace,
  resolveWorkspaceHandleForRequest,
} from "./workspaceHandle.server.ts";

function createSession(activeXHandle = "handle_a") {
  return {
    user: {
      id: "user_1",
      activeXHandle,
    },
  };
}

test("listWorkspaceHandlesForUser keeps same-profile handles isolated and normalized", async () => {
  const userHandleDelegate = prisma.userHandle as { findMany: typeof prisma.userHandle.findMany };
  const userDelegate = prisma.user as { findUnique: typeof prisma.user.findUnique };
  const originalUserHandles = userHandleDelegate.findMany;
  const originalUserFindUnique = userDelegate.findUnique;

  userHandleDelegate.findMany = (async () => [
    { xHandle: "@Handle_A" },
    { xHandle: "Handle_B" },
    { xHandle: "@handle_a" },
  ]) as unknown as typeof prisma.userHandle.findMany;
  userDelegate.findUnique = (async () => ({
    activeXHandle: "@Handle_B",
  })) as unknown as typeof prisma.user.findUnique;

  try {
    const handles = await listWorkspaceHandlesForUser({
      userId: "user_1",
      sessionActiveHandle: "@Handle_B",
    });

    assert.deepEqual(handles.sort(), ["handle_a", "handle_b"]);
  } finally {
    userHandleDelegate.findMany = originalUserHandles;
    userDelegate.findUnique = originalUserFindUnique;
  }
});

test("resolveWorkspaceHandleForRequest resolves each attached workspace independently", async () => {
  const userHandleDelegate = prisma.userHandle as { findMany: typeof prisma.userHandle.findMany };
  const userDelegate = prisma.user as { findUnique: typeof prisma.user.findUnique };
  const originalUserHandles = userHandleDelegate.findMany;
  const originalUserFindUnique = userDelegate.findUnique;

  userHandleDelegate.findMany = (async () => [
    { xHandle: "handle_a" },
    { xHandle: "handle_b" },
  ]) as unknown as typeof prisma.userHandle.findMany;
  userDelegate.findUnique = (async () => ({
    activeXHandle: "handle_a",
  })) as unknown as typeof prisma.user.findUnique;

  try {
    const handleA = await resolveWorkspaceHandleForRequest({
      request: new Request("https://example.com/chat?xHandle=handle_a"),
      session: createSession(),
    });
    const handleB = await resolveWorkspaceHandleForRequest({
      request: new Request("https://example.com/chat?xHandle=handle_b"),
      session: createSession(),
    });

    assert.equal(handleA.ok, true);
    assert.equal(handleB.ok, true);
    assert.equal(handleA.ok && handleA.xHandle, "handle_a");
    assert.equal(handleB.ok && handleB.xHandle, "handle_b");
  } finally {
    userHandleDelegate.findMany = originalUserHandles;
    userDelegate.findUnique = originalUserFindUnique;
  }
});

test("resolveOwnedThreadForWorkspace rejects a thread opened under a different handle", async () => {
  const chatThreadDelegate = prisma.chatThread as { findUnique: typeof prisma.chatThread.findUnique };
  const originalFindUnique = chatThreadDelegate.findUnique;

  chatThreadDelegate.findUnique = (async () => ({
    id: "thread_1",
    userId: "user_1",
    xHandle: "handle_a",
  })) as unknown as typeof prisma.chatThread.findUnique;

  try {
    const result = await resolveOwnedThreadForWorkspace({
      threadId: "thread_1",
      userId: "user_1",
      xHandle: "handle_b",
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.response.status, 409);
    }
  } finally {
    chatThreadDelegate.findUnique = originalFindUnique;
  }
});

test("resolveWorkspaceHandleForRequest does not fall back across handles when a thread is already scoped", async () => {
  const userHandleDelegate = prisma.userHandle as { findMany: typeof prisma.userHandle.findMany };
  const userDelegate = prisma.user as { findUnique: typeof prisma.user.findUnique };
  const originalUserHandles = userHandleDelegate.findMany;
  const originalUserFindUnique = userDelegate.findUnique;

  userHandleDelegate.findMany = (async () => [
    { xHandle: "handle_a" },
    { xHandle: "handle_b" },
  ]) as unknown as typeof prisma.userHandle.findMany;
  userDelegate.findUnique = (async () => ({
    activeXHandle: "handle_a",
  })) as unknown as typeof prisma.user.findUnique;

  try {
    const result = await resolveWorkspaceHandleForRequest({
      request: new Request("https://example.com/chat", {
        headers: {
          [WORKSPACE_HANDLE_HEADER]: "handle_b",
        },
      }),
      session: createSession("handle_a"),
      bodyHandle: "handle_a",
    });

    assert.equal(result.ok, true);
    assert.equal(result.ok && result.xHandle, "handle_b");
  } finally {
    userHandleDelegate.findMany = originalUserHandles;
    userDelegate.findUnique = originalUserFindUnique;
  }
});

test("pending handles are not treated as attached workspace handles", async () => {
  const userHandleDelegate = prisma.userHandle as { findMany: typeof prisma.userHandle.findMany };
  const userDelegate = prisma.user as { findUnique: typeof prisma.user.findUnique };
  const originalUserHandles = userHandleDelegate.findMany;
  const originalUserFindUnique = userDelegate.findUnique;

  userHandleDelegate.findMany = (async () => [{ xHandle: "handle_a" }]) as unknown as typeof prisma.userHandle.findMany;
  userDelegate.findUnique = (async () => ({
    activeXHandle: "handle_a",
  })) as unknown as typeof prisma.user.findUnique;

  try {
    const result = await resolveWorkspaceHandleForRequest({
      request: new Request("https://example.com/chat?xHandle=handle_pending"),
      session: createSession("handle_a"),
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.response.status, 404);
    }
  } finally {
    userHandleDelegate.findMany = originalUserHandles;
    userDelegate.findUnique = originalUserFindUnique;
  }
});
