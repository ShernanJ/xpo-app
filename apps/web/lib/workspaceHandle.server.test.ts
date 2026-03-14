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
  const voiceProfileDelegate = prisma.voiceProfile as { findMany: typeof prisma.voiceProfile.findMany };
  const onboardingRunDelegate = prisma.onboardingRun as { findMany: typeof prisma.onboardingRun.findMany };
  const chatThreadDelegate = prisma.chatThread as { findMany: typeof prisma.chatThread.findMany };
  const originalVoiceProfiles = voiceProfileDelegate.findMany;
  const originalOnboardingRuns = onboardingRunDelegate.findMany;
  const originalChatThreads = chatThreadDelegate.findMany;

  voiceProfileDelegate.findMany = (async () => [{ xHandle: "@Handle_A" }, { xHandle: "Handle_B" }]) as typeof prisma.voiceProfile.findMany;
  onboardingRunDelegate.findMany = (async () => [
    { input: { account: "@Handle_B" } },
    { input: { account: "@Handle_C" } },
  ]) as typeof prisma.onboardingRun.findMany;
  chatThreadDelegate.findMany = (async () => [{ xHandle: "handle_a" }, { xHandle: "handle_b" }]) as typeof prisma.chatThread.findMany;

  try {
    const handles = await listWorkspaceHandlesForUser({
      userId: "user_1",
      sessionActiveHandle: "@Handle_B",
    });

    assert.deepEqual(handles.sort(), ["handle_a", "handle_b", "handle_c"]);
  } finally {
    voiceProfileDelegate.findMany = originalVoiceProfiles;
    onboardingRunDelegate.findMany = originalOnboardingRuns;
    chatThreadDelegate.findMany = originalChatThreads;
  }
});

test("resolveWorkspaceHandleForRequest resolves each attached workspace independently", async () => {
  const voiceProfileDelegate = prisma.voiceProfile as { findMany: typeof prisma.voiceProfile.findMany };
  const onboardingRunDelegate = prisma.onboardingRun as { findMany: typeof prisma.onboardingRun.findMany };
  const chatThreadDelegate = prisma.chatThread as { findMany: typeof prisma.chatThread.findMany };
  const originalVoiceProfiles = voiceProfileDelegate.findMany;
  const originalOnboardingRuns = onboardingRunDelegate.findMany;
  const originalChatThreads = chatThreadDelegate.findMany;

  voiceProfileDelegate.findMany = (async () => [{ xHandle: "handle_a" }, { xHandle: "handle_b" }]) as typeof prisma.voiceProfile.findMany;
  onboardingRunDelegate.findMany = (async () => []) as typeof prisma.onboardingRun.findMany;
  chatThreadDelegate.findMany = (async () => []) as typeof prisma.chatThread.findMany;

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
    voiceProfileDelegate.findMany = originalVoiceProfiles;
    onboardingRunDelegate.findMany = originalOnboardingRuns;
    chatThreadDelegate.findMany = originalChatThreads;
  }
});

test("resolveOwnedThreadForWorkspace rejects a thread opened under a different handle", async () => {
  const chatThreadDelegate = prisma.chatThread as { findUnique: typeof prisma.chatThread.findUnique };
  const originalFindUnique = chatThreadDelegate.findUnique;

  chatThreadDelegate.findUnique = (async () => ({
    id: "thread_1",
    userId: "user_1",
    xHandle: "handle_a",
  })) as typeof prisma.chatThread.findUnique;

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
  const voiceProfileDelegate = prisma.voiceProfile as { findMany: typeof prisma.voiceProfile.findMany };
  const onboardingRunDelegate = prisma.onboardingRun as { findMany: typeof prisma.onboardingRun.findMany };
  const chatThreadDelegate = prisma.chatThread as { findMany: typeof prisma.chatThread.findMany };
  const originalVoiceProfiles = voiceProfileDelegate.findMany;
  const originalOnboardingRuns = onboardingRunDelegate.findMany;
  const originalChatThreads = chatThreadDelegate.findMany;

  voiceProfileDelegate.findMany = (async () => [{ xHandle: "handle_a" }, { xHandle: "handle_b" }]) as typeof prisma.voiceProfile.findMany;
  onboardingRunDelegate.findMany = (async () => []) as typeof prisma.onboardingRun.findMany;
  chatThreadDelegate.findMany = (async () => []) as typeof prisma.chatThread.findMany;

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
    voiceProfileDelegate.findMany = originalVoiceProfiles;
    onboardingRunDelegate.findMany = originalOnboardingRuns;
    chatThreadDelegate.findMany = originalChatThreads;
  }
});
