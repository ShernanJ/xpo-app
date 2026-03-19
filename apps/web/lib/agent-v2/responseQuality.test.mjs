import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { buildThreadConversionPrompt } from "../onboarding/draftArtifacts.ts";
import { buildDynamicDraftChoices } from "./responses/clarificationDraftChips.ts";
import { normalizeDraftRevisionInstruction } from "./capabilities/revision/draftRevision.ts";
import { buildDraftReply } from "./responses/draftReply.ts";
import { buildIdeationReply } from "./responses/ideationReply.ts";
import { buildIdeationQuickReplies } from "./responses/ideationQuickReplies.ts";
import { buildDraftResultQuickReplies } from "./responses/draftResultQuickReplies.ts";
import { buildDraftClarificationQuickReplies } from "./responses/draftClarificationQuickReplies.ts";
import {
  looksLikeMechanicalEdit,
  looksLikeNegativeFeedback,
} from "./agents/antiPatternExtractor.ts";
import { buildPlannerQuickReplies } from "./responses/plannerQuickReplies.ts";
import { buildProfileAnalysisQuickReplies } from "./responses/profileAnalysisQuickReplies.ts";
import {
  inferCorrectionRepairQuestion,
  looksLikeSemanticCorrection,
} from "./responses/semanticRepair.ts";
import {
  inferIdeationRationaleReply,
  inferPostReferenceReply,
  inferSourceTransparencyReply,
  looksLikeConfusionPing,
} from "./responses/sourceTransparency.ts";
import {
  buildFeedbackMemoryNotice,
  prependFeedbackMemoryNotice,
} from "./responses/feedbackMemoryNotice.ts";
import {
  buildComparisonRelationshipQuestion,
  buildLooseDirectionReply,
  buildProblemStakeQuestion,
  buildProductCapabilityQuestion,
} from "./responses/assistantReplyStyle.ts";
import { buildRollingSummary, shouldRefreshRollingSummary } from "./memory/summaryManager.ts";
import {
  buildFactSafeReferenceHints,
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

test("thread voice target does not default story threads to tight compression", () => {
  const source = readFileSync(
    fileURLToPath(new URL("./core/voiceTarget.ts", import.meta.url)),
    "utf8",
  );

  assert.equal(
    source.includes('if (args.formatPreference === "thread") {\n    return "tight";'),
    false,
  );
  assert.match(source, /"journey"/);
  assert.match(source, /return "spacious";/);
});

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

test("dynamic draft chips never surface meta summary topics like 'user is...'", () => {
  const result = buildDynamicDraftChoices({
    mode: "topic_known",
    seedTopic: "User Is Building An App",
    styleCard: {
      ...baseStyleCard,
      contextAnchors: [
        "The user is building a product",
        "Creator is launching something",
      ],
    },
    topicAnchors: ["they are testing an idea"],
    isVerifiedAccount: false,
  });

  assert.equal(result.length, 3);
  assert.equal(
    result.every(
      (chip) =>
        !/user is|creator is|they are|they is|he is|she is/i.test(chip.label) &&
        !/user is|creator is|they are|they is|he is|she is/i.test(chip.value),
    ),
    true,
  );
  assert.equal(
    result.some((chip) => /usual lane|recent|angle/i.test(chip.label)),
    true,
  );
});

test("dynamic draft chips never surface malformed confirmation topics", () => {
  const result = buildDynamicDraftChoices({
    mode: "topic_known",
    seedTopic: "Yes does do that",
    styleCard: {
      ...baseStyleCard,
      contextAnchors: ["yes does do that", "founder hiring systems"],
    },
    topicAnchors: ["yes does do that", "founder hiring systems"],
    isVerifiedAccount: false,
  });

  assert.equal(
    result.every(
      (chip) =>
        !/yes does do that/i.test(chip.label) &&
        !/yes does do that/i.test(chip.value),
    ),
    true,
  );
  assert.equal(
    result.some((chip) => /usual lane|angle|founder hiring systems/i.test(chip.label)),
    true,
  );
});

test("dynamic draft chips never surface leaked profile-summary topics", () => {
  const result = buildDynamicDraftChoices({
    mode: "topic_known",
    seedTopic: "User's X (Twitter) username is @vitddnv",
    styleCard: {
      ...baseStyleCard,
      contextAnchors: [
        "User's X (Twitter) username is @vitddnv",
        "- Account: vitddnv @vitddnv",
        "founder hiring systems",
      ],
    },
    topicAnchors: ["Bio: founder builder on x", "founder hiring systems"],
    isVerifiedAccount: false,
  });

  assert.equal(
    result.every(
      (chip) =>
        !/username is|account:|bio:/i.test(chip.label) &&
        !/username is|account:|bio:/i.test(chip.value),
    ),
    true,
  );
  assert.equal(
    result.some((chip) => /usual lane|angle|founder hiring systems/i.test(chip.label)),
    true,
  );
});

test("ideation quick replies stay generic when seed topic is leaked profile context", () => {
  const result = buildIdeationQuickReplies({
    styleCard: baseStyleCard,
    seedTopic: "User's X (Twitter) username is @vitddnv",
  });

  assert.equal(result.length, 2);
  assert.equal(result.every((chip) => !/username is|vitddnv/i.test(chip.label)), true);
  assert.equal(result.every((chip) => !/username is|vitddnv/i.test(chip.value)), true);
});

test("clarification heuristics reject malformed confirmation fragments as topic seeds", () => {
  const clarificationHeuristicsSource = readFileSync(
    fileURLToPath(new URL("./capabilities/planning/clarificationHeuristics.ts", import.meta.url)),
    "utf8",
  );

  assert.match(clarificationHeuristicsSource, /yes\|yeah\|yep\|sure\|ok\|okay\|no\|nope\|nah/);
  assert.match(
    clarificationHeuristicsSource,
    /run with it\|write it\|draft it\|do it\|go ahead\|use that\|pick one\|choose one/,
  );
});

test("story thread chips avoid forcing scan-friendly bullet framing", () => {
  const result = buildDynamicDraftChoices({
    mode: "topic_known",
    seedTopic: "hiring in public",
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
    topicAnchors: ["hiring in public", "candidate found us"],
    isVerifiedAccount: true,
    requestedFormatPreference: "thread",
  });

  assert.equal(result[0].formatPreference, "thread");
  assert.match(result[0].value, /short paragraphs|real beat|thread breathe/i);
  assert.doesNotMatch(result[0].value, /scan-friendly structure/i);
});

test("complaint and meta-analysis phrases do not become clarification topic chips", () => {
  const result = buildDynamicDraftChoices({
    mode: "loose",
    seedTopic: "this is way too formal",
    styleCard: {
      ...baseStyleCard,
      formattingRules: [],
      customGuidelines: [],
      sentenceOpenings: [],
      sentenceClosers: [],
      emojiPatterns: [],
      slangAndVocabulary: [],
      antiExamples: [],
      contextAnchors: ["what is my best post"],
    },
    topicAnchors: ["what is my best post"],
    isVerifiedAccount: false,
  });

  const labels = result.map((chip) => chip.label.toLowerCase());
  assert.equal(labels.some((label) => label.includes("too formal")), false);
  assert.equal(labels.some((label) => label.includes("best post")), false);
  assert.equal(labels.includes("usual lane"), true);
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

test("assistant fallback questions stay direct without helper prefixes", () => {
  assert.equal(
    buildComparisonRelationshipQuestion("stanley").startsWith("one more thing:"),
    false,
  );
  assert.equal(
    buildProblemStakeQuestion().startsWith("one more thing:"),
    false,
  );
  assert.equal(
    buildProductCapabilityQuestion({ kind: "generic" }).startsWith("quick check:"),
    false,
  );
  assert.equal(
    buildProductCapabilityQuestion({
      kind: "comparison",
      target: "x",
    }).startsWith("quick check:"),
    false,
  );
});

test("loose direction reply reads like a normal sentence and points at the chips", () => {
  assert.equal(
    buildLooseDirectionReply({
      almostReady: false,
      requestedFormatPreference: null,
    }),
    "i can do that. pick one direction below and i'll run with it.",
  );
});

test("ideation quick replies expose more-like-this and change-it-up chips", () => {
  const quickReplies = buildIdeationQuickReplies({
    styleCard: null,
    seedTopic: "linkedin to x posts",
  });

  assert.equal(quickReplies.length, 2);
  assert.equal(/more/i.test(quickReplies[0].label), true);
  assert.equal(
    /same lane|more ideas/i.test(quickReplies[0].value.toLowerCase()),
    true,
  );
  assert.equal(
    /change|switch/i.test(quickReplies[1].label.toLowerCase()),
    true,
  );
  assert.equal(quickReplies[0].explicitIntent, "ideate");
  assert.equal(quickReplies[1].explicitIntent, "ideate");
});

test("bare draft ideation quick replies expose three structured angle chips", () => {
  const quickReplies = buildIdeationQuickReplies({
    styleCard: null,
    mode: "primary_angle_picks",
    formatHint: "post",
    angles: [
      { title: "the hiring filter that kept our team lean" },
      { title: "why founder-led sales breaks when the process stays tribal" },
      { title: "the onboarding fix that shortened time-to-value" },
    ],
  });

  assert.equal(quickReplies.length, 3);
  assert.equal(quickReplies.every((chip) => chip.kind === "ideation_angle"), true);
  assert.equal(quickReplies.every((chip) => chip.formatHint === "post"), true);
  assert.deepEqual(
    quickReplies.map((chip) => chip.label),
    [
      "The hiring filter that kept our team lean",
      "Why founder-led sales breaks when the process stays tribal",
      "The onboarding fix that shortened time-to-value",
    ],
  );
});

test("ideation quick replies respect lowercase style preference", () => {
  const quickReplies = buildIdeationQuickReplies({
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
    seedTopic: "LinkedIn To X",
  });

  assert.equal(quickReplies[0].label, quickReplies[0].label.toLowerCase());
  assert.equal(quickReplies[0].value, quickReplies[0].value.toLowerCase());
});

test("draft clarification quick replies mirror explicit choices from the question", () => {
  const quickReplies = buildDraftClarificationQuickReplies({
    question:
      "What specific insight or story do you want to share today - a hiring system tip, a leadership lesson, or a behind-the-scenes metric?",
    userMessage: "write a post",
    styleCard: null,
    topicAnchors: [],
    seedTopic: null,
    isVerifiedAccount: false,
    requestedFormatPreference: "shortform",
  });

  assert.deepEqual(
    quickReplies.map((chip) => chip.label),
    [
      "Hiring system tip",
      "Leadership lesson",
      "Behind-the-scenes metric",
    ],
  );
  assert.deepEqual(
    quickReplies.map((chip) => chip.value.toLowerCase()),
    [
      "a hiring system tip",
      "a leadership lesson",
      "a behind-the-scenes metric",
    ],
  );
});

test("draft clarification quick replies reject malformed parsed choices and fall back to safer draft chips", () => {
  const quickReplies = buildDraftClarificationQuickReplies({
    question:
      "Which direction should I take - yes does do that, a founder lesson, or a recent example?",
    userMessage: "write a post",
    styleCard: baseStyleCard,
    topicAnchors: ["hiring systems for lean teams", "founder leadership lessons"],
    seedTopic: null,
    isVerifiedAccount: false,
    requestedFormatPreference: "shortform",
  });

  assert.equal(quickReplies.some((chip) => /yes does do that/i.test(chip.label)), false);
  assert.equal(quickReplies.length, 3);
  assert.equal(
    quickReplies.some((chip) => /usual lane|angle|linkedin to x/i.test(chip.label)),
    true,
  );
});

test("draft clarification fallback chips keep lowercase voice preferences after rejecting bad parsed choices", () => {
  const quickReplies = buildDraftClarificationQuickReplies({
    question:
      "Which direction should I take - yes does do that, a founder lesson, or a recent example?",
    userMessage: "write a post",
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
    topicAnchors: ["hiring systems for lean teams", "founder leadership lessons"],
    seedTopic: null,
    isVerifiedAccount: false,
    requestedFormatPreference: "shortform",
  });

  assert.equal(
    quickReplies.every((chip) => chip.label === chip.label.toLowerCase()),
    true,
  );
  assert.equal(
    quickReplies.every((chip) => chip.value === chip.value.toLowerCase()),
    true,
  );
});

test("draft clarification quick replies fall back to dynamic draft chips for bare draft asks", () => {
  const quickReplies = buildDraftClarificationQuickReplies({
    question: "what should i write about?",
    userMessage: "write a post",
    styleCard: baseStyleCard,
    topicAnchors: ["hiring systems for lean teams", "founder leadership lessons"],
    seedTopic: null,
    isVerifiedAccount: false,
    requestedFormatPreference: "shortform",
  });

  assert.equal(quickReplies.length, 3);
  assert.equal(
    quickReplies.some((chip) => /usual lane|angle|linkedin to x/i.test(chip.label)),
    true,
  );
  assert.equal(
    quickReplies.some((chip) => chip.explicitIntent === "plan"),
    true,
  );
});

test("draft result quick replies stay format-aware and explicit", () => {
  const quickReplies = buildDraftResultQuickReplies({
    outputShape: "thread_seed",
    styleCard: null,
    seedTopic: "creator analytics positioning",
    singlePostMaxCharacterLimit: 25_000,
  });

  assert.equal(quickReplies.length, 3);
  assert.equal(/thread|post|ending/i.test(quickReplies.map((chip) => chip.label).join(" ")), true);
  assert.equal(/collapse this thread/i.test(quickReplies[1].value.toLowerCase()), true);
  assert.equal(/single-post character limit/i.test(quickReplies[1].value), true);
  assert.equal("formatPreference" in quickReplies[1], false);
});

test("profile analysis quick replies prioritize weak profile surfaces", () => {
  const quickReplies = buildProfileAnalysisQuickReplies({
    kind: "profile_analysis",
    profile: {
      username: "vitddnv",
      name: "Vitalii Dodonov",
      bio: "Scaling Stan in public.",
      avatarUrl: null,
      headerImageUrl: null,
      isVerified: true,
      followersCount: 7927,
      followingCount: 482,
      createdAt: "2015-09-01T00:00:00.000Z",
    },
    pinnedPost: {
      id: "pin-1",
      text: "Current pinned post",
      createdAt: "2026-01-11T00:00:00.000Z",
      metrics: {
        likeCount: 10,
        replyCount: 2,
        repostCount: 1,
        quoteCount: 0,
      },
      url: "https://x.com/vitddnv/status/1",
    },
    audit: {
      score: 86,
      headline: "Profile conversion is mostly aligned with startups and growth through built.",
      fingerprint: "fp-1",
      shouldAutoOpen: true,
      steps: [
        {
          key: "bio_formula",
          title: "Bio Formula",
          status: "warn",
          score: 70,
          summary: "Bio needs a tighter hook.",
          findings: [],
          actionLabel: "Rewrite bio",
        },
        {
          key: "visual_real_estate",
          title: "Visual Real Estate",
          status: "warn",
          score: 62,
          summary: "Banner promise is too vague.",
          findings: [],
          actionLabel: "Clarify banner",
        },
        {
          key: "pinned_tweet",
          title: "Pinned Tweet",
          status: "fail",
          score: 40,
          summary: "Pinned post needs a clearer authority story.",
          findings: [],
          actionLabel: "Write pinned post",
        },
      ],
      strengths: [],
      gaps: ["Bio is too broad."],
      unknowns: [],
      bioFormulaCheck: {
        status: "warn",
        score: 70,
        summary: "Bio needs a tighter hook.",
        findings: [],
        bio: "Scaling Stan in public.",
        charCount: 23,
        matchesFormula: {
          what: true,
          who: false,
          proofOrCta: false,
        },
        alternatives: [
          {
            id: "bio-1",
            text: "I help founders grow faster on X with proof-first systems.",
            proofMode: "cta",
          },
        ],
      },
      visualRealEstateCheck: {
        status: "warn",
        score: 62,
        summary: "Banner promise is too vague.",
        findings: [],
        hasHeaderImage: true,
        headerImageUrl: null,
        headerClarity: null,
        headerClarityResolved: false,
      },
      pinnedTweetCheck: {
        status: "fail",
        score: 40,
        summary: "Pinned post needs a clearer authority story.",
        findings: [],
        pinnedPost: null,
        category: "weak",
        ageDays: 120,
        isStale: true,
        promptSuggestions: {
          originStory: "origin",
          coreThesis: "core",
        },
      },
    },
    bannerAnalysis: null,
  });

  assert.equal(quickReplies.length, 3);
  assert.deepEqual(
    quickReplies.map((chip) => chip.label),
    ["Rewrite bio", "Fix banner promise", "Draft pinned post"],
  );
  assert.equal(quickReplies[2].explicitIntent, "draft");
  assert.match(
    quickReplies[2].value,
    /fix this issue from the audit: pinned post needs a clearer authority story\./i,
  );
  assert.match(
    quickReplies[2].value,
    /keep the best proof from the current pinned post: "Current pinned post"/i,
  );
  assert.match(quickReplies[2].value, /use this direction from the audit: origin \| core\./i);
});

test("quick reply labels keep natural sentence casing for normal phrases", async () => {
  const { normalizeQuickReplyLabel } = await import("./responses/quickReplyVoice.ts");

  assert.equal(
    normalizeQuickReplyLabel("make it more direct", { lowercase: false, concise: false }),
    "Make it more direct",
  );
});

test("draft pipeline clarification prompts prefer noun-phrase choices over sentence-like clauses", () => {
  const draftPipelineSource = readFileSync(
    fileURLToPath(new URL("./runtime/draftPipeline.ts", import.meta.url)),
    "utf8",
  );

  assert.match(
    draftPipelineSource,
    /what should it land as - the funny loss itself or the actual takeaway\?/,
  );
  assert.match(
    draftPipelineSource,
    /what lane should i use here - plain product claim or your own use\/build experience\?/,
  );
});

test("routing and draft pipeline clarification paths both use the shared hardened draft chip builder", () => {
  const routingPolicySource = readFileSync(
    fileURLToPath(new URL("./runtime/routingPolicy.ts", import.meta.url)),
    "utf8",
  );
  const draftPipelineSource = readFileSync(
    fileURLToPath(new URL("./runtime/draftPipeline.ts", import.meta.url)),
    "utf8",
  );

  assert.match(routingPolicySource, /buildDraftClarificationQuickReplies\(/);
  assert.match(draftPipelineSource, /buildDraftClarificationQuickReplies\(/);
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

test("first-pass draft handoff does not imply trimming unless the user asked for it", () => {
  const reply = buildDraftReply({
    userMessage: "looks good, write it",
    draftPreference: "balanced",
    isEdit: false,
    issuesFixed: ["Trimmed to fit the 280-char X limit."],
  });

  assert.equal(/trimmed|tightened|shortened|kept it tight/i.test(reply), false);
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

test("trim-specific handoff still appears when the user explicitly asks for a shorter draft", () => {
  const reply = buildDraftReply({
    userMessage: "make it shorter",
    draftPreference: "voice_first",
    isEdit: false,
    issuesFixed: ["Trimmed to fit the 280-char X limit."],
  });

  assert.equal(/trimmed|tightened|shortened/i.test(reply), true);
  assert.equal(/\?/.test(reply), true);
});

test("edit handoff does not imply trimming when the user asked for a longer draft", () => {
  const reply = buildDraftReply({
    userMessage: "make it longer and more detailed",
    draftPreference: "voice_first",
    isEdit: true,
    issuesFixed: ["Trimmed to fit the 280-char X limit."],
    revisionChangeKind: "length_expand",
  });

  assert.equal(/trimmed|tightened|shortened/i.test(reply), false);
  assert.equal(/longer|detail|fuller|opened it up/i.test(reply), true);
  assert.equal(/\?/.test(reply), true);
});

test("edit handoff uses specificity language for less-generic revision requests", () => {
  const reply = buildDraftReply({
    userMessage: "make it more specific and less generic",
    draftPreference: "balanced",
    isEdit: true,
    issuesFixed: [],
    revisionChangeKind: "specificity_tune",
  });

  assert.equal(/trimmed|tightened it up so it reads fast|shortened/i.test(reply), false);
  assert.equal(/specific|clearer|sharpened|less generic/i.test(reply), true);
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
  assert.equal(/for you|here's one take/i.test(reply), false);
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

  assert.equal(/want any tweaks|want me to tune|want me to adjust/i.test(reply), true);
  assert.equal(/\?/.test(reply), true);
});

test("draft handoff does not mislabel factual clarification answers as edits", () => {
  const reply = buildDraftReply({
    userMessage: "it rewrites replies in my voice and helps me ship posts faster",
    draftPreference: "voice_first",
    isEdit: false,
    issuesFixed: [],
  });

  assert.equal(/updated it|made the edit|reworked it/i.test(reply), false);
  assert.equal(/drafted|put together|ran with|kept this/i.test(reply), true);
  assert.equal(/for you|here's one take/i.test(reply), false);
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
    /pick one and i'll draft it|want one drafted|which one should i draft first|if one works, i'll draft it/i.test(
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
    /change direction|different angle|more in this lane|stay on this theme/i.test(
      reply,
    ),
    true,
  );
});

test("ideation reply rewrites stilted intros into natural first-pass lead", () => {
  const reply = buildIdeationReply({
    intro:
      "noticed you keep riffing on the LinkedIn-to-X tension and the ampm vibe.",
    close: "which angle do you want to flesh out first?",
    userMessage: "give me post ideas",
    styleCard: null,
  });

  assert.equal(/noticed you|riffing|culture clash|play to your/i.test(reply), false);
  assert.equal(/sounds good|for sure|nice|cool/i.test(reply), false);
  assert.equal(
    /pick one and i'll draft it|want one drafted|which one should i draft first|if one works, i'll draft it/i.test(
      reply,
    ),
    true,
  );
});

test("ideation reply rewrites intros that drift from actual angle themes", () => {
  const reply = buildIdeationReply({
    intro:
      "saw your ampm vs irl tweet - people love the contrast. let's spin that into content that shows off xpo's magic.",
    close: "which angle do you want to flesh out first?",
    userMessage: "give me post ideas",
    angleTitles: [
      "what's the biggest tone shift when a linkedin post becomes an x post?",
      "what gets lost when you convert a linkedin post to x?",
      "how do you keep tone consistent between linkedin and x?",
    ],
    styleCard: null,
  });

  assert.equal(
    /saw your|people love|let's spin that into|xpo's magic/i.test(reply),
    false,
  );
  assert.equal(/sounds good|for sure|nice|cool/i.test(reply), false);
});

test("ideation reply keeps natural aligned intros", () => {
  const reply = buildIdeationReply({
    intro: "here are a few linkedin-to-x angles based on what you've been exploring.",
    close: "which angle do you want to flesh out first?",
    userMessage: "give me post ideas",
    angleTitles: [
      "what's the biggest tone shift when a linkedin post becomes an x post?",
      "what gets lost when you convert a linkedin post to x?",
    ],
    styleCard: null,
  });

  assert.equal(
    reply.toLowerCase().includes("here are a few linkedin-to-x angles"),
    true,
  );
});

test("ideation reply humanizes 'here are some angles' phrasing", () => {
  const reply = buildIdeationReply({
    intro: "here are some angles based on your recent posts.",
    close: "which angle do you want to flesh out first?",
    userMessage: "give me post ideas",
    styleCard: null,
  });

  assert.equal(reply.toLowerCase().includes("here are some angles"), false);
  assert.equal(
    reply.toLowerCase().includes("here are some ideas i thought of"),
    true,
  );
});

test("bare post draft ideation reply names post directions clearly", () => {
  const reply = buildIdeationReply({
    intro: "based on what i know, there are a few lanes this could take.",
    close: "which angle do you want to flesh out first?",
    userMessage: "write a post",
    styleCard: null,
    primaryAngleChipMode: true,
  });

  assert.equal(reply.includes("post directions"), true);
  assert.equal(reply === reply.toLowerCase(), false);
  assert.equal(
    /pick the one you want|choose one and i'll turn it into a draft|if one clicks, i'll write it out/i.test(
      reply,
    ),
    true,
  );
  assert.equal(reply.toLowerCase().includes("three post directions"), false);
  assert.equal(reply.toLowerCase().includes("pick one and i'll draft it"), false);
});

test("bare thread draft ideation reply names thread directions clearly", () => {
  const reply = buildIdeationReply({
    intro: "based on what i know, there are a few lanes this could take.",
    close: "which angle do you want to flesh out first?",
    userMessage: "write a thread",
    styleCard: null,
    primaryAngleChipMode: true,
  });

  assert.equal(reply.includes("thread directions"), true);
  assert.equal(reply === reply.toLowerCase(), false);
});

test("bare ideation shell copy stays sentence-cased even when the style card prefers lowercase", () => {
  const reply = buildIdeationReply({
    intro: "based on what i know, there are a few lanes this could take.",
    close: "which angle do you want to flesh out first?",
    userMessage: "write a post",
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
    primaryAngleChipMode: true,
  });

  assert.equal(reply.includes("post directions"), true);
  assert.equal(reply === reply.toLowerCase(), false);
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

test("source transparency does not treat style memory as factual evidence", () => {
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
  assert.equal(
    reply?.toLowerCase().includes("didn't come from anything you explicitly said earlier in this chat"),
    true,
  );
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
    reply?.toLowerCase().includes("didn't come from anything you explicitly said earlier in this chat"),
    true,
  );
});

test("source transparency works without active draft when reference text is provided", () => {
  const reply = inferSourceTransparencyReply({
    userMessage: "where did that come from?",
    activeDraft: null,
    referenceText: "linkedin to x conversion tone shift",
    recentHistory: [
      "user: give me post ideas",
      "assistant: here are some options",
      "user: i keep turning linkedin posts into x posts",
    ].join("\n"),
    contextAnchors: [],
  });

  assert.equal(typeof reply, "string");
  assert.equal(/prior message|earlier in this chat/i.test(reply || ""), true);
});

test("ideation rationale reply explains selection from recent angles", () => {
  const reply = inferIdeationRationaleReply({
    userMessage: "why did you choose these and how?",
    topicSummary: "linkedin to x",
    recentHistory: [
      "assistant_angles:",
      "1. how does the tone shift when you move a linkedin post to x?",
      "2. what gets lost when you convert a linkedin post to x?",
    ].join("\n"),
    lastIdeationAngles: [],
  });

  assert.equal(typeof reply, "string");
  assert.equal(
    /i chose them|grounding it in the ideas right above/i.test(reply || ""),
    true,
  );
});

test("post reference reply avoids fake specific post claims", () => {
  const reply = inferPostReferenceReply({
    userMessage: "which post are you referring to?",
    recentHistory: [
      "assistant: i was talking about your vibe post",
      "user: what does that mean",
    ].join("\n"),
  });

  assert.equal(typeof reply, "string");
  assert.equal(
    /wasn't referring to a specific post|wasn't pointing to a specific post|not pointing to a specific post/i.test(
      reply || "",
    ),
    true,
  );
});

test("post reference reply can point to synced historical posts when available", () => {
  const reply = inferPostReferenceReply({
    userMessage: "which post are you referring to?",
    recentHistory: "assistant: your recent posts already show the lane shift",
    historicalPostAnchors: [
      "i stopped writing broad growth takes and started posting tighter product lessons",
      "the newer posts are simpler, sharper, and easier to build on",
    ],
  });

  assert.equal(typeof reply, "string");
  assert.equal(reply?.toLowerCase().includes("synced post history"), true);
});

test("source transparency can cite synced posts when chat history is not the source", () => {
  const reply = inferSourceTransparencyReply({
    userMessage: "how do you understand me then?",
    activeDraft: null,
    recentHistory: [
      "user: analyze my newest posts",
      "assistant: send me the text of the posts you want analyzed.",
    ].join("\n"),
    contextAnchors: [],
    historicalPostAnchors: [
      "i stopped chasing broad audience growth and started writing about what i am actually building",
      "my newer posts are tighter because i finally know the lane i want to own",
    ],
  });

  assert.equal(typeof reply, "string");
  assert.equal(reply?.toLowerCase().includes("attached x account"), true);
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

test("confusion ping detector catches short disbelief replies", () => {
  assert.equal(looksLikeConfusionPing("what"), true);
  assert.equal(looksLikeConfusionPing("what??"), true);
  assert.equal(looksLikeConfusionPing("huh"), true);
  assert.equal(looksLikeConfusionPing("i explained it though"), true);
  assert.equal(looksLikeConfusionPing("i already explained it"), true);
  assert.equal(looksLikeConfusionPing("what should i post"), false);
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

test("feedback memory notice can be suppressed for dispute turns", () => {
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
    rememberedFactCount: 1,
    rememberedAntiPattern: false,
    suppress: true,
  });

  assert.equal(notice, null);
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

test("reviser prompt includes dedicated trim guidance", () => {
  const source = readFileSync(
    fileURLToPath(new URL("./agents/reviser.ts", import.meta.url)),
    "utf8",
  );

  assert.match(source, /LENGTH TRIM MODE:/);
  assert.match(
    source,
    /compress it into exactly one standalone post instead of returning a lightly shortened near-duplicate/i,
  );
});

test("reviser prompt includes thread-local revision guidance", () => {
  const source = readFileSync(
    fileURLToPath(new URL("./agents/reviser.ts", import.meta.url)),
    "utf8",
  );

  assert.match(source, /THREAD-LOCAL REVISION MODE:/);
  assert.match(source, /Return exactly .* not the whole thread/i);
});

test("draft revision normalizer recognizes style nudges like less linkedin", () => {
  const directive = normalizeDraftRevisionInstruction(
    "less linkedin",
    "shipping updates should not read like a corporate announcement",
  );

  assert.equal(directive.changeKind, "tone_shift");
  assert.match(directive.instruction, /adjust the tone of the current draft/i);
});

test("draft revision normalizer recognizes expansion requests", () => {
  const directive = normalizeDraftRevisionInstruction(
    "make it longer and more detailed",
    "been in a rabbit hole this week learning how to grow on x",
  );

  assert.equal(directive.changeKind, "length_expand");
  assert.match(directive.instruction, /expand the current draft/i);
  assert.match(directive.instruction, /only elaborating with details that are already grounded/i);
});

test("draft revision normalizer recognizes specificity requests", () => {
  const directive = normalizeDraftRevisionInstruction(
    "make it more specific and less generic",
    "xpo helps people write and grow faster on x",
  );

  assert.equal(directive.changeKind, "specificity_tune");
  assert.match(directive.instruction, /more specific and less generic/i);
  assert.match(directive.instruction, /details already present/i);
});

test("draft revision normalizer treats 'clean this up' as a tone shift", () => {
  const directive = normalizeDraftRevisionInstruction(
    "clean this up",
    "a rough draft that gets the point across but sounds clunky",
  );

  assert.equal(directive.changeKind, "tone_shift");
  assert.match(directive.instruction, /adjust the tone of the current draft/i);
});

test("draft revision normalizer treats thread conversion as a full rewrite", () => {
  const directive = normalizeDraftRevisionInstruction(
    "turn into thread",
    "momentum feels good. progress survives pressure.",
  );

  assert.equal(directive.changeKind, "full_rewrite");
  assert.equal(directive.targetFormat, "thread");
  assert.equal(directive.scope, "whole_draft");
  assert.equal(directive.instruction, buildThreadConversionPrompt());
});

test("draft revision normalizer keeps explicit thread conversion requests on thread format", () => {
  const directive = normalizeDraftRevisionInstruction(
    "turn this into a thread with 4 to 6 posts. keep every post under 25,000 characters.",
    "momentum feels good. progress survives pressure.",
  );

  assert.equal(directive.changeKind, "full_rewrite");
  assert.equal(directive.targetFormat, "thread");
  assert.equal(directive.instruction, buildThreadConversionPrompt());
});

test("draft revision normalizer treats shortform conversion as a full rewrite", () => {
  const directive = normalizeDraftRevisionInstruction(
    "turn this into a shortform post under 280 characters",
    "a longer multi-paragraph draft that needs to become one tight post",
  );

  assert.equal(directive.changeKind, "full_rewrite");
  assert.equal(directive.targetFormat, "shortform");
  assert.equal(directive.scope, "whole_draft");
  assert.match(directive.instruction, /exactly one standalone x post under 280 weighted characters/i);
  assert.match(directive.instruction, /preserve the core idea and strongest proof/i);
  assert.match(directive.instruction, /do not use thread separators, post labels, or multi-post structure/i);
});

test("draft revision normalizer turns thread collapse requests into longform single-post rewrites for verified limits", () => {
  const directive = normalizeDraftRevisionInstruction(
    "Collapse this thread into one standalone X post",
    "Hook\n\n---\n\nProof\n\n---\n\nCTA",
    undefined,
    25_000,
  );

  assert.equal(directive.changeKind, "full_rewrite");
  assert.equal(directive.targetFormat, "longform");
  assert.equal(directive.scope, "whole_draft");
  assert.match(directive.instruction, /exactly one standalone x post under 25,000 weighted characters/i);
  assert.match(directive.instruction, /collapse the thread into one coherent longform version/i);
});

test("draft revision normalizer keeps thread collapse requests shortform for unverified limits", () => {
  const directive = normalizeDraftRevisionInstruction(
    "Collapse this thread into one standalone X post",
    "Hook\n\n---\n\nProof\n\n---\n\nCTA",
    undefined,
    280,
  );

  assert.equal(directive.changeKind, "full_rewrite");
  assert.equal(directive.targetFormat, "shortform");
  assert.equal(directive.scope, "whole_draft");
  assert.match(directive.instruction, /exactly one standalone x post under 280 weighted characters/i);
  assert.match(directive.instruction, /compress it aggressively into a clean shortform version/i);
});

test("thread revision normalizer targets the ending span for stronger ending CTA requests", () => {
  const directive = normalizeDraftRevisionInstruction(
    "Stronger ending CTA",
    "Hook\n\n---\n\nProof\n\n---\n\nDetail\n\n---\n\nSetup close\n\n---\n\nOld CTA",
  );

  assert.equal(directive.scope, "thread_span");
  assert.deepEqual(directive.targetSpan, {
    startIndex: 3,
    endIndex: 4,
  });
  assert.equal(directive.targetFormat, null);
  assert.equal(directive.threadIntent, "ending");
  assert.equal(directive.preserveThreadStructure, true);
});

test("thread revision normalizer targets an explicit post reference", () => {
  const directive = normalizeDraftRevisionInstruction(
    "rewrite post 3 to sound more direct",
    "Hook\n\n---\n\nProof\n\n---\n\nMiddle\n\n---\n\nClose",
  );

  assert.equal(directive.scope, "thread_span");
  assert.deepEqual(directive.targetSpan, {
    startIndex: 2,
    endIndex: 2,
  });
  assert.equal(directive.threadIntent, "explicit_post");
});

test("thread revision normalizer targets the opener when the user asks to fix the hook", () => {
  const directive = normalizeDraftRevisionInstruction(
    "fix the hook",
    "Weak opener\n\n---\n\nProof\n\n---\n\nPayoff",
  );

  assert.equal(directive.scope, "thread_span");
  assert.deepEqual(directive.targetSpan, {
    startIndex: 0,
    endIndex: 0,
  });
  assert.equal(directive.threadIntent, "opening");
});

test("thread revision normalizer asks for clarification on ambiguous thread notes without focus", () => {
  const directive = normalizeDraftRevisionInstruction(
    "make it better",
    "Hook\n\n---\n\nProof\n\n---\n\nClose",
  );

  assert.equal(directive.scope, "thread_span");
  assert.equal(directive.targetSpan, null);
  assert.equal(directive.threadIntent, null);
  assert.equal(directive.preserveThreadStructure, true);
});

test("anti-pattern helpers separate mechanical edits from tonal rejection", () => {
  assert.equal(looksLikeMechanicalEdit("remove commas and fix punctuation"), true);
  assert.equal(looksLikeNegativeFeedback("this sounds like linkedin"), true);
  assert.equal(looksLikeNegativeFeedback("this is way too formal"), true);
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
    factualContext: ["taiv is a real interview checkpoint"],
    voiceContextHints: ["likes candid internship reflections"],
    activeConstraints: ["Correction lock: taiv requested an interview"],
  });

  assert.equal(relevant[0], "taiv requested an interview and now the internship hunt is real");

  const effectiveContext = buildEffectiveContext({
    recentHistory: "user: make it shorter\nassistant: here's a tighter version.",
    rollingSummary: "Current topic: internship hunt",
    relevantTopicAnchors: relevant,
    factualContext: ["taiv is a real interview checkpoint"],
    voiceContextHints: ["likes candid internship reflections"],
    activeConstraints: ["Correction lock: taiv requested an interview"],
  });

  assert.match(effectiveContext, /FACTS YOU ALREADY KNOW:/);
  assert.match(effectiveContext, /taiv is a real interview checkpoint/);
  assert.match(effectiveContext, /taiv requested an interview/);
  assert.match(effectiveContext, /VOICE \/ TERRITORY HINTS \(NOT FACTS\):/);
  assert.match(effectiveContext, /likes candid internship reflections/);
});

test("fact-safe reference hints replace raw topic anchors in strict factual turns", () => {
  const hints = buildFactSafeReferenceHints({
    lane: "original",
    formatPreference: "shortform",
  });

  assert.equal(hints.length >= 3, true);
  assert.equal(
    hints.some((hint) => /cadence, structure, and thematic fit/i.test(hint)),
    true,
  );

  const effectiveContext = buildEffectiveContext({
    recentHistory: "user: write me a post about stanley",
    rollingSummary: null,
    relevantTopicAnchors: hints,
    referenceLabel: "REFERENCE HINTS",
    factualContext: [],
    voiceContextHints: [],
    activeConstraints: ["Topic grounding: stanley helps people write and grow faster on x"],
  });

  assert.match(effectiveContext, /REFERENCE HINTS:/);
  assert.doesNotMatch(effectiveContext, /RELEVANT TOPIC ANCHORS:/);
  assert.match(effectiveContext, /Do not import older anecdotes, mechanics, timelines, or metrics/i);
});

test("rolling summary refresh cadence stays stable", () => {
  assert.equal(shouldRefreshRollingSummary(0, false), false);
  assert.equal(shouldRefreshRollingSummary(3, false), true);
  assert.equal(shouldRefreshRollingSummary(4, false), false);
  assert.equal(shouldRefreshRollingSummary(1, true), true);
});
