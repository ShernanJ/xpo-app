"use client";

import type { CreatorAgentContext } from "@/lib/onboarding/strategy/agentContext";

import type {
  ChatComposerMode,
  HeroQuickAction,
  SlashCommandDefinition,
} from "./composerTypes";
export type { HeroQuickAction } from "./composerTypes";

const SLASH_COMMANDS: SlashCommandDefinition[] = [
  {
    id: "thread",
    command: "/thread",
    label: "/thread",
    description: "Draft a multi-post X thread from the context you type next.",
  },
] as const;

export interface DefaultExampleQuickReply {
  kind: "example_reply";
  value: string;
  label: string;
}

interface ComposerProfileContext {
  knownFor: string | null;
  targetAudience: string | null;
  primaryPillar: string | null;
  secondaryPillar: string | null;
  handle: string | null;
}

function shouldUseLowercaseChipVoice(context: CreatorAgentContext | null): boolean {
  const voice = context?.creatorProfile.voice;
  return voice?.primaryCasing === "lowercase" && (voice.lowercaseSharePercent ?? 0) >= 70;
}

function applyChipVoiceCase(value: string, lowercase: boolean): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  return lowercase ? normalized.toLowerCase() : normalized;
}

function trimProfileFragment(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return null;
  }

  return normalized.replace(/[.!?]+$/, "");
}

function normalizeAccountHandle(value: string): string {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

function resolveComposerProfileContext(
  context: CreatorAgentContext | null,
  accountName: string | null,
): ComposerProfileContext {
  const contentPillars = dedupeNonEmptyStrings([
    ...(context?.growthStrategySnapshot.contentPillars ?? []),
    ...(context?.creatorProfile.topics.contentPillars ?? []),
    ...(context?.creatorProfile.topics.dominantTopics ?? []).map((topic) =>
      typeof topic?.label === "string" ? topic.label : "",
    ),
  ]);
  const knownFor = trimProfileFragment(context?.growthStrategySnapshot.knownFor);
  const targetAudience = trimProfileFragment(context?.growthStrategySnapshot.targetAudience);
  const handle = trimProfileFragment(
    accountName ??
      context?.creatorProfile.identity.username ??
      context?.account ??
      null,
  );

  return {
    knownFor,
    targetAudience,
    primaryPillar: trimProfileFragment(contentPillars[0] ?? null),
    secondaryPillar: trimProfileFragment(contentPillars[1] ?? null),
    handle,
  };
}

function dedupeNonEmptyStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    const normalized = trimProfileFragment(value);
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(normalized);
  }

  return deduped;
}

function buildDefaultPromptPool(profile: ComposerProfileContext): string[] {
  const postTopic = profile.knownFor || profile.primaryPillar || "my niche";
  const threadTopic = profile.primaryPillar || profile.knownFor || "one of my core topics";
  const profileReference = profile.handle ? `@${normalizeAccountHandle(profile.handle)}` : "my profile";

  return [
    `write me a post about ${postTopic}...`,
    `write a thread about ${threadTopic}...`,
    "turn one of my recent lessons into a post",
    `give me 3 post ideas from ${profileReference}`,
    "write me a post using this image",
    "how can i grow on x?",
    "rewrite this so it sounds more like me",
    "what should i post next for more profile clicks?",
  ];
}

function buildThreadPromptPool(profile: ComposerProfileContext): string[] {
  const threadTopic = profile.primaryPillar || profile.knownFor || "one of my core topics";
  const targetAudience = profile.targetAudience || "my audience";

  return [
    `break down ${threadTopic} into 5 posts`,
    "turn one lesson from my recent posts into a thread",
    `write a contrarian thread for ${targetAudience}`,
    "make a thread that teaches my playbook step by step",
  ];
}

function buildHeroQuickActions(
  profile: ComposerProfileContext,
  lowercase: boolean,
): HeroQuickAction[] {
  return [
    {
      kind: "prompt",
      label: applyChipVoiceCase("Write a post", lowercase),
      prompt: applyChipVoiceCase("write a post", lowercase),
    },
    {
      kind: "prompt",
      label: applyChipVoiceCase("Write a thread", lowercase),
      prompt: applyChipVoiceCase("write a thread", lowercase),
    },
    {
      kind: "prompt",
      label: applyChipVoiceCase("Analyze my profile", lowercase),
      prompt: applyChipVoiceCase("analyze my profile", lowercase),
    },
  ];
}

function buildDefaultExamplePromptPool(
  profile: ComposerProfileContext,
): string[] {
  const postTopic = profile.knownFor || profile.primaryPillar || "my niche";
  const threadTopic = profile.primaryPillar || profile.knownFor || "one of my core topics";

  return [
    `write me a post about ${postTopic}`,
    `write a thread about ${threadTopic}`,
    "how can i grow on x?",
  ];
}

export function buildDefaultExampleQuickReplies(
  context: CreatorAgentContext | null,
  accountName: string | null = null,
): DefaultExampleQuickReply[] {
  const lowercase = shouldUseLowercaseChipVoice(context);
  const profile = resolveComposerProfileContext(context, accountName);

  return buildDefaultExamplePromptPool(profile).map((prompt) => {
    const value = applyChipVoiceCase(prompt, lowercase);

    return {
      kind: "example_reply",
      value,
      label: value,
    };
  });
}

function isClearlyCasualGreetingProfile(
  context: CreatorAgentContext | null,
  accountName: string | null,
): boolean {
  if (!context) {
    return false;
  }

  const profile = context.creatorProfile;
  const resolvedHandle = normalizeAccountHandle(
    accountName ?? profile.identity.username ?? context.account,
  );

  if (resolvedHandle === "shernanjavier") {
    return true;
  }

  const voiceSignals = [
    ...profile.voice.styleNotes,
    ...profile.styleCard.preferredOpeners,
    ...profile.styleCard.signaturePhrases,
  ]
    .join(" ")
    .toLowerCase();

  const hasFormalSignal =
    /\b(formal|professional|polished|executive|authoritative|analytical|structured)\b/.test(
      voiceSignals,
    );
  const hasCasualSignal = /\b(casual|playful|relaxed|unfiltered|fun|raw|loose)\b/.test(voiceSignals);
  const hasSlangSignal = /\b(yo|dawg|nah|yep|haha|lol|lmao)\b/.test(voiceSignals);
  const isLowercaseHeavy =
    profile.voice.primaryCasing === "lowercase" && profile.voice.lowercaseSharePercent >= 96;
  const isShortFormLeaning =
    profile.voice.averageLengthBand === "short" || profile.voice.averageLengthBand === "medium";

  if (hasFormalSignal) {
    return false;
  }

  if (profile.identity.isVerified && !hasSlangSignal && !hasCasualSignal) {
    return false;
  }

  return hasSlangSignal || hasCasualSignal || (isLowercaseHeavy && isShortFormLeaning);
}

function buildHeroGreeting(params: {
  context: CreatorAgentContext | null;
  accountName: string | null;
}): { greeting: string; handle: string | null } {
  const resolvedHandle = normalizeAccountHandle(
    params.accountName ??
      params.context?.creatorProfile.identity.username ??
      params.context?.account ??
      "",
  );
  const opener = isClearlyCasualGreetingProfile(params.context, params.accountName)
    ? "yo"
    : "Hey";

  return {
    greeting: resolvedHandle ? `${opener} @${resolvedHandle}` : `${opener} there`,
    handle: resolvedHandle || null,
  };
}

export function formatComposerModeLabel(mode: ChatComposerMode): string | null {
  if (!mode) {
    return null;
  }

  return mode.kind === "edit" ? "Editing message" : "/thread";
}

export function resolveComposerViewState(params: {
  context: CreatorAgentContext | null;
  accountName: string | null;
  activeThreadId: string | null;
  messagesLength: number;
  isLeavingHero: boolean;
}) {
  const { context, accountName, activeThreadId, messagesLength, isLeavingHero } = params;
  const isNewChatHero =
    !activeThreadId && messagesLength === 0 && Boolean(context) && !isLeavingHero;
  const { greeting: heroGreeting, handle: heroHandle } = buildHeroGreeting({
    context,
    accountName,
  });
  const lowercase = shouldUseLowercaseChipVoice(context);
  const profile = resolveComposerProfileContext(context, accountName);
  const heroQuickActions = buildHeroQuickActions(profile, lowercase);
  const heroIdentityLabel =
    context?.creatorProfile.identity.displayName ??
    context?.creatorProfile.identity.username ??
    accountName ??
    context?.account ??
    "X";
  const heroInitials = heroIdentityLabel.replace(/^@+/, "").slice(0, 2).toUpperCase();

  return {
    heroGreeting,
    heroHandle,
    heroInitials,
    heroIdentityLabel,
    heroQuickActions,
    slashCommands: SLASH_COMMANDS,
    defaultPlaceholderPrompts: buildDefaultPromptPool(profile).map((prompt) =>
      applyChipVoiceCase(prompt, lowercase),
    ),
    threadPlaceholderPrompts: buildThreadPromptPool(profile).map((prompt) =>
      applyChipVoiceCase(prompt, lowercase),
    ),
    threadActivePlaceholder: "Ask anything",
    isNewChatHero,
    shouldCenterHero: isNewChatHero || isLeavingHero,
  };
}
