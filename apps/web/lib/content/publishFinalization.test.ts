import test from "node:test";
import assert from "node:assert/strict";

import {
  finalizeDraftPublishForWorkspace,
  parseDraftPublishRequest,
} from "./publishFinalization.ts";
import { buildDraftArtifact } from "../onboarding/shared/draftArtifacts.ts";

function buildDraftRecord(content: string) {
  return {
    id: "draft_1",
    status: "DRAFT",
    artifact: buildDraftArtifact({
      id: "artifact_1",
      title: "Draft",
      kind: "short_form_post",
      content,
      supportAsset: null,
      noveltyNotes: [],
    }),
  };
}

test("parseDraftPublishRequest preserves the raw finalPublishedText while validating trimmed content", () => {
  const parsed = parseDraftPublishRequest({
    finalPublishedText: "  keep surrounding whitespace  ",
    publishedTweetId: "1901",
  });

  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }

  assert.equal(parsed.data.finalPublishedText, "  keep surrounding whitespace  ");
});

test("finalizeDraftPublishForWorkspace marks zero-delta drafts as analyzed while storing the raw text verbatim", async () => {
  const calls: Array<{ where: unknown; data: unknown }> = [];

  const result = await finalizeDraftPublishForWorkspace(
    {
      id: "draft_1",
      userId: "user_1",
      xHandle: "stan",
      finalPublishedText: "  Same draft body  ",
      publishedTweetId: "190123",
    },
    {
      client: {
        draftCandidate: {
          async findFirst() {
            return buildDraftRecord("Same draft body");
          },
          async updateMany(args) {
            calls.push(args);
            return { count: 1 };
          },
        },
      },
    },
  );

  assert.deepEqual(result.ok, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]?.where, {
    id: "draft_1",
    userId: "user_1",
    xHandle: "stan",
    status: "DRAFT",
  });
  assert.equal((calls[0]?.data as { publishedText: string }).publishedText, "  Same draft body  ");
  assert.equal((calls[0]?.data as { deltaAnalyzed: boolean }).deltaAnalyzed, true);
});

test("finalizeDraftPublishForWorkspace leaves deltaAnalyzed false when the published text differs", async () => {
  let updatedData: { deltaAnalyzed?: boolean } | null = null;

  const result = await finalizeDraftPublishForWorkspace(
    {
      id: "draft_1",
      userId: "user_1",
      xHandle: "stan",
      finalPublishedText: "Changed draft body",
    },
    {
      client: {
        draftCandidate: {
          async findFirst() {
            return buildDraftRecord("Original draft body");
          },
          async updateMany(args) {
            updatedData = args.data;
            return { count: 1 };
          },
        },
      },
    },
  );

  assert.deepEqual(result.ok, true);
  assert.equal(updatedData?.deltaAnalyzed, false);
});
