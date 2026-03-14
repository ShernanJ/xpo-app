"use client";

import type { CreatorAgentContext } from "@/lib/onboarding/strategy/agentContext";

const BASE_HERO_QUICK_ACTIONS = [
  {
    label: "Write a post",
    prompt: "write a post",
  },
  {
    label: "Give me feedback",
    prompt: "give me feedback",
  },
  {
    label: "Write a thread",
    prompt: "write a thread",
  },
] as const;

export interface HeroQuickAction {
  label: string;
  prompt: string;
}

function shouldUseLowercaseChipVoice(context: CreatorAgentContext | null): boolean {
  const voice = context?.creatorProfile.voice;
  return voice?.primaryCasing === "lowercase" && (voice.lowercaseSharePercent ?? 0) >= 70;
}

function applyChipVoiceCase(value: string, lowercase: boolean): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  return lowercase ? normalized.toLowerCase() : normalized;
}

function buildHeroQuickActions(lowercase: boolean): HeroQuickAction[] {
  return BASE_HERO_QUICK_ACTIONS.map((action) => ({
    label: applyChipVoiceCase(action.label, lowercase),
    prompt: applyChipVoiceCase(action.prompt, lowercase),
  }));
}

function normalizeAccountHandle(value: string): string {
  return value.trim().replace(/^@+/, "").toLowerCase();
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
  const hasCasualSignal = /\b(casual|playful|relaxed|unfiltered|fun|raw|loose)\b/.test(
    voiceSignals,
  );
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
}): string {
  const resolvedHandle = normalizeAccountHandle(
    params.accountName ??
      params.context?.creatorProfile.identity.username ??
      params.context?.account ??
      "",
  );
  const opener = isClearlyCasualGreetingProfile(params.context, params.accountName)
    ? "yo"
    : "Hey";

  return resolvedHandle ? `${opener} @${resolvedHandle}` : `${opener} there`;
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
  const heroGreeting = buildHeroGreeting({
    context,
    accountName,
  });
  const heroQuickActions = buildHeroQuickActions(shouldUseLowercaseChipVoice(context));
  const heroIdentityLabel =
    context?.creatorProfile.identity.displayName ??
    context?.creatorProfile.identity.username ??
    accountName ??
    context?.account ??
    "X";
  const heroInitials = heroIdentityLabel.replace(/^@+/, "").slice(0, 2).toUpperCase();

  return {
    heroGreeting,
    heroInitials,
    heroIdentityLabel,
    heroQuickActions,
    isNewChatHero,
    shouldCenterHero: isNewChatHero || isLeavingHero,
  };
}
