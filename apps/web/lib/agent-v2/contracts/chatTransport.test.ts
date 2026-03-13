import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCreatorChatTransportRequest,
  normalizeClientTurnId,
} from "./chatTransport.ts";

test("buildCreatorChatTransportRequest keeps the stable typed transport fields", () => {
  const request = buildCreatorChatTransportRequest({
    runId: "run_123",
    threadId: "thread_123",
    workspaceHandle: "@ShernanJavier",
    clientTurnId: "  turn_123  ",
    message: "  write a post  ",
    turnSource: "ideation_pick",
    artifactContext: {
      kind: "selected_angle",
      angle: "what's the biggest friction you hit when launching a growth tool?",
      formatHint: "post",
    },
    stream: true,
    provider: "openai",
  });

  assert.deepEqual(request, {
    runId: "run_123",
    threadId: "thread_123",
    workspaceHandle: "shernanjavier",
    clientTurnId: "turn_123",
    message: "write a post",
    turnSource: "ideation_pick",
    artifactContext: {
      kind: "selected_angle",
      angle: "what's the biggest friction you hit when launching a growth tool?",
      formatHint: "post",
    },
    provider: "openai",
    stream: true,
  });
});

test("normalizeClientTurnId trims and bounds client turn ids", () => {
  assert.equal(normalizeClientTurnId("  turn_abc  "), "turn_abc");
  assert.equal(normalizeClientTurnId(""), null);
  assert.equal(normalizeClientTurnId(null), null);
  assert.equal(normalizeClientTurnId("x".repeat(140))?.length, 120);
});
