import type { CreatorAgentContext } from "@/lib/onboarding/strategy/agentContext";
import type { RecommendedPlaybookSummary } from "@/lib/agent-v2/orchestrator/conversationalDiagnostics";

export type PlaybookStageKey = "0-1k" | "1k-10k" | "10k-50k" | "50k+";
export type PlaybookTemplateTab = "hook" | "reply" | "thread" | "cta";

export interface PlaybookTemplate {
  id: string;
  label: string;
  text: string;
}

export interface PlaybookDefinition {
  id: string;
  name: string;
  outcome: string;
  whenItWorks: string;
  difficulty: string;
  timePerDay: string;
  bestFor: string[];
  loop: {
    input: string;
    action: string;
    feedback: string;
  };
  checklist: {
    daily: string[];
    weekly: string[];
  };
  templates: PlaybookTemplate[];
  metrics: string[];
  rationale: string;
  mistakes: string[];
  examples: string[];
  quickStart: string[];
}

export interface PlaybookStageMeta {
  label: string;
  highlight: string;
  winCondition: string;
  bottleneck: string;
  priorities: string[];
  contentMix: {
    replies: number;
    posts: number;
    threads: number;
  };
}

export interface PlaybookRecommendation {
  stage: PlaybookStageKey;
  playbook: PlaybookDefinition;
  score: number;
  whyFit: string;
}

export const PLAYBOOK_STAGE_ORDER: PlaybookStageKey[] = ["0-1k", "1k-10k", "10k-50k", "50k+"];

export const PLAYBOOK_STAGE_META: Record<PlaybookStageKey, PlaybookStageMeta> = {
  "0-1k": {
    label: "0→1k",
    highlight: "discovery + reps",
    winCondition: "win by getting discovered consistently and learning fast.",
    bottleneck: "your bottleneck is discovery. the win condition is consistent impressions from replies and proof posts.",
    priorities: ["discovery", "consistency", "proof"],
    contentMix: { replies: 60, posts: 30, threads: 10 },
  },
  "1k-10k": {
    label: "1k→10k",
    highlight: "consistent format + clear topic",
    winCondition: "win by becoming known for one clear topic.",
    bottleneck: "your bottleneck is clarity. people should quickly understand what you post about.",
    priorities: ["positioning", "formats", "proof"],
    contentMix: { replies: 40, posts: 40, threads: 20 },
  },
  "10k-50k": {
    label: "10k→50k",
    highlight: "distribution + collabs",
    winCondition: "win by getting your best posts seen through smart collaboration.",
    bottleneck: "your bottleneck is reach. focus on distribution and collaboration, not more generic posts.",
    priorities: ["distribution", "collabs", "systems"],
    contentMix: { replies: 35, posts: 35, threads: 30 },
  },
  "50k+": {
    label: "50k+",
    highlight: "systems + leverage",
    winCondition: "win by turning trust into leverage without losing signal.",
    bottleneck: "your bottleneck is leverage and trust maintenance. the writing needs to support a bigger operating system.",
    priorities: ["leverage", "systems", "trust"],
    contentMix: { replies: 20, posts: 35, threads: 45 },
  },
};

export const PLAYBOOK_LIBRARY: Record<PlaybookStageKey, PlaybookDefinition[]> = {
  "0-1k": [
    {
      id: "reply-ladder",
      name: "Reply Ladder",
      outcome: "Get discovered by bigger accounts",
      whenItWorks: "best when your best ideas are still under-distributed",
      difficulty: "Easy",
      timePerDay: "15 min/day",
      bestFor: ["builders", "solo founders", "tech twitter"],
      loop: {
        input: "Find 10 prompts",
        action: "Write 3 replies + 1 post",
        feedback: "Track follows and profile clicks",
      },
      checklist: {
        daily: [
          "Reply to 10 posts (2 bigger accounts, 8 peers)",
          "Post 1 proof tweet (build progress, result, lesson)",
          "Save 3 high-performers to a swipe file",
        ],
        weekly: [
          "Turn your best reply into a standalone post",
          "Review which replies drove profile clicks",
        ],
      },
      templates: [
        {
          id: "reply-ladder-hook",
          label: "Hook",
          text: "i used to think ___, then i saw ___, now i do ___.",
        },
        {
          id: "reply-ladder-reply",
          label: "Reply",
          text: "this is true. the part ppl miss is ___. here's how i'd apply it: ___.",
        },
        {
          id: "reply-ladder-thread",
          label: "Thread skeleton",
          text: "1) what changed 2) what i tested 3) what happened 4) what i'd do next",
        },
      ],
      metrics: ["Replies/day", "Follows per 100 impressions", "7-day follower delta"],
      rationale: "This compounds because replies earn discovery before your own posts have enough reach to carry themselves.",
      mistakes: [
        "Writing generic agreement replies with no point of view",
        "Only replying to huge accounts",
        "Never turning the best replies into standalone posts",
      ],
      examples: [
        "a sharp disagree + example reply to a bigger account",
        "a build update that proves you're actually shipping",
        "a quick lesson post pulled from a winning reply",
      ],
      quickStart: [
        "Find 5 posts to reply to",
        "Write 3 replies using the template",
        "Turn the best reply into 1 original post",
      ],
    },
    {
      id: "daily-shipping-loop",
      name: "Daily Shipping Loop",
      outcome: "Build trust through visible proof",
      whenItWorks: "best when you need more reps and more proof",
      difficulty: "Easy",
      timePerDay: "20 min/day",
      bestFor: ["builders", "students", "indie hackers"],
      loop: {
        input: "Pick one thing you shipped",
        action: "Post the proof",
        feedback: "Track saves and replies",
      },
      checklist: {
        daily: [
          "Ship one small thing",
          "Screenshot or summarize the proof",
          "Post 1 proof tweet with a clear takeaway",
        ],
        weekly: [
          "Bundle 3 proof posts into a mini-thread",
          "Review which proof angle earned the most saves",
        ],
      },
      templates: [
        {
          id: "daily-shipping-hook",
          label: "Hook",
          text: "shipped ___ today. tiny win, but it fixed ___.",
        },
        {
          id: "daily-shipping-reply",
          label: "Reply",
          text: "i'd keep this simple: ship ___, share ___, then measure ___.",
        },
        {
          id: "daily-shipping-thread",
          label: "Thread skeleton",
          text: "1) what i built 2) why it mattered 3) what broke 4) what i learned",
        },
      ],
      metrics: ["Posts/week", "Save rate", "Reply count"],
      rationale: "At this stage, visible proof beats polished theory almost every time.",
      mistakes: [
        "Posting vague motivation with no artifact",
        "Skipping screenshots or concrete proof",
        "Turning every update into a long thread",
      ],
      examples: [
        "a before/after screenshot post",
        "a quick bug-fix lesson",
        "a short shipping recap with one takeaway",
      ],
      quickStart: [
        "Pick one thing you shipped today",
        "Capture the proof",
        "Write a quick proof-first hook",
      ],
    },
  ],
  "1k-10k": [
    {
      id: "weekly-series",
      name: "Weekly Series",
      outcome: "Build topic association and repeat engagement",
      whenItWorks: "best when people know you but not your signature format",
      difficulty: "Medium",
      timePerDay: "25 min/day",
      bestFor: ["builders", "operators", "career twitter"],
      loop: {
        input: "Pick one topic you'll post about every week",
        action: "Use one format people can recognize",
        feedback: "Track returning commenters and saves",
      },
      checklist: {
        daily: [
          "Collect one idea that fits the series",
          "Draft one hook for the next installment",
          "Reply on the same topic to reinforce your positioning",
        ],
        weekly: [
          "Ship 1 flagship post in the series",
          "Repurpose it into 1 smaller follow-up post",
        ],
      },
      templates: [
        {
          id: "weekly-series-hook",
          label: "Hook",
          text: "every tuesday i'm breaking down ___. here's this week's one:",
        },
        {
          id: "weekly-series-reply",
          label: "Reply",
          text: "this fits the same pattern i keep seeing: ___ -> ___ -> ___.",
        },
        {
          id: "weekly-series-thread",
          label: "Thread skeleton",
          text: "1) recurring problem 2) this week's example 3) the repeatable lesson",
        },
      ],
      metrics: ["Repeat commenters", "Series save rate", "Profile visits/post"],
      rationale: "Repeatable formats help people remember what you're known for faster than one-off posts.",
      mistakes: [
        "Changing topics every day",
        "Naming a series but not sticking to the cadence",
        "Overbuilding the format before validating it",
      ],
      examples: [
        "a weekly teardown format",
        "a recurring job-hunt update series",
        "a repeated build-in-public checkpoint post",
      ],
      quickStart: [
        "Pick one topic that already gets traction",
        "Name a simple recurring format",
        "Draft the next hook now",
      ],
    },
    {
      id: "contrarian-proof",
      name: "Contrarian Takes With Proof",
      outcome: "Sharpen positioning with stronger opinions",
      whenItWorks: "best when you have opinions and proof to back them up",
      difficulty: "Medium",
      timePerDay: "20 min/day",
      bestFor: ["experts", "founders", "niche educators"],
      loop: {
        input: "Spot a common opinion",
        action: "Post the inverse take with proof",
        feedback: "Track saves and quality replies",
      },
      checklist: {
        daily: [
          "Save one common take you disagree with",
          "Write one proof-backed counterpoint",
          "Reply to one thread with your contrarian lens",
        ],
        weekly: [
          "Ship 2 contrarian singles",
          "Expand the best one into a short thread",
        ],
      },
      templates: [
        {
          id: "contrarian-proof-hook",
          label: "Hook",
          text: "unpopular opinion: ___ is overrated. ___ matters more.",
        },
        {
          id: "contrarian-proof-reply",
          label: "Reply",
          text: "i think the better frame is ___. i've seen ___ prove it.",
        },
        {
          id: "contrarian-proof-thread",
          label: "Thread skeleton",
          text: "1) common belief 2) why it's wrong 3) proof 4) what to do instead",
        },
      ],
      metrics: ["Save rate", "Replies with substance", "Follower conversion"],
      rationale: "The take gets attention, but the proof is what keeps the take credible.",
      mistakes: [
        "Posting contrarian lines with no receipts",
        "Being edgy instead of useful",
        "Overexplaining before the hook lands",
      ],
      examples: [
        "a myth-busting post with one hard example",
        "a simple before/after result",
        "a short thread that starts with a clear disagreement",
      ],
      quickStart: [
        "Find one common belief you disagree with",
        "List one proof point",
        "Draft a short contrarian hook",
      ],
    },
  ],
  "10k-50k": [
    {
      id: "network-loops",
      name: "Network Loops",
      outcome: "Scale reach through high-signal relationships",
      whenItWorks: "best when the writing is solid but reach is capped",
      difficulty: "Medium",
      timePerDay: "30 min/day",
      bestFor: ["operators", "founders", "creators"],
      loop: {
        input: "Find 3 creators in your space",
        action: "Support each other with useful replies",
        feedback: "Track extra reach and profile follows",
      },
      checklist: {
        daily: [
          "Reply to 3 aligned peers with real value",
          "Amplify 1 post that matches your topic",
          "Open 1 useful conversation in DMs",
        ],
        weekly: [
          "Run 1 collaborative quote or thread",
          "Review which relationships grew your reach",
        ],
      },
      templates: [
        {
          id: "network-loops-hook",
          label: "Hook",
          text: "___ is the pattern i keep seeing across builders right now:",
        },
        {
          id: "network-loops-reply",
          label: "Reply",
          text: "this lines up with what i'm seeing too. one thing i'd add: ___.",
        },
        {
          id: "network-loops-thread",
          label: "Thread skeleton",
          text: "1) shared theme 2) your angle 3) collaborator proof 4) next move",
        },
      ],
      metrics: ["Shared reach", "Mutual reply rate", "Profile follows from collaborators"],
      rationale: "At this stage, getting shared by trusted peers beats posting alone.",
      mistakes: [
        "Treating networking like random outreach",
        "Only chasing bigger accounts",
        "Not turning repeated conversations into collaborative content",
      ],
      examples: [
        "a collaborative quote tweet",
        "a mutual reply chain that becomes a post",
        "a recap post with outside perspectives",
      ],
      quickStart: [
        "Pick 3 aligned accounts",
        "Write 1 useful reply for each",
        "Turn the strongest exchange into a post angle",
      ],
    },
    {
      id: "content-ip",
      name: "Content IP",
      outcome: "Build signature formats people recognize instantly",
      whenItWorks: "best when your audience needs a pattern they remember fast",
      difficulty: "Hard",
      timePerDay: "35 min/day",
      bestFor: ["educators", "creators", "operators"],
      loop: {
        input: "Pick one format you'll repeat",
        action: "Post it often so people recognize it",
        feedback: "Track repeat saves, shares, and mentions",
      },
      checklist: {
        daily: [
          "Collect one example for your format",
          "Refine the hook pattern, not the whole concept",
          "Post one lighter-format variant",
        ],
        weekly: [
          "Ship 1 flagship format post",
          "Repurpose it into 2 smaller spins",
        ],
      },
      templates: [
        {
          id: "content-ip-hook",
          label: "Hook",
          text: "pattern #__: if ___, then ___, because ___.",
        },
        {
          id: "content-ip-reply",
          label: "Reply",
          text: "this fits the same framework i use: ___ -> ___ -> ___.",
        },
        {
          id: "content-ip-thread",
          label: "Thread skeleton",
          text: "1) pattern name 2) setup 3) examples 4) when it fails 5) use it",
        },
      ],
      metrics: ["Mentions of your format", "Saves per flagship post", "Repeat audience"],
      rationale: "Signature formats make your writing easier to recognize and easier to share.",
      mistakes: [
        "Making the format too broad to feel distinct",
        "Changing the branding every week",
        "Posting the flagship too rarely to stick",
      ],
      examples: [
        "a signature teardown format",
        "a named framework post",
        "a repeatable weekly pattern post",
      ],
      quickStart: [
        "Name one format you'll repeat",
        "Write its base structure",
        "Draft a flagship version today",
      ],
    },
  ],
  "50k+": [
    {
      id: "narrative-arcs",
      name: "Narrative Arcs",
      outcome: "Keep trust high while scaling reach",
      whenItWorks: "best when your audience is following the bigger journey",
      difficulty: "Hard",
      timePerDay: "30 min/day",
      bestFor: ["founders", "creators", "operators"],
      loop: {
        input: "Pick the next chapter in your story",
        action: "Share it across posts, replies, and threads",
        feedback: "Track trust signals, replies, and conversions",
      },
      checklist: {
        daily: [
          "Check where your story currently stands",
          "Post one update that advances the arc",
          "Reply to key audience questions to keep trust high",
        ],
        weekly: [
          "Map the next three story chapters",
          "Review what moved attention vs what moved trust",
        ],
      },
      templates: [
        {
          id: "narrative-arcs-hook",
          label: "Hook",
          text: "quick update on ___: here's what's changed since last week.",
        },
        {
          id: "narrative-arcs-reply",
          label: "Reply",
          text: "the next piece of the story is ___. that's what i'm watching now.",
        },
        {
          id: "narrative-arcs-thread",
          label: "Thread skeleton",
          text: "1) where we were 2) what changed 3) what it means 4) what's next",
        },
      ],
      metrics: ["7-day follower delta", "High-signal replies", "Conversion quality"],
      rationale: "At scale, the story you reinforce matters as much as the single post that spikes.",
      mistakes: [
        "Optimizing only for spikes and losing trust",
        "Changing narrative direction too often",
        "Ignoring audience confusion signals",
      ],
      examples: [
        "a milestone update with context",
        "a product narrative checkpoint",
        "a community update with a clear next step",
      ],
      quickStart: [
        "Pick the next story chapter",
        "Write one update",
        "Decide what signal proves it worked",
      ],
    },
    {
      id: "community-flywheel",
      name: "Community Flywheel",
      outcome: "Turn audience attention into durable leverage",
      whenItWorks: "best when your audience already participates and responds",
      difficulty: "Hard",
      timePerDay: "40 min/day",
      bestFor: ["operators", "founders", "community-led brands"],
      loop: {
        input: "Pull signals from the audience",
        action: "Turn them into posts and product improvements",
        feedback: "Track retention and trust",
      },
      checklist: {
        daily: [
          "Collect 3 recurring audience questions",
          "Turn one into a post or reply cluster",
          "Close one loop with a clear next action",
        ],
        weekly: [
          "Ship one audience-led content asset",
          "Review what deepened trust vs what only spiked reach",
        ],
      },
      templates: [
        {
          id: "community-flywheel-hook",
          label: "Hook",
          text: "3 things my audience keeps asking me about ___:",
        },
        {
          id: "community-flywheel-reply",
          label: "Reply",
          text: "i keep hearing this too. the fix is usually ___ first, then ___.",
        },
        {
          id: "community-flywheel-thread",
          label: "Thread skeleton",
          text: "1) repeated audience pain 2) your answer 3) proof 4) invite the next conversation",
        },
      ],
      metrics: ["Repeat responders", "Community reply quality", "Retention signals"],
      rationale: "At this stage, the biggest upside comes from repeated trust, not just more reach.",
      mistakes: [
        "Treating the audience like an engagement machine",
        "Ignoring repeated questions that signal demand",
        "Optimizing only for vanity reach",
      ],
      examples: [
        "an audience FAQ post",
        "a post that turns comments into next week's content",
        "a product-led community checkpoint",
      ],
      quickStart: [
        "List 3 repeated audience questions",
        "Answer 1 publicly",
        "Use the replies to plan the next loop",
      ],
    },
  ],
};

export function inferCurrentPlaybookStage(
  context: CreatorAgentContext | null,
): PlaybookStageKey {
  const followersCount = context?.creatorProfile.identity.followersCount ?? 0;

  if (followersCount >= 50000) {
    return "50k+";
  }

  if (followersCount >= 10000) {
    return "10k-50k";
  }

  if (followersCount >= 1000) {
    return "1k-10k";
  }

  return "0-1k";
}

export function buildPlaybookTemplateGroups(
  playbook: PlaybookDefinition,
): Record<PlaybookTemplateTab, PlaybookTemplate[]> {
  const groups: Record<PlaybookTemplateTab, PlaybookTemplate[]> = {
    hook: [],
    reply: [],
    thread: [],
    cta: [],
  };

  for (const template of playbook.templates) {
    const label = template.label.toLowerCase();
    if (label.includes("reply")) {
      groups.reply.push(template);
    } else if (label.includes("thread")) {
      groups.thread.push(template);
    } else if (label.includes("cta")) {
      groups.cta.push(template);
    } else {
      groups.hook.push(template);
    }
  }

  if (groups.hook.length === 0) {
    groups.hook.push({
      id: `${playbook.id}-hook-fallback`,
      label: "Hook",
      text: "i used to think ___, then i saw ___, now i do ___.",
    });
  }

  if (groups.reply.length === 0) {
    groups.reply.push({
      id: `${playbook.id}-reply-fallback`,
      label: "Reply",
      text: "this is true. the part people miss is ___. here's how i'd apply it: ___.",
    });
  }

  if (groups.thread.length === 0) {
    groups.thread.push({
      id: `${playbook.id}-thread-fallback`,
      label: "Thread",
      text: "hook\n\nwhat changed\n\n3 proof points\n\nwhat i learned\n\nwhat to do next",
    });
  }

  if (groups.cta.length === 0) {
    groups.cta.push({
      id: `${playbook.id}-cta-fallback`,
      label: "CTA",
      text: "if this helps, tell me what you're testing next.",
    });
  }

  return groups;
}

export function buildRecommendedPlaybooks(
  context: CreatorAgentContext | null,
  limit = 3,
): PlaybookRecommendation[] {
  if (!context) {
    return [];
  }

  const currentPlaybookStage = inferCurrentPlaybookStage(context);
  const currentStageIndex = PLAYBOOK_STAGE_ORDER.indexOf(currentPlaybookStage);
  const stageCandidates: PlaybookStageKey[] = [
    currentPlaybookStage,
    PLAYBOOK_STAGE_ORDER[Math.min(PLAYBOOK_STAGE_ORDER.length - 1, currentStageIndex + 1)],
    PLAYBOOK_STAGE_ORDER[Math.max(0, currentStageIndex - 1)],
  ].filter((stage): stage is PlaybookStageKey => Boolean(stage));

  const candidatePool: Array<{ stage: PlaybookStageKey; playbook: PlaybookDefinition }> = [];
  const seen = new Set<string>();

  for (const stage of stageCandidates) {
    for (const playbook of PLAYBOOK_LIBRARY[stage]) {
      const key = `${stage}:${playbook.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        candidatePool.push({ stage, playbook });
      }
    }
  }

  if (candidatePool.length < limit) {
    for (const stage of PLAYBOOK_STAGE_ORDER) {
      for (const playbook of PLAYBOOK_LIBRARY[stage]) {
        const key = `${stage}:${playbook.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          candidatePool.push({ stage, playbook });
        }
      }
    }
  }

  const gapText = `${context.strategyDelta.primaryGap} ${context.strategyDelta.adjustments
    .map((item) => `${item.area} ${item.note}`)
    .join(" ")}`.toLowerCase();

  const scorePlaybook = (playbookId: string, stage: PlaybookStageKey): number => {
    let score = stage === currentPlaybookStage ? 35 : 10;

    if (/\breply|conversation|discovery|reach\b/.test(gapText)) {
      if (playbookId.includes("reply") || playbookId.includes("network")) {
        score += 22;
      }
    }

    if (/\bformat|topic|position|consisten|identity|clarity\b/.test(gapText)) {
      if (playbookId.includes("weekly") || playbookId.includes("content-ip")) {
        score += 18;
      }
    }

    if (/\btrust|retention|community|conversion\b/.test(gapText)) {
      if (playbookId.includes("community") || playbookId.includes("narrative")) {
        score += 16;
      }
    }

    if (/\bproof|story|hook\b/.test(gapText)) {
      if (playbookId.includes("daily") || playbookId.includes("contrarian")) {
        score += 14;
      }
    }

    return score;
  };

  const buildWhyFit = (playbook: PlaybookDefinition): string => {
    if (playbook.id.includes("reply")) {
      return `your gap is ${context.strategyDelta.primaryGap.toLowerCase()}, and this strengthens discovery from replies.`;
    }
    if (playbook.id.includes("weekly") || playbook.id.includes("content-ip")) {
      return "your current signals need clearer repetition, and this builds a recognizable format.";
    }
    if (playbook.id.includes("network")) {
      return "you already have a base signal; this helps expand reach through collaboration.";
    }
    if (playbook.id.includes("daily") || playbook.id.includes("contrarian")) {
      return "this directly sharpens proof and positioning without adding complexity.";
    }
    if (playbook.id.includes("community") || playbook.id.includes("narrative")) {
      return "this aligns with a trust-first growth path and tighter audience retention.";
    }
    return `this targets the current gap: ${context.strategyDelta.primaryGap.toLowerCase()}.`;
  };

  return candidatePool
    .map(({ stage, playbook }) => ({
      stage,
      playbook,
      score: scorePlaybook(playbook.id, stage),
      whyFit: buildWhyFit(playbook),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export function buildRecommendedPlaybookSummaries(
  context: CreatorAgentContext | null,
  limit = 2,
): RecommendedPlaybookSummary[] {
  return buildRecommendedPlaybooks(context, limit).map((recommendation) => ({
    id: recommendation.playbook.id,
    name: recommendation.playbook.name,
    whyFit: recommendation.whyFit,
  }));
}
