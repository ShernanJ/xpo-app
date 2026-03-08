export const IDEATION_COMMAND_FIXTURES = [
  {
    input: "give me post ideas",
    shouldBeIdeationCommand: true,
  },
  {
    input: "give me more post ideas",
    shouldBeIdeationCommand: true,
  },
  {
    input: "give me more ideas",
    shouldBeIdeationCommand: true,
  },
  {
    input: "try again",
    shouldBeIdeationCommand: true,
  },
  {
    input: "give me another set of ideas",
    shouldBeIdeationCommand: true,
  },
  {
    input: "what should i post today",
    shouldBeIdeationCommand: true,
  },
  {
    input: "what do i post today",
    shouldBeIdeationCommand: true,
  },
  {
    input: "what should i post on x",
    shouldBeIdeationCommand: true,
  },
  {
    input: "what should i tweet today",
    shouldBeIdeationCommand: true,
  },
  {
    input: "give me more post ideas about onboarding",
    shouldBeIdeationCommand: false,
  },
] as const;

export const IDEATION_REPLY_FIXTURES = [
  {
    userMessage: "give me more ideas",
    intro:
      "gotcha, you want more angles that riff on the linkedin-to-x tension.",
    close: "which angle do you want to flesh out first?",
    mustIncludeAny: [
      "more ideas",
      "fresh batch of ideas",
      "more options",
    ],
    mustIncludeSwitchCue: [
      "switch it up",
      "change it up",
      "different direction",
      "change direction",
      "stick with this theme",
      "stay on this theme",
      "stay with this angle",
    ],
    mustNotInclude: ["which angle do you want to flesh out first"],
  },
] as const;

export const ANGLE_NOVELTY_FIXTURES = [
  {
    focusTopic: "linkedin to x posts",
    recentHistory: [
      "assistant: 1.",
      "how does turning a linkedin post into an x post change the story you tell?",
      "assistant: 2.",
      "what's the biggest tone shift when you turn a linkedin post into an x post?",
    ].join("\n"),
    seed: "try again",
    inputAngles: [
      {
        title:
          "how does turning a linkedin post into an x post change the story you tell?",
        why_this_works: "test",
        opening_lines: [],
        subtopics: [],
      },
      {
        title:
          "what's the biggest tone shift when you turn a linkedin post into an x post?",
        why_this_works: "test",
        opening_lines: [],
        subtopics: [],
      },
    ],
  },
] as const;

export const NATURAL_REPAIR_FIXTURES = [
  {
    kind: "rationale",
    userMessage: "why did you choose these and how?",
    topicSummary: "linkedin to x",
    recentHistory: [
      "assistant_angles:",
      "1. how does the tone shift when you move a linkedin post to x?",
      "2. what do people get wrong about this?",
      "3. which part of your drafting workflow feels most lost when you copy-paste from linkedin?",
    ].join("\n"),
  },
  {
    kind: "post_reference",
    userMessage: "which post are you referring to?",
    recentHistory: [
      "assistant: i was talking about the vibe post",
      "user: how does that relate",
    ].join("\n"),
  },
  {
    kind: "confusion_ping",
    userMessage: "what",
    recentHistory: "",
  },
] as const;
