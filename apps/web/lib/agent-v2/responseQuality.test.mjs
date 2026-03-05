import test from "node:test";
import assert from "node:assert/strict";

import { buildDynamicDraftChoices } from "./orchestrator/clarificationDraftChips.ts";
import { normalizeDraftRevisionInstruction } from "./orchestrator/draftRevision.ts";
import { buildDraftReply } from "./orchestrator/draftReply.ts";
import { buildIdeationReply } from "./orchestrator/ideationReply.ts";
import {
  looksLikeMechanicalEdit,
  looksLikeNegativeFeedback,
} from "./agents/antiPatternExtractor.ts";
import { buildPlannerQuickReplies } from "./orchestrator/plannerQuickReplies.ts";
import {
  inferCorrectionRepairQuestion,
  inferSourceTransparencyReply,
  looksLikeSemanticCorrection,
} from "./orchestrator/correctionRepair.ts";
import {
  buildFeedbackMemoryNotice,
  prependFeedbackMemoryNotice,
} from "./orchestrator/feedbackMemoryNotice.ts";
import { buildRollingSummary, shouldRefreshRollingSummary } from "./memory/summaryManager.ts";
import {
  buildEffectiveContext,
  retrieveRelevantContext,
} from "./memory/contextRetriever.ts";

const baseStyleCard = {
  contextAnchors: [
    "building in public while shipping xpo",
    "turning linkedin posts into x posts",
  ],
  pacing: "fast, bullet-friendly, scan-friendly",
};

test("verified topic clarification returns topic-aware format chips", () => {
  const result = buildDynamicDraftChoices({
    mode: "topic_known",
    seedTopic: "internship hunt and taiv interview",
    styleCard: baseStyleCard,
    topicAnchors: ["internship hunt", "cold dms"],
    isVerifiedAccount: true,
  });

  assert.equal(result.length, 3);
  assert.equal(/shortform/i.test(result[0].label), true);
  assert.equal(/internship/i.test(result[0].label), true);
  assert.equal(result[0].formatPreference, "shortform");
  assert.equal(/longform/i.test(result[1].label), true);
  assert.equal(/internship/i.test(result[1].label), true);
  assert.equal(result[1].formatPreference, "longform");
  assert.equal(/angle/i.test(result[2].label), true);
  assert.equal(result[2].explicitIntent, "ideate");
});

test("loose draft fallback keeps balanced safe choices when topic confidence is weak", () => {
  const result = buildDynamicDraftChoices({
    mode: "loose",
    seedTopic: "this",
    styleCard: {
      ...baseStyleCard,
      contextAnchors: ["this", "something", "my thing"],
    },
    topicAnchors: ["that", "anything"],
    isVerifiedAccount: false,
  });

  assert.equal(/lane/i.test(result[0].label), true);
  assert.equal(/recent/i.test(result[1].label), true);
  assert.equal(/angle/i.test(result[2].label), true);
  assert.equal(result[2].explicitIntent, "ideate");
});

test("planner quick replies are explicit and topic-aware", () => {
  const quickReplies = buildPlannerQuickReplies({
    plan: {
      objective: "internship hunt",
      angle: "show the mismatch between public wins and private grind",
      targetLane: "original",
      mustInclude: [],
      mustAvoid: [],
      hookType: "direct",
      pitchResponse: "",
    },
    styleCard: null,
    context: "approval",
  });

  assert.equal(quickReplies.length, 3);
  assert.equal(quickReplies[0].label.toLowerCase().includes("write"), true);
  assert.equal(quickReplies[1].label.toLowerCase().includes("tighten"), false);
  assert.equal(quickReplies[2].label.toLowerCase().includes("angle"), true);
  assert.equal(
    /(sharpen|punchier|tighter)/i.test(quickReplies[1].value),
    true,
  );
});

test("planner quick replies adapt casing to lowercase voice style", () => {
  const quickReplies = buildPlannerQuickReplies({
    plan: {
      objective: "creator analytics",
      angle: "explain why vanity metrics hide retention risk",
      targetLane: "original",
      mustInclude: [],
      mustAvoid: [],
      hookType: "counter",
      pitchResponse: "",
    },
    styleCard: {
      ...baseStyleCard,
      formattingRules: ["all lowercase"],
      customGuidelines: [],
      sentenceOpenings: [],
      sentenceClosers: [],
      emojiPatterns: [],
      slangAndVocabulary: [],
      antiExamples: [],
    },
    context: "approval",
  });

  assert.equal(quickReplies[0].label, quickReplies[0].label.toLowerCase());
  assert.equal(quickReplies[0].value, quickReplies[0].value.toLowerCase());
});

test("draft handoff reply stays conversational and asks for tweaks", () => {
  const reply = buildDraftReply({
    userMessage: "looks good, write it",
    draftPreference: "balanced",
    isEdit: false,
    issuesFixed: [],
  });

  assert.equal(/take a look/i.test(reply), false);
  assert.equal(/\?/.test(reply), true);
});

test("edit reply stays conversational and asks if another pass is needed", () => {
  const reply = buildDraftReply({
    userMessage: "make it tighter",
    draftPreference: "voice_first",
    isEdit: true,
    issuesFixed: [],
  });

  assert.equal(/take a look/i.test(reply), false);
  assert.equal(/\?/.test(reply), true);
});

test("draft handoff adapts to blunt cadence when user prefers direct replies", () => {
  const reply = buildDraftReply({
    userMessage: "looks good write it",
    draftPreference: "balanced",
    isEdit: false,
    issuesFixed: [],
    styleCard: {
      ...baseStyleCard,
      customGuidelines: ["keep it blunt and direct"],
      formattingRules: [],
      sentenceOpenings: [],
      sentenceClosers: [],
      emojiPatterns: [],
      slangAndVocabulary: [],
      antiExamples: [],
    },
  });

  assert.equal(reply.length < 96, true);
  assert.equal(/drafted|put together|ran with/i.test(reply), true);
  assert.equal(/how does this feel/i.test(reply), false);
});

test("draft handoff adapts to warm cadence when user prefers conversational replies", () => {
  const reply = buildDraftReply({
    userMessage: "looks good write it please",
    draftPreference: "balanced",
    isEdit: false,
    issuesFixed: [],
    styleCard: {
      ...baseStyleCard,
      customGuidelines: ["keep it warm and conversational"],
      formattingRules: [],
      sentenceOpenings: [],
      sentenceClosers: [],
      emojiPatterns: [],
      slangAndVocabulary: [],
      antiExamples: [],
    },
  });

  assert.equal(/does this feel|how does this feel/i.test(reply), true);
  assert.equal(/\?/.test(reply), true);
});

test("draft handoff respects lowercase casing preference", () => {
  const reply = buildDraftReply({
    userMessage: "make it tighter",
    draftPreference: "voice_first",
    isEdit: true,
    issuesFixed: [],
    styleCard: {
      ...baseStyleCard,
      customGuidelines: ["keep it blunt and direct"],
      formattingRules: ["all lowercase"],
      sentenceOpenings: [],
      sentenceClosers: [],
      emojiPatterns: [],
      slangAndVocabulary: [],
      antiExamples: [],
    },
  });

  assert.equal(reply, reply.toLowerCase());
});

test("ideation reply rewrites rigid angle close into casual follow-up", () => {
  const reply = buildIdeationReply({
    intro:
      "gotcha, you wanna spin more on the linkedin-to-x vibe and the ampm vs real-life split.",
    close: "which angle do you want to flesh out first?",
    userMessage: "give me post ideas",
    styleCard: null,
  });

  assert.equal(reply.toLowerCase().includes("flesh out"), false);
  assert.equal(
    /what do you think|want me to draft|which one should we turn into a draft/i.test(
      reply,
    ),
    true,
  );
});

test("ideation reply respects lowercase style preference", () => {
  const reply = buildIdeationReply({
    intro: "Here are a few ideas based on your recent posts.",
    close: "Which angle do you want to flesh out first?",
    userMessage: "give me post ideas",
    styleCard: {
      ...baseStyleCard,
      customGuidelines: [],
      formattingRules: ["all lowercase"],
      sentenceOpenings: [],
      sentenceClosers: [],
      emojiPatterns: [],
      slangAndVocabulary: [],
      antiExamples: [],
    },
  });

  assert.equal(reply, reply.toLowerCase());
});

test("ideation follow-up offers switch-up option on more ideas requests", () => {
  const reply = buildIdeationReply({
    intro: "gotcha. here are more angles.",
    close: "which angle do you want to flesh out first?",
    userMessage: "give me more ideas",
    styleCard: null,
  });

  assert.equal(/more ideas|fresh batch of ideas|more angles/i.test(reply), true);
  assert.equal(
    /switch it up|change it up|different direction|change direction|stick with this theme/i.test(
      reply,
    ),
    true,
  );
});

test("correction repair catches fabrication pushback phrasing", () => {
  const question = inferCorrectionRepairQuestion(
    "where did you get that information from?",
    "turning linkedin posts into x posts",
  );

  assert.equal(typeof question, "string");
  assert.equal(
    question?.toLowerCase().includes("what should i keep factual"),
    true,
  );
});

test("source transparency cites prior message when evidence is in the latest user turn", () => {
  const reply = inferSourceTransparencyReply({
    userMessage: "where did that come from?",
    activeDraft:
      "5 years, 3 product launches, 10 teammates-what's the biggest lesson you've learned?",
    recentHistory: [
      "user: give me post ideas",
      "assistant: which angle do you want to flesh out first?",
      "user: write one about leading 10 teammates through product launches",
    ].join("\n"),
    contextAnchors: [],
  });

  assert.equal(typeof reply, "string");
  assert.equal(reply?.toLowerCase().includes("prior message"), true);
});

test("source transparency cites current chat when detail was mentioned earlier but not last turn", () => {
  const reply = inferSourceTransparencyReply({
    userMessage: "where did you get that information?",
    activeDraft:
      "turning linkedin posts into x posts changed how i tell the story and improved my replies",
    recentHistory: [
      "user: i keep turning linkedin posts into x posts",
      "assistant: noted.",
      "user: write me a random post",
    ].join("\n"),
    contextAnchors: [],
  });

  assert.equal(typeof reply, "string");
  assert.equal(reply?.toLowerCase().includes("earlier in this chat"), true);
});

test("source transparency cites style memory when chat does not contain the detail", () => {
  const reply = inferSourceTransparencyReply({
    userMessage: "where did you get that?",
    activeDraft: "my ampm creator nights changed how i write because the energy is real",
    recentHistory: [
      "user: write me a post",
      "assistant: here's the draft.",
      "user: where did you get that?",
    ].join("\n"),
    contextAnchors: ["ampm is a club in downtown toronto where i meet creators"],
  });

  assert.equal(typeof reply, "string");
  assert.equal(reply?.toLowerCase().includes("style memory"), true);
});

test("source transparency admits no source when detail is unsupported", () => {
  const reply = inferSourceTransparencyReply({
    userMessage: "where did that come from?",
    activeDraft: "yesterday i was dodging lasers at a stan event and jumping off stage",
    recentHistory: [
      "user: give me a post idea",
      "assistant: here's one",
    ].join("\n"),
    contextAnchors: ["building in public while shipping xpo"],
  });

  assert.equal(typeof reply, "string");
  assert.equal(
    reply?.toLowerCase().includes(
      "didn't come from your prior message, current chat, or style memory",
    ),
    true,
  );
});

test("semantic correction detector flags meta corrections", () => {
  assert.equal(looksLikeSemanticCorrection("no that was a question"), true);
  assert.equal(
    looksLikeSemanticCorrection(
      "how about the 10 teammates lol? i dont wanna falsify stories",
    ),
    true,
  );
});

test("feedback memory notice is generated when new feedback is captured", () => {
  const notice = buildFeedbackMemoryNotice({
    styleCard: {
      ...baseStyleCard,
      formattingRules: [],
      customGuidelines: [],
      sentenceOpenings: [],
      sentenceClosers: [],
      emojiPatterns: [],
      slangAndVocabulary: [],
      antiExamples: [],
    },
    rememberedStyleRuleCount: 1,
    rememberedFactCount: 0,
    rememberedAntiPattern: false,
  });

  assert.equal(typeof notice, "string");
  assert.equal(notice?.toLowerCase().includes("remember"), true);
});

test("feedback memory notice respects lowercase preference", () => {
  const notice = buildFeedbackMemoryNotice({
    styleCard: {
      ...baseStyleCard,
      formattingRules: ["all lowercase"],
      customGuidelines: [],
      sentenceOpenings: [],
      sentenceClosers: [],
      emojiPatterns: [],
      slangAndVocabulary: [],
      antiExamples: [],
    },
    rememberedStyleRuleCount: 1,
    rememberedFactCount: 0,
    rememberedAntiPattern: false,
  });

  assert.equal(notice, notice?.toLowerCase());
});

test("feedback memory notice is prepended once", () => {
  const combined = prependFeedbackMemoryNotice(
    "what do you want to rewrite next?",
    "Noted - I'll remember that feedback for next drafts.",
  );

  assert.equal(combined.startsWith("Noted - I'll remember that feedback"), true);
  assert.equal(combined.includes("\n\nwhat do you want to rewrite next?"), true);

  const unchanged = prependFeedbackMemoryNotice(
    "Noted - I'll remember that feedback for next drafts.",
    "Noted - I'll remember that feedback for next drafts.",
  );
  assert.equal(unchanged, "Noted - I'll remember that feedback for next drafts.");
});

test("draft revision normalizer keeps quoted phrase removals local", () => {
  const directive = normalizeDraftRevisionInstruction(
    'why does it say "see screenshot of my feed"',
    "my feed looks like a rave. (see screenshot of my feed)",
  );

  assert.equal(directive.changeKind, "local_phrase_edit");
  assert.equal(directive.targetText, "see screenshot of my feed");
  assert.match(directive.instruction, /remove or replace the phrase/i);
});

test("draft revision normalizer recognizes length trims", () => {
  const directive = normalizeDraftRevisionInstruction(
    "make it shorter",
    "a long draft that needs to be tightened",
  );

  assert.equal(directive.changeKind, "length_trim");
  assert.match(directive.instruction, /shorten the current draft/i);
});

test("anti-pattern helpers separate mechanical edits from tonal rejection", () => {
  assert.equal(looksLikeMechanicalEdit("remove commas and fix punctuation"), true);
  assert.equal(looksLikeNegativeFeedback("this sounds like linkedin"), true);
  assert.equal(looksLikeMechanicalEdit("this sounds like linkedin"), false);
});

test("rolling summary keeps longform preference and correction locks", () => {
  const summary = buildRollingSummary({
    currentSummary:
      "Current topic: xpo launch\nApproved angle: none yet\nFormat preference: shortform\nKnown facts: none recorded",
    topicSummary: "xpo launch",
    approvedPlan: {
      objective: "xpo launch",
      angle: "why building in public compounds faster",
      targetLane: "original",
      mustInclude: [],
      mustAvoid: [],
      hookType: "direct",
      pitchResponse: "test",
      formatPreference: "longform",
    },
    activeConstraints: [
      "Correction lock: taiv requested an interview",
      "keep all lowercase",
      "use > for bullets",
    ],
    latestDraftStatus: "draft ready",
    formatPreference: "longform",
  });

  assert.match(summary, /Format preference: longform/);
  assert.match(summary, /Known facts: taiv requested an interview/);
  assert.match(summary, /Preferences discovered: keep all lowercase \| use > for bullets/);
});

test("context retrieval prioritizes correction locks and builds fact-first context", () => {
  const relevant = retrieveRelevantContext({
    userMessage: "internship hunt",
    topicSummary: null,
    rollingSummary: null,
    topicAnchors: [
      "taiv requested an interview and now the internship hunt is real",
      "general internship grind with no specific interview context",
      "xpo build in public update",
    ],
    activeConstraints: ["Correction lock: taiv requested an interview"],
  });

  assert.equal(relevant[0], "taiv requested an interview and now the internship hunt is real");

  const effectiveContext = buildEffectiveContext({
    recentHistory: "user: make it shorter\nassistant: here's a tighter version.",
    rollingSummary: "Current topic: internship hunt",
    relevantTopicAnchors: relevant,
    contextAnchors: ["taiv is a real interview checkpoint"],
    activeConstraints: ["Correction lock: taiv requested an interview"],
  });

  assert.match(effectiveContext, /FACTS YOU ALREADY KNOW:/);
  assert.match(effectiveContext, /taiv is a real interview checkpoint/);
  assert.match(effectiveContext, /taiv requested an interview/);
});

test("rolling summary refresh cadence stays stable", () => {
  assert.equal(shouldRefreshRollingSummary(0, false), false);
  assert.equal(shouldRefreshRollingSummary(3, false), true);
  assert.equal(shouldRefreshRollingSummary(4, false), false);
  assert.equal(shouldRefreshRollingSummary(1, true), true);
});
