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
  antiExamples: [],
};

export const CREATOR_TRANSCRIPT_FIXTURES: TranscriptReplayFixture[] = [
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
