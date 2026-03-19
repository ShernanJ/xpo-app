import test from "node:test";
import assert from "node:assert/strict";

import { buildThreadConversionPrompt } from "../../../onboarding/draftArtifacts.ts";
import { executeRevisingCapability } from "./revisingCapability.ts";

function createMemory() {
  return {
    activeConstraints: [],
    pendingPlan: null,
    clarificationState: null,
    rollingSummary: null,
    assistantTurnCount: 1,
    formatPreference: "shortform",
    latestRefinementInstruction: null,
    unresolvedQuestion: null,
    topicSummary: null,
    preferredSurfaceMode: null,
  };
}

function createGroundingPacket() {
  return {
    durableFacts: [],
    turnGrounding: [],
    allowedFirstPersonClaims: [],
    allowedNumbers: [],
    forbiddenClaims: [],
    unknowns: [],
    sourceMaterials: [],
    factualAuthority: [],
    voiceContextHints: [],
  };
}

function createArgs(overrides = {}) {
  return {
    workflow: "revise_draft",
    capability: "revising",
    activeContextRefs: [],
    context: {
      memory: createMemory(),
      activeDraft: "original draft text",
      revision: {
        instruction: "make it punchier",
        changeKind: "length_trim",
        targetText: null,
        targetFormat: null,
        scope: "whole_draft",
        targetSpan: null,
        threadIntent: null,
        preserveThreadStructure: false,
      },
      revisionActiveConstraints: [],
      effectiveContext: "",
      relevantTopicAnchors: [],
      styleCard: null,
      maxCharacterLimit: 280,
      goal: "growth",
      antiPatterns: [],
      turnDraftPreference: "balanced",
      turnFormatPreference: "shortform",
      threadPostMaxCharacterLimit: 280,
      turnThreadFramingStyle: null,
      userMessage: "make it punchier",
      groundingPacket: createGroundingPacket(),
      feedbackMemoryNotice: null,
      nextAssistantTurnCount: 2,
      refreshRollingSummary: false,
      latestRefinementInstruction: "make it punchier",
      groundingSources: [],
      groundingMode: null,
      groundingExplanation: null,
      ...overrides.context,
    },
    services: {
      generateRevisionDraft: async () => ({
        revisedDraft: "changed draft text",
        supportAsset: null,
        issuesFixed: ["tightened wording"],
      }),
      critiqueDrafts: async () => ({
        approved: true,
        finalAngle: "same angle",
        finalDraft: "changed draft text",
        issues: [],
      }),
      buildClarificationResponse: async () => ({
        mode: "coach",
        outputShape: "coach_question",
        response: "clarify",
        memory: createMemory(),
      }),
      ...overrides.services,
    },
  };
}

test("critic rejection returns an honest fallback instead of a revision-ready result", async () => {
  const result = await executeRevisingCapability(
    createArgs({
      services: {
        critiqueDrafts: async () => ({
          approved: false,
          finalAngle: "same angle",
          finalDraft: "changed draft text",
          issues: ["revision drifted farther than the requested edit scope"],
        }),
      },
    }),
  );

  assert.equal(result.output.kind, "response");
  assert.match(result.output.response.response, /left the current draft as-is/i);
});

test("no-op revisions return the same fallback instead of claiming the edit landed", async () => {
  const result = await executeRevisingCapability(
    createArgs({
      services: {
        generateRevisionDraft: async () => ({
          revisedDraft: "original draft text",
          supportAsset: null,
          issuesFixed: ["tightened wording"],
        }),
        critiqueDrafts: async () => ({
          approved: true,
          finalAngle: "same angle",
          finalDraft: "original draft text",
          issues: [],
        }),
      },
    }),
  );

  assert.equal(result.output.kind, "response");
  assert.match(result.output.response.response, /left the current draft as-is/i);
});

test("shortform conversion rewrite returns a revised standalone post", async () => {
  const result = await executeRevisingCapability(
    createArgs({
      context: {
        activeDraft:
          "Growing that kind of revenue on a lean budget taught me one hard lesson: talent is the only lever you can pull without breaking the bank. We built a hiring filter around two questions, and it changed who we brought onto the team.",
        revision: {
          instruction: "turn this into a shortform post under 280 characters",
          changeKind: "full_rewrite",
          targetText: null,
          targetFormat: "shortform",
          scope: "whole_draft",
          targetSpan: null,
          threadIntent: null,
          preserveThreadStructure: false,
        },
        userMessage: "turn this into a shortform post under 280 characters",
        latestRefinementInstruction: "turn this into a shortform post under 280 characters",
      },
      services: {
        generateRevisionDraft: async () => ({
          revisedDraft:
            "The best hiring filter I’ve found is one question: what’s the biggest result you delivered in the last 12 months?\n\nIt cuts through buzzwords fast.\nYou learn who can point to real ownership, real pressure, and a measurable outcome.",
          supportAsset: null,
          issuesFixed: ["compressed the draft into one tighter post"],
        }),
        critiqueDrafts: async () => ({
          approved: true,
          finalAngle: "same angle",
          finalDraft:
            "The best hiring filter I’ve found is one question: what’s the biggest result you delivered in the last 12 months?\n\nIt cuts through buzzwords fast.\nYou learn who can point to real ownership, real pressure, and a measurable outcome.",
          issues: [],
        }),
      },
    }),
  );

  assert.equal(result.output.kind, "revision_ready");
  assert.equal(result.output.responseSeed.outputShape, "short_form_post");
  assert.equal(
    result.output.responseSeed.data.draft.includes("---"),
    false,
  );
  assert.equal(result.output.memoryPatch.formatPreference, "shortform");
});

test("thread collapse revisions become a longform single-post draft when the account limit allows it", async () => {
  let reviserCall = null;

  const result = await executeRevisingCapability(
    createArgs({
      context: {
        activeDraft: [
          "That hiring filter changed how we scaled.",
          "It cut most weak proposals before interviews even started.",
          "That saved burn and kept the team focused.",
        ].join("\n\n---\n\n"),
        maxCharacterLimit: 150000,
        turnFormatPreference: "thread",
        threadPostMaxCharacterLimit: 25000,
        revision: {
          instruction:
            "rewrite the current draft as exactly one standalone x post under 25,000 weighted characters. preserve the core idea and strongest proof, collapse the thread into one coherent longform version, and do not use thread separators, post labels, or multi-post structure. revise the full thread, and you may rebuild the thread structure if the request clearly calls for it.",
          changeKind: "full_rewrite",
          targetText: null,
          targetFormat: "longform",
          scope: "whole_draft",
          targetSpan: null,
          threadIntent: "whole_thread",
          preserveThreadStructure: false,
        },
        userMessage: "Collapse to one post",
        latestRefinementInstruction: "Collapse to one post",
      },
      services: {
        generateRevisionDraft: async (args) => {
          reviserCall = args;
          return {
            revisedDraft:
              "That hiring filter changed how we scaled: we killed weak proposals before interviews, saved burn, and kept the team focused on hires that could move revenue instead of just adding headcount.",
            supportAsset: null,
            issuesFixed: ["collapsed the thread into one post"],
          };
        },
        critiqueDrafts: async ({ draft }) => ({
          approved: true,
          finalAngle: "same angle",
          finalDraft: draft,
          issues: [],
        }),
      },
    }),
  );

  assert.equal(reviserCall?.options?.maxCharacterLimit, 25000);
  assert.equal(reviserCall?.options?.formatPreference, "longform");
  assert.equal(result.output.kind, "revision_ready");
  assert.equal(result.output.responseSeed.outputShape, "long_form_post");
  assert.equal(result.output.memoryPatch.formatPreference, "longform");
});

test("whole-draft thread conversions escalate once when the revise loop keeps returning a malformed post", async () => {
  let escalationCount = 0;

  const result = await executeRevisingCapability(
    createArgs({
      context: {
        activeDraft:
          "Hiring gets easier when the filter is sharper.",
        maxCharacterLimit: 1400,
        turnFormatPreference: "thread",
        threadPostMaxCharacterLimit: 280,
        revision: {
          instruction: buildThreadConversionPrompt(280),
          changeKind: "full_rewrite",
          targetText: null,
          targetFormat: "thread",
          scope: "whole_draft",
          targetSpan: null,
          threadIntent: null,
          preserveThreadStructure: false,
        },
        userMessage: "turn into thread",
        latestRefinementInstruction: "turn into thread",
      },
      services: {
        generateRevisionDraft: async () => ({
          revisedDraft: "Hiring gets easier when the filter is sharper.",
          supportAsset: null,
          issuesFixed: ["expanded the draft"],
        }),
        critiqueDrafts: async ({ draft }) => ({
          approved: true,
          finalAngle: "same angle",
          finalDraft: draft,
          issues: [],
        }),
        escalateFormatConversion: async () => {
          escalationCount += 1;
          return {
            workflow: "revise_draft",
            capability: "revising",
            output: {
              kind: "revision_ready",
              responseSeed: {
                mode: "draft",
                outputShape: "thread_seed",
                response: "rebuilt it as a thread.",
                data: {
                  draft: [
                    "Thread: the hiring filter that cuts through noise.",
                    "A sharper interview filter tells you who can point to real outcomes.",
                    "The fastest signal is whether someone can explain the result they owned and why it mattered.",
                    "That gives you a tighter hiring bar without adding process bloat.",
                  ].join("\n\n---\n\n"),
                  supportAsset: null,
                  issuesFixed: ["rebuilt the draft as a thread"],
                  quickReplies: [],
                  voiceTarget: null,
                  noveltyNotes: [],
                  threadFramingStyle: "soft_signal",
                  groundingSources: [],
                  groundingMode: null,
                  groundingExplanation: null,
                },
              },
              memoryPatch: {
                conversationState: "editing",
                activeConstraints: [],
                pendingPlan: null,
                clarificationState: null,
                rollingSummary: null,
                assistantTurnCount: 2,
                formatPreference: "thread",
                latestRefinementInstruction: "turn into thread",
                unresolvedQuestion: null,
              },
            },
            workers: [
              {
                worker: "planner",
                capability: "planning",
                phase: "execution",
                mode: "sequential",
                status: "completed",
                groupId: null,
              },
            ],
            validations: [],
          };
        },
      },
    }),
  );

  assert.equal(escalationCount, 1);
  assert.equal(result.output.kind, "revision_ready");
  assert.equal(result.output.responseSeed.outputShape, "thread_seed");
  assert.match(result.output.responseSeed.data.draft, /---/);
  assert.equal(result.output.memoryPatch.formatPreference, "thread");
  assert.equal(
    result.workers?.some((worker) => worker.worker === "planner"),
    true,
  );
});

test("thread-local ending revisions reassemble a full thread around the revised closing span", async () => {
  const originalThread = [
    "Talent is the only lever you can pull without blowing up the budget.",
    "The first question I ask every candidate is what result they delivered in the last 12 months.",
    "I want a concrete story, not buzzwords.",
    "We turned those questions into a repeatable hiring engine.",
    "Comment \"HIRING\" to get access to my hiring playbook.",
  ].join("\n\n---\n\n");
  let reviserCall = null;

  const result = await executeRevisingCapability(
    createArgs({
      context: {
        activeDraft: originalThread,
        maxCharacterLimit: 1400,
        turnFormatPreference: "thread",
        threadPostMaxCharacterLimit: 280,
        groundingPacket: {
          ...createGroundingPacket(),
          factualAuthority: [
            "Talent is the only lever you can pull without blowing up the budget.",
            "The first question I ask every candidate is what result they delivered in the last 12 months.",
            "I want a concrete story, not buzzwords.",
            "We turned those questions into a repeatable hiring engine. The first engineer who passed it now leads the core product team.",
            "Comment \"HIRING\" and I’ll send the exact interview rubric plus the onboarding playbook.",
          ],
        },
        revision: {
          instruction:
            "keep this thread but give it a stronger ending with clearer proof and a tighter CTA",
          changeKind: "generic",
          targetText: null,
          targetFormat: null,
          scope: "thread_span",
          targetSpan: {
            startIndex: 3,
            endIndex: 4,
          },
          threadIntent: "ending",
          preserveThreadStructure: true,
        },
        userMessage:
          "keep this thread but give it a stronger ending with clearer proof and a tighter CTA",
        latestRefinementInstruction:
          "keep this thread but give it a stronger ending with clearer proof and a tighter CTA",
      },
      services: {
        escalateFormatConversion: async () => {
          throw new Error("thread-local edits should not trigger format conversion escalation");
        },
        generateRevisionDraft: async (args) => {
          reviserCall = args;
          return {
            revisedDraft: [
              "We turned those questions into a repeatable hiring engine. The first engineer who passed it now leads the core product team.",
              "Comment \"HIRING\" and I’ll send the exact interview rubric plus the onboarding playbook.",
            ].join("\n\n---\n\n"),
            supportAsset: null,
            issuesFixed: ["strengthened the closing proof and CTA"],
          };
        },
        critiqueDrafts: async ({ draft }) => ({
          approved: true,
          finalAngle: "same angle",
          finalDraft: draft,
          issues: [],
        }),
      },
    }),
  );

  assert.equal(reviserCall?.activeDraft, [
    "We turned those questions into a repeatable hiring engine.",
    "Comment \"HIRING\" to get access to my hiring playbook.",
  ].join("\n\n---\n\n"));
  assert.deepEqual(reviserCall?.options?.threadRevisionContext?.targetSpan, {
    startIndex: 3,
    endIndex: 4,
  });
  assert.equal(result.output.kind, "revision_ready");
  assert.equal(result.output.responseSeed.outputShape, "thread_seed");
  assert.equal(
    result.output.responseSeed.data.draft,
    [
      "Talent is the only lever you can pull without blowing up the budget.",
      "The first question I ask every candidate is what result they delivered in the last 12 months.",
      "I want a concrete story, not buzzwords.",
      "We turned those questions into a repeatable hiring engine. The first engineer who passed it now leads the core product team.",
      "Comment \"HIRING\" and I’ll send the exact interview rubric plus the onboarding playbook.",
    ].join("\n\n---\n\n"),
  );
});

test("thread-local opening revisions salvage a full-thread return by extracting the targeted opener span", async () => {
  const originalThread = [
    "That moment forced a hard question: what if every new hire had to prove they could keep our $1M ARR-per-employee target intact?",
    "Ten engineers run the platform serving 60,000 creators.",
    "The filter is simple: every hire must map to a revenue-impact hypothesis.",
    "That discipline kept the team lean while output kept compounding.",
    "Comment \"HIRING\" and I'll send the playbook.",
  ].join("\n\n---\n\n");

  const result = await executeRevisingCapability(
    createArgs({
      context: {
        activeDraft: originalThread,
        maxCharacterLimit: 25000,
        turnFormatPreference: "thread",
        threadPostMaxCharacterLimit: 25000,
        groundingPacket: {
          ...createGroundingPacket(),
          factualAuthority: [
            "That moment forced a hard question: what if every new hire had to prove they could keep our $1M ARR-per-employee target intact?",
            "Ten engineers run the platform serving 60,000 creators.",
            "The filter is simple: every hire must map to a revenue-impact hypothesis.",
            "That discipline kept the team lean while output kept compounding.",
            "Comment \"HIRING\" and I'll send the playbook.",
          ],
          allowedNumbers: ["$1M", "60,000"],
        },
        revision: {
          instruction: "rewrite only the opening line or hook, and preserve the rest unless a small flow fix is needed.",
          changeKind: "hook_only_edit",
          targetText: null,
          targetFormat: null,
          scope: "thread_span",
          targetSpan: {
            startIndex: 0,
            endIndex: 0,
          },
          threadIntent: "opening",
          preserveThreadStructure: true,
        },
        userMessage: "Needs a stronger hook",
        latestRefinementInstruction: "Needs a stronger hook",
      },
      services: {
        generateRevisionDraft: async () => ({
          revisedDraft: [
            "Most hiring systems break because they optimize for comfort instead of revenue.",
            "Ten engineers run the platform serving 60,000 creators.",
            "The filter is simple: every hire must map to a revenue-impact hypothesis.",
            "That discipline kept the team lean while output kept compounding.",
            "Comment \"HIRING\" and I'll send the playbook.",
          ].join("\n\n---\n\n"),
          supportAsset: null,
          issuesFixed: ["rewrote the opener"],
        }),
        critiqueDrafts: async ({ draft }) => ({
          approved: true,
          finalAngle: "same angle",
          finalDraft: draft,
          issues: [],
        }),
      },
    }),
  );

  assert.equal(result.output.kind, "revision_ready");
  assert.equal(result.output.responseSeed.outputShape, "thread_seed");
  assert.equal(
    result.output.responseSeed.data.draft,
    [
      "Most hiring systems break because they optimize for comfort instead of revenue.",
      "Ten engineers run the platform serving 60,000 creators.",
      "The filter is simple: every hire must map to a revenue-impact hypothesis.",
      "That discipline kept the team lean while output kept compounding.",
      "Comment \"HIRING\" and I'll send the playbook.",
    ].join("\n\n---\n\n"),
  );
});

test("thread-local span shape mismatches fall back instead of shipping a malformed thread edit", async () => {
  let critiqueCallCount = 0;
  const result = await executeRevisingCapability(
    createArgs({
      context: {
        activeDraft: [
          "Hook",
          "Proof",
          "Detail",
          "Setup close",
          "Old CTA",
        ].join("\n\n---\n\n"),
        maxCharacterLimit: 1400,
        turnFormatPreference: "thread",
        threadPostMaxCharacterLimit: 280,
        revision: {
          instruction: "Stronger ending CTA",
          changeKind: "generic",
          targetText: null,
          targetFormat: null,
          scope: "thread_span",
          targetSpan: {
            startIndex: 3,
            endIndex: 4,
          },
          threadIntent: "ending",
          preserveThreadStructure: true,
        },
        userMessage: "Stronger ending CTA",
        latestRefinementInstruction: "Stronger ending CTA",
      },
      services: {
        generateRevisionDraft: async () => ({
          revisedDraft: "One replacement post only",
          supportAsset: null,
          issuesFixed: ["rewrote the closing"],
        }),
        critiqueDrafts: async () => {
          critiqueCallCount += 1;
          return {
            approved: true,
            finalAngle: "same angle",
            finalDraft: "unused",
            issues: [],
          };
        },
      },
    }),
  );

  assert.equal(critiqueCallCount, 0);
  assert.equal(result.output.kind, "response");
  assert.match(result.output.response.response, /malformed twice/i);
});

test("whole-draft thread conversions still fall back when clean rewrite escalation also fails", async () => {
  let escalationCount = 0;

  const result = await executeRevisingCapability(
    createArgs({
      context: {
        activeDraft:
          "Hiring gets easier when the filter is sharper.",
        maxCharacterLimit: 1400,
        turnFormatPreference: "thread",
        threadPostMaxCharacterLimit: 280,
        revision: {
          instruction: buildThreadConversionPrompt(280),
          changeKind: "full_rewrite",
          targetText: null,
          targetFormat: "thread",
          scope: "whole_draft",
          targetSpan: null,
          threadIntent: null,
          preserveThreadStructure: false,
        },
        userMessage: "turn into thread",
        latestRefinementInstruction: "turn into thread",
      },
      services: {
        generateRevisionDraft: async () => ({
          revisedDraft: "Hiring gets easier when the filter is sharper.",
          supportAsset: null,
          issuesFixed: ["expanded the draft"],
        }),
        critiqueDrafts: async ({ draft }) => ({
          approved: true,
          finalAngle: "same angle",
          finalDraft: draft,
          issues: [],
        }),
        escalateFormatConversion: async () => {
          escalationCount += 1;
          return null;
        },
      },
    }),
  );

  assert.equal(escalationCount, 1);
  assert.equal(result.output.kind, "response");
  assert.match(result.output.response.response, /malformed twice/i);
});
