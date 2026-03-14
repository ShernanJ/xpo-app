"use client";

import type { CreatorAgentContext } from "@/lib/onboarding/strategy/agentContext";

export function resolveDraftEditorIdentity(params: {
  context: CreatorAgentContext | null;
  accountName: string | null;
  heroIdentityLabel: string;
  heroInitials: string;
}) {
  const { context, accountName, heroIdentityLabel, heroInitials } = params;

  return {
    avatarUrl: context?.avatarUrl ?? null,
    displayName:
      context?.creatorProfile.identity.displayName ??
      context?.creatorProfile.identity.username ??
      accountName ??
      "You",
    username: context?.creatorProfile.identity.username ?? accountName ?? "x",
    profilePhotoLabel: `${heroIdentityLabel} profile photo`,
    initials: heroInitials,
  };
}
