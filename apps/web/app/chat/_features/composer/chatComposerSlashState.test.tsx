import { expect, test } from "vitest";

import {
  consumeExactLeadingSlashCommand,
  dismissSlashCommandInput,
  filterSlashCommands,
  resolveSlashCommandQuery,
} from "./chatComposerState";

const SLASH_COMMANDS = [
  {
    id: "thread",
    command: "/thread",
    label: "/thread",
    description: "Draft a multi-post X thread from the context you type next.",
  },
] as const;

test("resolveSlashCommandQuery detects only leading slash tokens", () => {
  expect(resolveSlashCommandQuery("/thread build this out")).toBe("thread");
  expect(resolveSlashCommandQuery("   /thread")).toBe("thread");
  expect(resolveSlashCommandQuery("hello /thread")).toBeNull();
});

test("filterSlashCommands matches by command token and description", () => {
  expect(filterSlashCommands({ commands: SLASH_COMMANDS, query: "thr" })).toEqual([
    ...SLASH_COMMANDS,
  ]);
  expect(filterSlashCommands({ commands: SLASH_COMMANDS, query: "multi-post" })).toEqual([
    ...SLASH_COMMANDS,
  ]);
  expect(filterSlashCommands({ commands: SLASH_COMMANDS, query: "missing" })).toEqual([]);
});

test("consumeExactLeadingSlashCommand strips the command and preserves the remainder", () => {
  expect(
    consumeExactLeadingSlashCommand({
      input: " /thread break down my playbook",
      commands: SLASH_COMMANDS,
    }),
  ).toEqual({
    command: SLASH_COMMANDS[0],
    remainder: "break down my playbook",
  });
  expect(
    consumeExactLeadingSlashCommand({
      input: "/unknown test",
      commands: SLASH_COMMANDS,
    }),
  ).toBeNull();
});

test("dismissSlashCommandInput removes the leading slash marker", () => {
  expect(dismissSlashCommandInput("/thread")).toBe("thread");
  expect(dismissSlashCommandInput(" /thread plan")).toBe("thread plan");
  expect(dismissSlashCommandInput("write a post")).toBe("write a post");
});
