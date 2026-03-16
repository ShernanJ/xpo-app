import type { VoiceStyleCard } from "../../lib/agent-v2/core/styleProfile";
import type { TranscriptReplayFixture } from "../lib/creator-transcript-replay";

const bluntStyleCard: VoiceStyleCard = {
  sentenceOpenings: ["i", "most people", "if you're"],
  sentenceClosers: ["that's the point.", "that's it."],
  pacing: "short, blunt, scan-friendly",
  emojiPatterns: [],
  slangAndVocabulary: ["builder", "tight", "forced", "post-ready"],
  formattingRules: ["prefer lowercase", "keep sentences tight"],
  customGuidelines: ["keep it direct", "no fluff", "no emojis"],
  contextAnchors: [
    "the user wants help growing on x",
    "the assistant should write in a natural, blunt style",
  ],
  factLedger: {
    durableFacts: [],
    allowedFirstPersonClaims: [],
    allowedNumbers: [],
    forbiddenClaims: [],
    sourceMaterials: [],
  },
  antiExamples: [],
};

export const CREATOR_TRANSCRIPT_FIXTURES: TranscriptReplayFixture[] = [
  {
    id: "growth-draft-command-clarification-loop",
    title: "Growth Draft Command Clarification Loop",
    description:
      "Checks that mixed draft-plus-growth asks never collapse into a capability blurb and that follow-up draft commands do not get stored as fake topics.",
    xHandle: "shernanjavier",
    styleCard: bluntStyleCard,
    turns: [
      {
        role: "user",
        message: "write me a post to help me grow",
      },
      {
        role: "user",
        message: "yes write me a post",
      },
    ],
  },
  {
    id: "pending-plan-draft-command",
    title: "Pending Plan Draft Command",
    description:
      "Checks that approval-style commands like 'this works. draft this version.' consume the pending plan and go straight to draft delivery.",
    xHandle: "shernanjavier",
    styleCard: bluntStyleCard,
    initialMemory: {
      topicSummary: "onboarding mistakes early-stage founders keep making",
      activeConstraints: ["no emojis"],
      conversationState: "plan_pending_approval",
      concreteAnswerCount: 1,
      assistantTurnCount: 1,
      pendingPlan: {
        objective: "onboarding mistakes early-stage founders keep making",
        angle: "call out the mistakes directly and keep it tight",
        targetLane: "original",
        mustInclude: ["early-stage founders", "onboarding mistakes"],
        mustAvoid: ["generic platitudes"],
        hookType: "direct",
        pitchResponse: "this angle is tight",
        formatPreference: "shortform",
      },
      formatPreference: "shortform",
    },
    turns: [
      {
        role: "assistant",
        message: "this angle is tight.\n\nif this direction works, i'll write it from here.",
      },
      {
        role: "user",
        message: "this works. draft this version.",
      },
    ],
  },
  {
    id: "xpo-correction-loop",
    title: "XPO Correction Loop",
    description:
      "Checks that factual product corrections clear the bad plan, create correction locks, and stop turning corrections into ideation prompts.",
    xHandle: "shernanjavier",
    styleCard: bluntStyleCard,
    initialMemory: {
      topicSummary: "xpo",
      conversationState: "plan_pending_approval",
      concreteAnswerCount: 1,
      assistantTurnCount: 1,
      pendingPlan: {
        objective: "write a post about xpo",
        angle: "treat xpo like a hashtag engine at a meetup",
        targetLane: "original",
        mustInclude: ["hashtags", "conference panel"],
        mustAvoid: [],
        hookType: "contrarian",
        pitchResponse: "run with this angle",
        formatPreference: "shortform",
      },
      formatPreference: "shortform",
    },
    turns: [
      {
        role: "assistant",
        message:
          "most people treat xpo like a meetup. the real value is the live hashtag data it generates. if that's the angle, i'll draft it.",
      },
      {
        role: "user",
        message: "xpo is not that though, its a x growth/content engine",
      },
      {
        role: "user",
        message: "but xpo doesn't generate hashtags",
      },
      {
        role: "user",
        message: "thats not a pain point, i was correcting you",
      },
    ],
  },
  {
    id: "xpo-correction-then-redraft",
    title: "XPO Correction Then Redraft",
    description:
      "Checks that a saved product correction gets reused on the next draft request instead of asking again or drifting back to the bad assumption.",
    xHandle: "shernanjavier",
    styleCard: bluntStyleCard,
    initialMemory: {
      topicSummary: "xpo",
      activeConstraints: [
        "Correction lock: xpo is a x growth/content engine",
        "Correction lock: xpo doesn't generate hashtags",
      ],
      conversationState: "needs_more_context",
      concreteAnswerCount: 1,
      assistantTurnCount: 2,
      formatPreference: "shortform",
    },
    turns: [
      {
        role: "user",
        message: "write me a post about xpo",
      },
    ],
  },
  {
    id: "direct-draft-first-turn",
    title: "Direct Draft First Turn",
    description:
      "Checks that a self-contained draft ask goes straight to draft delivery instead of a visible planning step.",
    xHandle: "shernanjavier",
    styleCard: bluntStyleCard,
    turns: [
      {
        role: "user",
        message: "write one about onboarding mistakes early-stage founders keep making",
      },
    ],
  },
  {
    id: "thread-playbook-direct-draft",
    title: "Thread Playbook Direct Draft",
    description:
      "Checks that a direct thread ask stays a thread and uses a specific keyword CTA when offering a playbook PDF.",
    xHandle: "vitddnv",
    styleCard: bluntStyleCard,
    turns: [
      {
        role: "user",
        message:
          "write me a thread about the hiring filter that kept our team lean while scaling. mention the hiring playbook pdf.",
      },
    ],
  },
  {
    id: "profile-summary-uses-synced-context",
    title: "Profile Summary Uses Synced Context",
    description:
      "Checks that profile-summary asks use synced workspace profile data and recent posts instead of asking the user to restate their background.",
    xHandle: "shernanjavier",
    styleCard: bluntStyleCard,
    onboarding: {
      stage: "0-1k",
      goal: "authority",
      profile: {
        name: "shernan",
        username: "shernanjavier",
        bio: "building xpo. helping builders turn ideas into posts that actually ship.",
        followersCount: 1840,
        followingCount: 410,
        createdAt: "2022-01-01T00:00:00.000Z",
      },
      pinnedPost:
        "xpo helps turn rough notes into x posts and replies without losing your actual voice.",
      recentPosts: [
        "i stopped treating every post like a launch and started posting the proof while i build.",
        "generic ai copy usually comes from weak retrieval, not weak models.",
        "the real unlock was narrowing the lane before trying to scale output.",
      ],
    },
    topicAnchors: [
      "i stopped treating every post like a launch and started posting the proof while i build.",
      "generic ai copy usually comes from weak retrieval, not weak models.",
    ],
    turns: [
      {
        role: "user",
        message: "write a summary about my profile",
      },
    ],
  },
  {
    id: "profile-strongest-post-follow-up",
    title: "Profile Strongest Post Follow-Up",
    description:
      "Checks that best-post follow-ups use synced engagement data and render as a short opener plus analytics bullets.",
    xHandle: "shernanjavier",
    styleCard: bluntStyleCard,
    onboarding: {
      stage: "1k-10k",
      goal: "followers",
      profile: {
        name: "Vitalii Dodonov",
        username: "vitdny",
        bio: "startup builder sharing operator lessons, hiring notes, and the systems behind lean teams.",
        followersCount: 9400,
        followingCount: 620,
        createdAt: "2023-01-01T00:00:00.000Z",
      },
      recentPosts: [
        {
          text: "Engineers think OpenClaw is about speed. What it really bought us was leverage across the whole team.",
          createdAt: "2026-03-12T12:00:00.000Z",
          metrics: {
            likeCount: 40000,
            replyCount: 2600,
            repostCount: 1200,
            quoteCount: 200,
          },
        },
        {
          text: "The hiring mistake most founders repeat is over-indexing on pedigree instead of ownership.",
          createdAt: "2026-03-08T12:00:00.000Z",
          metrics: {
            likeCount: 4000,
            replyCount: 250,
            repostCount: 120,
            quoteCount: 30,
          },
        },
        {
          text: "Good cofounder communication is less about alignment decks and more about surfacing friction early.",
          createdAt: "2026-03-01T12:00:00.000Z",
          metrics: {
            likeCount: 2900,
            replyCount: 180,
            repostCount: 90,
            quoteCount: 20,
          },
        },
      ],
    },
    turns: [
      {
        role: "user",
        message: "what performed best recently?",
      },
    ],
  },
  {
    id: "vague-product-one-question",
    title: "Vague Product One Question",
    description:
      "Checks that a vague product draft ask triggers one useful clarification, then drafts after the user answers.",
    xHandle: "shernanjavier",
    styleCard: bluntStyleCard,
    turns: [
      {
        role: "user",
        message: "write a post about my extension for stanley",
      },
      {
        role: "user",
        message: "it rewrites replies in my voice and helps me ship posts way faster",
      },
    ],
  },
  {
    id: "opaque-entity-one-question",
    title: "Opaque Entity One Question",
    description:
      "Checks that a bare named entity like XPO triggers one definition question before drafting instead of inventing what the product does.",
    xHandle: "shernanjavier",
    styleCard: bluntStyleCard,
    turns: [
      {
        role: "user",
        message: "can you write me a post about xpo",
      },
      {
        role: "user",
        message: "it helps people write and grow faster on x without the mental load",
      },
    ],
  },
  {
    id: "casual-opening-to-help-offer",
    title: "Casual Opening To Help Offer",
    description:
      "Checks that small talk stays casual and resolves into a generic help offer instead of a random discovery question.",
    xHandle: "shernanjavier",
    styleCard: bluntStyleCard,
    turns: [
      { role: "user", message: "hi how are you" },
      { role: "user", message: "vibing" },
      { role: "user", message: "help me grow on x" },
    ],
  },
  {
    id: "draft-revision-meaning-loop",
    title: "Draft Revision Meaning Loop",
    description:
      "Checks that a draft can be revised from reaction-style feedback and that draft-meaning pushback stays blunt instead of inventing a rationale.",
    xHandle: "shernanjavier",
    styleCard: bluntStyleCard,
    turns: [
      {
        role: "user",
        message: "write one about onboarding mistakes early-stage founders keep making",
      },
      {
        role: "user",
        message: "that feels forced",
      },
      {
        role: "user",
        message: "what does this even mean?",
      },
    ],
  },
  {
    id: "stan-office-league-story",
    title: "Stan Office League Story",
    description:
      "Replays the league-at-the-office anecdote flow to catch drift into made-up growth mechanics or fake provenance.",
    xHandle: "shernanjavier",
    styleCard: bluntStyleCard,
    historicalPosts: [
      "most writing advice makes people sound like interns. tighter wins.",
      "x growth gets easier when you stop treating every post like a launch.",
    ],
    turns: [
      { role: "user", message: "hi how are you" },
      { role: "user", message: "vibing" },
      { role: "user", message: "how do i make u sound more human" },
      {
        role: "user",
        message:
          "can you write me a post on playing league at the stan office against the ceo and losing hard",
      },
      { role: "user", message: "this works. draft this version." },
      { role: "user", message: "what does this post even mean?" },
      { role: "user", message: "where did you get that from" },
    ],
  },
];
