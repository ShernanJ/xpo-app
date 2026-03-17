import test from "node:test";
import assert from "node:assert/strict";

import {
  consumeExactLeadingSlashCommand,
  dismissSlashCommandInput,
  filterSlashCommands,
  prepareComposerSubmission,
  resolveSlashCommandQuery,
  resolveComposerQuickReplyUpdate,
} from "./chatComposerState.ts";

test("resolveComposerQuickReplyUpdate ignores quick replies while chat is locked", () => {
  assert.deepEqual(
    resolveComposerQuickReplyUpdate({
      quickReply: {
        kind: "example_reply",
        value: "write a post",
        label: "Write a post",
      },
      isMainChatLocked: true,
    }),
    {
      shouldApply: false,
    },
  );
});

test("resolveComposerQuickReplyUpdate maps content focus replies into focus-prefilled composer text", () => {
  assert.deepEqual(
    resolveComposerQuickReplyUpdate({
      quickReply: {
        kind: "content_focus",
        value: "build_in_public",
        label: "Build In Public",
      },
      isMainChatLocked: false,
    }),
    {
      shouldApply: true,
      nextDraftInput: "Build In Public",
      nextActiveContentFocus: "build_in_public",
      shouldClearError: true,
    },
  );
});

test("resolveComposerQuickReplyUpdate carries suggested focus for non-focus quick replies", () => {
  assert.deepEqual(
    resolveComposerQuickReplyUpdate({
      quickReply: {
        kind: "example_reply",
        value: "draft 4 posts from what you know about me",
        label: "Draft 4 posts",
        suggestedFocus: "operator_lessons",
      },
      isMainChatLocked: false,
    }),
    {
      shouldApply: true,
      nextDraftInput: "Draft 4 posts",
      nextActiveContentFocus: "operator_lessons",
      shouldClearError: true,
    },
  );
});

test("prepareComposerSubmission returns ready state with hero exit for a new conversation", () => {
  assert.deepEqual(
    prepareComposerSubmission({
      prompt: "  write a post about shipping faster  ",
      hasContext: true,
      hasContract: true,
      hasStrategyInputs: true,
      hasToneInputs: true,
      isMainChatLocked: false,
      activeThreadId: null,
      messagesLength: 0,
    }),
    {
      status: "ready",
      trimmedPrompt: "write a post about shipping faster",
      shouldAnimateHeroExit: true,
    },
  );
});

test("prepareComposerSubmission blocks when planner inputs are still loading", () => {
  assert.deepEqual(
    prepareComposerSubmission({
      prompt: "write a post",
      hasContext: true,
      hasContract: true,
      hasStrategyInputs: false,
      hasToneInputs: true,
      isMainChatLocked: false,
      activeThreadId: "thread-1",
      messagesLength: 2,
    }),
    {
      status: "blocked",
      trimmedPrompt: "write a post",
      errorMessage: "The planning model is still loading.",
      shouldAnimateHeroExit: false,
    },
  );
});

test("prepareComposerSubmission skips blank or locked prompts", () => {
  assert.deepEqual(
    prepareComposerSubmission({
      prompt: "   ",
      hasContext: true,
      hasContract: true,
      hasStrategyInputs: true,
      hasToneInputs: true,
      isMainChatLocked: false,
      activeThreadId: null,
      messagesLength: 0,
    }),
    {
      status: "skip",
      trimmedPrompt: "",
      shouldAnimateHeroExit: false,
    },
  );

  assert.deepEqual(
    prepareComposerSubmission({
      prompt: "write a post",
      hasContext: true,
      hasContract: true,
      hasStrategyInputs: true,
      hasToneInputs: true,
      isMainChatLocked: true,
      activeThreadId: null,
      messagesLength: 0,
    }),
    {
      status: "skip",
      trimmedPrompt: "write a post",
      shouldAnimateHeroExit: false,
    },
  );
});

test("resolveSlashCommandQuery detects only leading slash tokens", () => {
  assert.equal(resolveSlashCommandQuery("/thread build this out"), "thread");
  assert.equal(resolveSlashCommandQuery("   /thread"), "thread");
  assert.equal(resolveSlashCommandQuery("hello /thread"), null);
});

test("filterSlashCommands matches by command token and description", () => {
  const commands = [
    {
      id: "thread",
      command: "/thread",
      label: "/thread",
      description: "Draft a multi-post X thread from the context you type next.",
    },
  ] as const;

  assert.deepEqual(filterSlashCommands({ commands, query: "thr" }), [...commands]);
  assert.deepEqual(filterSlashCommands({ commands, query: "multi-post" }), [...commands]);
  assert.deepEqual(filterSlashCommands({ commands, query: "missing" }), []);
});

test("consumeExactLeadingSlashCommand strips the command and preserves the remainder", () => {
  const commands = [
    {
      id: "thread",
      command: "/thread",
      label: "/thread",
      description: "Draft a multi-post X thread from the context you type next.",
    },
  ] as const;

  assert.deepEqual(
    consumeExactLeadingSlashCommand({
      input: " /thread break down my playbook",
      commands,
    }),
    {
      command: commands[0],
      remainder: "break down my playbook",
    },
  );
  assert.equal(
    consumeExactLeadingSlashCommand({
      input: "/unknown test",
      commands,
    }),
    null,
  );
});

test("dismissSlashCommandInput removes the leading slash marker", () => {
  assert.equal(dismissSlashCommandInput("/thread"), "thread");
  assert.equal(dismissSlashCommandInput(" /thread plan"), "thread plan");
  assert.equal(dismissSlashCommandInput("write a post"), "write a post");
});
