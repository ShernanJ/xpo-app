export const LIVE_ASSISTANT_EVAL_FIXTURES = [
  {
    category: "continuity",
    name: "stored active draft stays in scope for short follow-up edits",
    activeDraftRef: {
      messageId: "assistant_msg_1",
      versionId: "draft_v2",
    },
    history: [
      {
        id: "assistant_msg_1",
        role: "assistant",
        content: "here's the latest version",
        data: {
          assistant_context_v2: {
            contextPacket: {
              draftRef: {
                activeDraftVersionId: "draft_v2",
                excerpt: "xpo helps turn rough ideas into posts you can actually ship.",
                revisionChainId: "chain_1",
              },
            },
          },
          draftVersions: [
            {
              id: "draft_v1",
              content: "old draft",
            },
            {
              id: "draft_v2",
              content: "xpo helps turn rough ideas into posts you can actually ship.",
            },
          ],
        },
      },
      {
        role: "user",
        content: "make that punchier",
      },
    ],
    followUpMessage: "make that punchier",
    controllerMemory: {
      conversationState: "drafting",
      topicSummary: "xpo launch",
      hasPendingPlan: false,
      hasActiveDraft: true,
      unresolvedQuestion: null,
      concreteAnswerCount: 1,
      pendingPlanSummary: null,
      latestRefinementInstruction: null,
      lastIdeationAngles: [],
    },
    expectedActiveDraft: "xpo helps turn rough ideas into posts you can actually ship.",
    expectedAction: "revise",
  },
  {
    category: "controller",
    name: "direct comparison questions are not hijacked by artifact heuristics",
    userMessage: "what changed between option 1 and option 2?",
    controllerMemory: {
      conversationState: "ready_to_ideate",
      topicSummary: "xpo positioning",
      hasPendingPlan: false,
      hasActiveDraft: false,
      unresolvedQuestion: null,
      concreteAnswerCount: 0,
      pendingPlanSummary: null,
      latestRefinementInstruction: null,
      lastIdeationAngles: [
        "why context loss makes ai feel generic",
        "why brittle routing kills continuity",
      ],
    },
    expectedAction: null,
  },
  {
    category: "grounding",
    name: "first-pass drafts reject invented product usage and mechanics",
    activeConstraints: [
      "Topic grounding: Xpo helps users repurpose existing ideas into X posts and replies.",
    ],
    sourceUserMessage: "write a post about xpo",
    draft:
      "i built xpo to scan engagement timing, handle the rest, and remove the mental load from posting.",
    expectedReasonPattern: /invented first-person product usage|adjacent product mechanics/i,
  },
  {
    category: "revision",
    name: "expansion and specificity edits stay local and grounded",
    activeDraft: "xpo helps turn rough ideas into posts you can actually ship.",
    expansionMessage: "make it longer and more detailed",
    specificityMessage: "make it more specific",
  },
] as const;
