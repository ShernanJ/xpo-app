import test from "node:test";
import assert from "node:assert/strict";

import { syncIndexedContentFromChatMessage } from "./contentHub.ts";
import { buildDraftArtifact } from "../onboarding/shared/draftArtifacts.ts";

function buildMessageData(args: { retrievedAnchorIds?: string[] }) {
  const artifact = buildDraftArtifact({
    id: "artifact-1",
    title: "Draft",
    kind: "short_form_post",
    content: "Draft body",
    supportAsset: null,
    noveltyNotes: [],
    ...(args.retrievedAnchorIds?.length
      ? { retrievedAnchorIds: args.retrievedAnchorIds }
      : {}),
  });

  return {
    outputShape: "short_form_post",
    draftArtifacts: [artifact],
  };
}

test("syncIndexedContentFromChatMessage writes retrieved anchor ids from the current draft artifact", async () => {
  let createdData: any = null;

  await syncIndexedContentFromChatMessage({
    messageId: "message-1",
    threadId: "thread-1",
    userId: "user-1",
    xHandle: "stan",
    threadTitle: "Draft thread",
    data: buildMessageData({ retrievedAnchorIds: ["anchor-1", "anchor-2"] }),
    sourcePrompt: "write the draft",
    sourcePlaybook: "chat_thread",
    client: {
      draftCandidate: {
        async findFirst() {
          return null;
        },
        async create(args: any) {
          createdData = args.data;
          return args.data;
        },
        async update() {
          throw new Error("update should not be called");
        },
      },
    } as any,
  });

  assert.deepEqual(createdData?.retrievedAnchorIds, ["anchor-1", "anchor-2"]);
});

test("syncIndexedContentFromChatMessage preserves existing retrieved anchor ids when the updated message has none", async () => {
  let updatedData: any = null;

  await syncIndexedContentFromChatMessage({
    messageId: "message-2",
    threadId: "thread-2",
    userId: "user-2",
    xHandle: "stan",
    threadTitle: "Draft thread",
    data: buildMessageData({}),
    sourcePrompt: "write the draft",
    sourcePlaybook: "chat_thread",
    client: {
      draftCandidate: {
        async findFirst() {
          return {
            id: "candidate-1",
            userId: "user-2",
            xHandle: "stan",
            threadId: "thread-2",
            messageId: "message-2",
            runId: null,
            title: "Existing title",
            sourcePrompt: "existing source prompt",
            sourcePlaybook: "chat_thread",
            outputShape: "short_form_post",
            reviewStatus: "pending",
            status: "DRAFT",
            folderId: null,
            publishedTweetId: null,
            draftVersionId: null,
            basedOnVersionId: null,
            revisionChainId: null,
            isLatestVersion: true,
            artifact: null,
            voiceTarget: null,
            noveltyNotes: [],
            retrievedAnchorIds: ["anchor-existing"],
            rejectionReason: null,
            approvedAt: null,
            editedAt: null,
            postedAt: null,
            observedAt: null,
            observedMetrics: null,
            createdAt: new Date("2026-03-21T12:00:00.000Z"),
            updatedAt: new Date("2026-03-21T12:00:00.000Z"),
          };
        },
        async create() {
          throw new Error("create should not be called");
        },
        async update(args: any) {
          updatedData = args.data;
          return args.data;
        },
      },
    } as any,
  });

  assert.deepEqual(updatedData?.retrievedAnchorIds, ["anchor-existing"]);
});
