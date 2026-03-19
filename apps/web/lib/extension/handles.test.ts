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
  const voiceProfileDelegate = prisma.voiceProfile as { findMany: typeof prisma.voiceProfile.findMany };
  const onboardingRunDelegate = prisma.onboardingRun as { findMany: typeof prisma.onboardingRun.findMany };
  const chatThreadDelegate = prisma.chatThread as { findMany: typeof prisma.chatThread.findMany };
  const originalVoiceProfiles = voiceProfileDelegate.findMany;
  const originalOnboardingRuns = onboardingRunDelegate.findMany;
  const originalChatThreads = chatThreadDelegate.findMany;

  voiceProfileDelegate.findMany = (async () => [{ xHandle: "handle_a" }]) as typeof prisma.voiceProfile.findMany;
  onboardingRunDelegate.findMany = (async () => []) as typeof prisma.onboardingRun.findMany;
  chatThreadDelegate.findMany = (async () => []) as typeof prisma.chatThread.findMany;

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
    voiceProfileDelegate.findMany = originalVoiceProfiles;
    onboardingRunDelegate.findMany = originalOnboardingRuns;
    chatThreadDelegate.findMany = originalChatThreads;
  }
});

test("resolveExtensionHandleForRequest accepts attached handles from the extension header", async () => {
  const voiceProfileDelegate = prisma.voiceProfile as { findMany: typeof prisma.voiceProfile.findMany };
  const onboardingRunDelegate = prisma.onboardingRun as { findMany: typeof prisma.onboardingRun.findMany };
  const chatThreadDelegate = prisma.chatThread as { findMany: typeof prisma.chatThread.findMany };
  const originalVoiceProfiles = voiceProfileDelegate.findMany;
  const originalOnboardingRuns = onboardingRunDelegate.findMany;
  const originalChatThreads = chatThreadDelegate.findMany;

  voiceProfileDelegate.findMany = (async () => [{ xHandle: "handle_a" }]) as typeof prisma.voiceProfile.findMany;
  onboardingRunDelegate.findMany = (async () => [{ input: { account: "@handle_b" } }]) as typeof prisma.onboardingRun.findMany;
  chatThreadDelegate.findMany = (async () => []) as typeof prisma.chatThread.findMany;

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
      assert.deepEqual(result.attachedHandles.sort(), [
        "handle_a",
        "handle_b",
        "handle_c",
      ]);
    }
  } finally {
    voiceProfileDelegate.findMany = originalVoiceProfiles;
    onboardingRunDelegate.findMany = originalOnboardingRuns;
    chatThreadDelegate.findMany = originalChatThreads;
  }
});
