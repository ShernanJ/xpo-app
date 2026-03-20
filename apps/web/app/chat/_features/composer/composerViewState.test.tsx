import { expect, test } from "vitest";

import type { CreatorAgentContext } from "@/lib/onboarding/strategy/agentContext";

import {
  buildDefaultExampleQuickReplies,
  formatComposerModeLabel,
  resolveComposerViewState,
} from "./composerViewState";

function buildContext(
  overrides: Partial<CreatorAgentContext> = {},
): CreatorAgentContext {
  return {
    generatedAt: "2026-03-15T12:00:00.000Z",
    contextVersion: "agent_context_v3",
    creatorProfileVersion: "fixture_v1",
    evaluationRubricVersion: "fixture_v1",
    runId: "run-1",
    account: "stanley",
    source: "fixture" as CreatorAgentContext["source"],
    creatorProfile: {
      voice: {
        primaryCasing: "lowercase",
        lowercaseSharePercent: 96,
        averageLengthBand: "medium",
        styleNotes: ["casual"],
      },
      identity: {
        username: "stanley",
        displayName: "Stanley",
        isVerified: false,
      },
      topics: {
        contentPillars: ["creator systems"],
        dominantTopics: [{ label: "audience growth" }],
      },
      styleCard: {
        preferredOpeners: ["yo"],
        signaturePhrases: ["tight loops"],
      },
    },
    growthStrategySnapshot: {
      knownFor: "creator operating systems",
      targetAudience: "founder-creators",
      contentPillars: ["creator systems", "audience growth"],
    },
    performanceModel: {} as CreatorAgentContext["performanceModel"],
    strategyDelta: {} as CreatorAgentContext["strategyDelta"],
    confidence: {} as CreatorAgentContext["confidence"],
    readiness: {} as CreatorAgentContext["readiness"],
    anchorSummary: {} as CreatorAgentContext["anchorSummary"],
    positiveAnchors: [],
    negativeAnchors: [],
    retrieval: {} as CreatorAgentContext["retrieval"],
    unknowns: [],
    ...overrides,
  } as CreatorAgentContext;
}

test("resolveComposerViewState builds contextual prompt pools and lowercase chips", () => {
  const context = buildContext();

  const viewState = resolveComposerViewState({
    context,
    accountName: "StanleyX",
    activeThreadId: null,
    messagesLength: 0,
    isLeavingHero: false,
  });

  expect(viewState.heroGreeting).toBe("yo @stanleyx");
  expect(viewState.heroHandle).toBe("stanleyx");
  expect(viewState.heroQuickActions).toEqual([
    {
      kind: "prompt",
      label: "write a post",
      prompt: "write a post",
    },
    {
      kind: "prompt",
      label: "write a thread",
      prompt: "write a thread",
    },
    {
      kind: "prompt",
      label: "analyze my profile",
      prompt: "analyze my profile",
    },
  ]);
  expect(viewState.defaultPlaceholderPrompts[0]).toBe(
    "write me a post about creator operating systems...",
  );
  expect(viewState.commandPlaceholderPrompts.thread[2]).toBe(
    "write a contrarian thread for founder-creators",
  );
  expect(viewState.commandPlaceholderPrompts.idea[0]).toBe(
    "give me 3 ideas about creator operating systems",
  );
  expect(viewState.commandPlaceholderPrompts.reply[0]).toBe(
    "paste the tweet text or x link you want to reply to",
  );
  expect(viewState.activeThreadPlaceholder).toBe("Ask anything");
  expect(viewState.slashCommands.map((command) => command.id)).toEqual([
    "thread",
    "idea",
    "post",
    "draft",
    "reply",
  ]);
});

test("resolveComposerViewState keeps the hero available for a new handle before context loads", () => {
  const viewState = resolveComposerViewState({
    context: null,
    accountName: "Shernanj",
    activeThreadId: null,
    messagesLength: 0,
    isLeavingHero: false,
  });

  expect(viewState.isNewChatHero).toBe(true);
  expect(viewState.heroGreeting).toBe("Hey @shernanj");
  expect(viewState.heroQuickActions).toEqual([
    {
      kind: "prompt",
      label: "Write a post",
      prompt: "write a post",
    },
    {
      kind: "prompt",
      label: "Write a thread",
      prompt: "write a thread",
    },
    {
      kind: "prompt",
      label: "Analyze my profile",
      prompt: "analyze my profile",
    },
  ]);
});

test("buildDefaultExampleQuickReplies falls back cleanly when context is thin", () => {
  expect(buildDefaultExampleQuickReplies(null, null)).toEqual([
    {
      kind: "example_reply",
      value: "write me a post about my niche",
      label: "write me a post about my niche",
    },
    {
      kind: "example_reply",
      value: "write a thread about one of my core topics",
      label: "write a thread about one of my core topics",
    },
    {
      kind: "example_reply",
      value: "how can i grow on x?",
      label: "how can i grow on x?",
    },
  ]);
});

test("formatComposerModeLabel reflects edit and command modes", () => {
  expect(formatComposerModeLabel(null)).toBeNull();
  expect(formatComposerModeLabel({ kind: "edit" })).toBe("Editing message");
  expect(
    formatComposerModeLabel({ kind: "command", commandId: "thread" }),
  ).toBe("/thread");
  expect(
    formatComposerModeLabel({ kind: "command", commandId: "reply" }),
  ).toBe("/reply");
});
