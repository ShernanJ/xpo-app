import test from "node:test";
import assert from "node:assert/strict";

import {
  getComposerSlashCommands,
  resolveComposerCommandSubmitResult,
} from "./composerCommands.ts";

test("composer slash command registry exposes all supported commands", () => {
  assert.deepEqual(
    getComposerSlashCommands().map((command) => command.id),
    ["thread", "idea", "post", "draft", "reply"],
  );
});

test("thread command normalizes empty and random input into the random-thread prompt", () => {
  const emptyResult = resolveComposerCommandSubmitResult({
    commandId: "thread",
    input: "",
  });
  const randomResult = resolveComposerCommandSubmitResult({
    commandId: "thread",
    input: "  random  ",
  });

  assert.deepEqual(emptyResult, {
    status: "ready",
    request: {
      prompt: "give me a random thread i would use",
      intentOverride: "draft",
      formatPreferenceOverride: "thread",
    },
  });
  assert.deepEqual(randomResult, emptyResult);
});

test("idea and post commands normalize topic-specific requests with the expected intent", () => {
  assert.deepEqual(
    resolveComposerCommandSubmitResult({
      commandId: "idea",
      input: "founder-led sales",
    }),
    {
      status: "ready",
      request: {
        prompt: "give me 3 post ideas about this topic that fit my niche: founder-led sales",
        intentOverride: "ideate",
      },
    },
  );

  assert.deepEqual(
    resolveComposerCommandSubmitResult({
      commandId: "post",
      input: "product positioning",
    }),
    {
      status: "ready",
      request: {
        prompt: "turn this topic into a post in my voice: product positioning",
        intentOverride: "draft",
        formatPreferenceOverride: "shortform",
      },
    },
  );
});

test("post and draft commands are submit aliases", () => {
  const postResult = resolveComposerCommandSubmitResult({
    commandId: "post",
    input: "retention lessons",
  });
  const draftResult = resolveComposerCommandSubmitResult({
    commandId: "draft",
    input: "retention lessons",
  });

  assert.deepEqual(draftResult, postResult);
});

test("reply command blocks empty input, accepts bare status urls, and emits a direct-draft request for pasted text", () => {
  assert.deepEqual(
    resolveComposerCommandSubmitResult({
      commandId: "reply",
      input: "",
    }),
    {
      status: "blocked",
      inlineNotice: "Paste the tweet text or x link you want to reply to.",
    },
  );

  assert.deepEqual(
    resolveComposerCommandSubmitResult({
      commandId: "reply",
      input: "https://x.com/naval/status/123456789",
    }),
    {
      status: "ready",
      request: {
        prompt: "https://x.com/naval/status/123456789",
        artifactContext: {
          kind: "reply_request",
          responseMode: "direct_draft",
        },
        replyContext: {
          sourceText: null,
          sourceUrl: "https://x.com/naval/status/123456789",
          authorHandle: null,
        },
      },
    },
  );

  assert.deepEqual(
    resolveComposerCommandSubmitResult({
      commandId: "reply",
      input: "@naval\n\nSpecific knowledge is becoming the only durable leverage.",
    }),
    {
      status: "ready",
      request: {
        prompt: "@naval\n\nSpecific knowledge is becoming the only durable leverage.",
        artifactContext: {
          kind: "reply_request",
          responseMode: "direct_draft",
        },
        replyContext: {
          sourceText: "@naval\n\nSpecific knowledge is becoming the only durable leverage.",
          sourceUrl: null,
          authorHandle: null,
        },
      },
    },
  );
});
