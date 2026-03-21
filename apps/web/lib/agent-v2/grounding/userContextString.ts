import type { OnboardingResult } from "../../onboarding/types.ts";
import { splitCuratedOnboardingPosts } from "../../onboarding/shared/postSampling";
import type { CreatorProfileHints } from "./groundingPacket.ts";

interface BuildUserContextStringArgs {
  onboardingResult?: Partial<OnboardingResult> | null;
  creatorProfileHints?: CreatorProfileHints | null;
  stage?: string | null;
  goal?: string | null;
  factualContext?: string[];
  voiceContextHints?: string[];
  recentPostLimit?: number;
}

function normalizeLine(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function truncateSnippet(value: string, maxLength: number): string {
  const normalized = normalizeLine(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function dedupeLines(values: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const value of values) {
    const normalized = normalizeLine(value);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }

    seen.add(key);
    next.push(normalized);
  }

  return next;
}

function formatCount(value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("en-US")
    : null;
}

function formatQuotedSnippets(values: string[], maxLength: number, limit: number): string[] {
  return dedupeLines(values)
    .slice(0, limit)
    .map((value) => `"${truncateSnippet(value, maxLength)}"`);
}

export function buildUserContextString(args: BuildUserContextStringArgs): string {
  const onboarding = args.onboardingResult ?? null;
  const profile =
    onboarding?.profile && typeof onboarding.profile === "object" && !Array.isArray(onboarding.profile)
      ? onboarding.profile
      : null;
  const stage =
    (typeof args.stage === "string" && args.stage.trim()) ||
    (typeof onboarding?.growthStage === "string" && onboarding.growthStage.trim()) ||
    "Unknown";
  const goal =
    (typeof args.goal === "string" && args.goal.trim()) ||
    (typeof onboarding?.strategyState === "object" &&
    onboarding.strategyState &&
    !Array.isArray(onboarding.strategyState) &&
    typeof onboarding.strategyState.goal === "string" &&
    onboarding.strategyState.goal.trim()) ||
    "Audience growth";
  const factualContext = dedupeLines(args.factualContext || []).slice(0, 4);
  const voiceContextHints = dedupeLines(args.voiceContextHints || []).slice(0, 4);
  const { recentPosts, topHistoricalPosts } = splitCuratedOnboardingPosts(
    Array.isArray(onboarding?.recentPosts) ? onboarding.recentPosts : [],
  );
  const recentPostTexts = recentPosts
    .map((post) =>
      post &&
      typeof post === "object" &&
      !Array.isArray(post) &&
      typeof post.text === "string"
        ? post.text
        : "",
    )
    .filter(Boolean);
  const topHistoricalPostTexts = topHistoricalPosts
    .map((post) =>
      post &&
      typeof post === "object" &&
      !Array.isArray(post) &&
      typeof post.text === "string"
        ? post.text
        : "",
    )
    .filter(Boolean);
  const recentPostSnippets = formatQuotedSnippets(
    recentPostTexts,
    160,
    Math.max(1, Math.min(3, args.recentPostLimit ?? 3)),
  );
  const topHistoricalHookSnippets = formatQuotedSnippets(
    topHistoricalPostTexts,
    400,
    Math.max(1, Math.min(3, args.recentPostLimit ?? 3)),
  );
  const hasProfileSignal = Boolean(
    profile &&
      ((typeof profile.username === "string" && profile.username.trim()) ||
        (typeof profile.name === "string" && profile.name.trim()) ||
        (typeof profile.bio === "string" && profile.bio.trim()) ||
        formatCount(profile.followersCount) ||
        formatCount(profile.followingCount) ||
        profile.isVerified === true),
  );
  const hasMeaningfulContext =
    hasProfileSignal ||
    Boolean(args.creatorProfileHints?.knownFor?.trim()) ||
    Boolean(args.creatorProfileHints?.targetAudience?.trim()) ||
    Boolean(args.creatorProfileHints?.contentPillars?.length) ||
    recentPostSnippets.length > 0 ||
    topHistoricalHookSnippets.length > 0 ||
    factualContext.length > 0 ||
    voiceContextHints.length > 0 ||
    (stage !== "Unknown" && stage.trim().length > 0) ||
    goal.toLowerCase() !== "audience growth" ||
    Boolean(
      onboarding?.pinnedPost &&
        typeof onboarding.pinnedPost === "object" &&
        !Array.isArray(onboarding.pinnedPost) &&
        typeof onboarding.pinnedPost.text === "string" &&
        onboarding.pinnedPost.text.trim(),
    );

  if (!hasMeaningfulContext) {
    return "";
  }

  const lines = [
    "User Profile Summary:",
    `- Stage: ${stage}`,
    `- Primary Goal: ${goal}`,
  ];

  if (profile) {
    const handle =
      typeof profile.username === "string" && profile.username.trim()
        ? `@${profile.username.trim().replace(/^@+/, "")}`
        : null;
    const displayName =
      typeof profile.name === "string" && profile.name.trim()
        ? profile.name.trim()
        : null;

    if (displayName || handle) {
      lines.push(`- Account: ${[displayName, handle].filter(Boolean).join(" ")}`);
    }

    const profileFacts = [
      formatCount(profile.followersCount) ? `Followers: ${formatCount(profile.followersCount)}` : null,
      formatCount(profile.followingCount) ? `Following: ${formatCount(profile.followingCount)}` : null,
      profile.isVerified === true ? "Verified: yes" : null,
    ].filter((value): value is string => Boolean(value));
    if (profileFacts.length > 0) {
      lines.push(`- Profile Facts: ${profileFacts.join(" | ")}`);
    }

    if (typeof profile.bio === "string" && profile.bio.trim()) {
      lines.push(`- Bio: ${truncateSnippet(profile.bio, 220)}`);
    }
  }

  if (args.creatorProfileHints?.knownFor?.trim()) {
    lines.push(`- Known For: ${truncateSnippet(args.creatorProfileHints.knownFor, 180)}`);
  }

  if (args.creatorProfileHints?.targetAudience?.trim()) {
    lines.push(
      `- Target Audience: ${truncateSnippet(args.creatorProfileHints.targetAudience, 180)}`,
    );
  }

  if (args.creatorProfileHints?.contentPillars?.length) {
    lines.push(
      `- Content Pillars: ${dedupeLines(args.creatorProfileHints.contentPillars)
        .slice(0, 4)
        .join(" | ")}`,
    );
  }

  if (
    onboarding?.pinnedPost &&
    typeof onboarding.pinnedPost === "object" &&
    !Array.isArray(onboarding.pinnedPost) &&
    typeof onboarding.pinnedPost.text === "string" &&
    onboarding.pinnedPost.text.trim()
  ) {
    lines.push(`- Pinned Post: "${truncateSnippet(onboarding.pinnedPost.text, 180)}"`);
  }

  if (recentPostSnippets.length > 0) {
    lines.push("<recent_posts>");
    lines.push(...recentPostSnippets.map((snippet) => `- ${snippet}`));
    lines.push("</recent_posts>");
  }

  if (topHistoricalHookSnippets.length > 0) {
    lines.push("<top_historical_hooks>");
    lines.push(...topHistoricalHookSnippets.map((snippet) => `- ${snippet}`));
    lines.push("</top_historical_hooks>");
  }

  if (factualContext.length > 0) {
    lines.push(`- Known Facts: ${factualContext.join(" | ")}`);
  }

  if (voiceContextHints.length > 0) {
    lines.push(`- Voice/Territory Hints: ${voiceContextHints.join(" | ")}`);
  }

  return lines.join("\n");
}
