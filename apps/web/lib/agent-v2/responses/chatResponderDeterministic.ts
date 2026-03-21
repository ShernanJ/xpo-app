import type { ResponsePresentationStyle } from "../contracts/chat.ts";
import type {
  ProfileReplyContext,
  ProfileReplyStrongestPost,
} from "../grounding/profileReplyContext.ts";
import { resolveSimpleSocialTurnKind } from "../core/simpleSocialTurn.ts";

/**
 * Deterministic chat responses stay intentionally narrow.
 *
 * These branches only handle cases where we either need strict safety
 * behavior or we can answer from already-grounded profile context without
 * spinning up the coach model.
 */

const MISSING_DRAFT_EDIT_CUES = [
  "help me improve this draft",
  "improve this draft",
  "help me edit this draft",
  "edit this draft",
  "revise this draft",
  "fix this draft",
  "tighten this draft",
];

const FAILURE_EXPLANATION_CUES = [
  "why did it fail",
  "why did that fail",
  "why did this fail",
  "what failed",
  "what went wrong",
  "why did the plan fail",
];

const USER_KNOWLEDGE_CUES = [
  "what do you know about me",
  "what do you know abt me",
  "what do you know about my profile",
  "what do you know about my background",
  "summarize me",
  "what are my preferences",
  "what do you know about my writing",
  "what posts do you have of me",
  "how do you understand me",
  "how do you know me",
];

const PROFILE_SUMMARY_CUES = [
  "write a summary about my profile",
  "write a summary of my profile",
  "summarize my profile",
  "summarise my profile",
  "profile summary",
  "quick snapshot of my background",
  "quick snapshot of my profile",
  "summary about my profile",
  "summary of my profile",
];

const STRONGEST_POST_PATTERNS = [
  /\b(?:top|best|strongest|most popular)\s+(?:recent\s+)?(?:post|thread|reply)\b/,
  /\bwhat performed best\b/,
  /\bwhich post performed best\b/,
  /\bwhy did this post do well\b/,
  /\bwhy did that post do well\b/,
  /\b(?:break down|analyze|analyse)\s+(?:my\s+)?(?:top|best|strongest)\s+post\b/,
];

const PLAIN_PARAGRAPH_PRESENTATION: ResponsePresentationStyle = "plain_paragraph";
const AUTHORED_STRUCTURE_PRESENTATION: ResponsePresentationStyle =
  "preserve_authored_structure";

export interface DeterministicChatReplySpec {
  response: string;
  presentationStyle?: ResponsePresentationStyle;
}

function normalizeMessage(message: string): string {
  return message
    .trim()
    .toLowerCase()
    .replace(/[.?!,:;]+$/g, "")
    .replace(/\s+/g, " ");
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

function stripTrailingPunctuation(value: string): string {
  return value.trim().replace(/[.?!,:;]+$/g, "").trim();
}

function dedupeText(values: string[]): string[] {
  const seen = new Set<string>();

  return values.filter((value) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
}

function formatNaturalList(values: string[]): string {
  if (values.length === 0) {
    return "";
  }

  if (values.length === 1) {
    return values[0] || "";
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }

  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

function getLastAssistantTurn(recentHistory: string): string {
  const assistantTurns = recentHistory
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.toLowerCase().startsWith("assistant:"));

  return assistantTurns[assistantTurns.length - 1]?.toLowerCase() || "";
}

function looksLikeMissingDraftEditRequest(message: string): boolean {
  const normalized = normalizeMessage(message);
  if (!normalized || normalized.length > 120) {
    return false;
  }

  return MISSING_DRAFT_EDIT_CUES.some((cue) => normalized === cue);
}

function buildMissingDraftEditReply(): string {
  return "paste the draft you want me to improve and i'll tighten it up.";
}

function looksLikeFailureExplanationQuestion(message: string): boolean {
  const normalized = normalizeMessage(message);
  if (!normalized || normalized.length > 120) {
    return false;
  }

  return FAILURE_EXPLANATION_CUES.some((cue) => normalized.includes(cue));
}

function buildFailureExplanationReply(recentHistory: string): string | null {
  const lastAssistantTurn = getLastAssistantTurn(recentHistory);
  if (!lastAssistantTurn.includes("failed to")) {
    return null;
  }

  const becauseMatch = lastAssistantTurn.match(/failed to [^.?!]+ because ([^.?!]+)/);
  if (becauseMatch?.[1]) {
    return `it failed because ${becauseMatch[1].trim()}.`;
  }

  if (lastAssistantTurn.includes("failed to generate strategy plan")) {
    return "it failed because the planner didn't return a usable plan.";
  }

  return "it failed because the last generation step didn't return usable output.";
}

function looksLikeUserKnowledgeQuestion(message: string): boolean {
  const normalized = normalizeMessage(message);
  if (!normalized || normalized.length > 160) {
    return false;
  }

  return (
    USER_KNOWLEDGE_CUES.some((cue) => normalized.includes(cue)) ||
    (normalized.includes("you should know my") &&
      /\b(posts?|threads?|replies?)\b/.test(normalized))
  );
}

function looksLikeProfileSummaryRequest(message: string): boolean {
  const normalized = normalizeMessage(message);
  if (!normalized || normalized.length > 200) {
    return false;
  }

  return (
    PROFILE_SUMMARY_CUES.some((cue) => normalized.includes(cue)) ||
    (/\b(?:summarize|summarise|summary|snapshot)\b/.test(normalized) &&
      /\bmy\b/.test(normalized) &&
      /\b(?:profile|background|bio)\b/.test(normalized))
  );
}

function looksLikeStrongestPostQuestion(message: string): boolean {
  const normalized = normalizeMessage(message);
  if (!normalized || normalized.length > 220) {
    return false;
  }

  return STRONGEST_POST_PATTERNS.some((pattern) => pattern.test(normalized));
}

function looksLikePostHistoryQuestion(message: string): boolean {
  const normalized = normalizeMessage(message);

  return /\b(posts?|threads?|replies?)\b/.test(normalized) && /\b(?:have|know|loaded|see)\b/.test(normalized);
}

function splitPipedValues(value: string | null): string[] {
  if (!value) {
    return [];
  }

  return dedupeText(
    value
      .split("|")
      .map((entry) => stripTrailingPunctuation(entry))
      .filter(Boolean),
  );
}

function extractContextLine(userContextString: string | undefined, prefix: string): string | null {
  const match = userContextString
    ?.split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith(prefix));

  return match?.slice(prefix.length).trim() || null;
}

function extractRecentPostsFromUserContextString(userContextString: string | undefined): string[] {
  const value = extractContextLine(userContextString, "- Recent Posts:");
  if (!value) {
    return [];
  }

  return dedupeText(
    value
      .split("|")
      .map((entry) => entry.trim().replace(/^"|"$/g, ""))
      .filter(Boolean),
  ).slice(0, 3);
}

function summarizeSnippetAsTheme(value: string): string {
  const normalized = normalizeLine(value)
    .replace(/^"+|"+$/g, "")
    .replace(/[.?!:;]+$/g, "");
  const firstClause = normalized.split(/(?<=[.?!])\s+|[:;]/)[0]?.trim() || normalized;
  return truncateSnippet(firstClause, 84);
}

function buildFallbackProfileReplyContext(args: {
  userContextString?: string;
  topicAnchors?: string[];
}): ProfileReplyContext | null {
  const accountLabel = extractContextLine(args.userContextString, "- Account:");
  const bio = extractContextLine(args.userContextString, "- Bio:");
  const knownFor = extractContextLine(args.userContextString, "- Known For:");
  const targetAudience = extractContextLine(args.userContextString, "- Target Audience:");
  const contentPillars = splitPipedValues(extractContextLine(args.userContextString, "- Content Pillars:"))
    .slice(0, 4);
  const stage = extractContextLine(args.userContextString, "- Stage:");
  const goal = extractContextLine(args.userContextString, "- Primary Goal:");
  const pinnedPost = extractContextLine(args.userContextString, "- Pinned Post:")?.replace(/^"|"$/g, "") || null;
  const recentPostSnippets = dedupeText([
    ...extractRecentPostsFromUserContextString(args.userContextString),
    ...((args.topicAnchors || []).map((anchor) => truncateSnippet(anchor, 120))),
  ]).slice(0, 3);
  const topicBullets = dedupeText([
    ...contentPillars,
    ...recentPostSnippets.map(summarizeSnippetAsTheme),
  ]).slice(0, 4);

  const hasMeaningfulContext = Boolean(
    accountLabel ||
      bio ||
      knownFor ||
      targetAudience ||
      contentPillars.length > 0 ||
      topicBullets.length > 0 ||
      recentPostSnippets.length > 0 ||
      pinnedPost ||
      (stage && !/^unknown$/i.test(stage)) ||
      (goal && !/^audience growth$/i.test(goal)),
  );

  if (!hasMeaningfulContext) {
    return null;
  }

  return {
    accountLabel,
    bio,
    knownFor,
    targetAudience,
    contentPillars,
    stage: stage && !/^unknown$/i.test(stage) ? stage : null,
    goal: goal && !/^audience growth$/i.test(goal) ? goal : null,
    topicBullets,
    recentPostSnippets,
    pinnedPost,
    recentPostCount: recentPostSnippets.length,
    strongestPost: null,
  };
}

function resolveProfileReplyContext(args: {
  profileReplyContext?: ProfileReplyContext | null;
  userContextString?: string;
  topicAnchors?: string[];
}): ProfileReplyContext | null {
  return (
    args.profileReplyContext ??
    buildFallbackProfileReplyContext({
      userContextString: args.userContextString,
      topicAnchors: args.topicAnchors,
    })
  );
}

function buildMissingProfileReply(kind: "knowledge" | "summary" | "analytics"): DeterministicChatReplySpec {
  const response =
    kind === "summary"
      ? "i don't have your profile synced in this workspace yet. reconnect or rescrape it here, or paste a quick snapshot and i'll summarize it."
      : kind === "analytics"
        ? "i don't have enough synced profile and post data in this workspace yet to call out your strongest recent post. reconnect or rescrape it here, or paste the post details and i'll break it down."
        : "i don't have your profile synced in this workspace yet. reconnect or rescrape it here, or paste a quick snapshot and i'll work from that.";

  return {
    response,
    presentationStyle: PLAIN_PARAGRAPH_PRESENTATION,
  };
}

function buildPlainParagraphReply(response: string): DeterministicChatReplySpec {
  return {
    response,
    presentationStyle: PLAIN_PARAGRAPH_PRESENTATION,
  };
}

function buildSimpleSocialReply(userMessage: string): DeterministicChatReplySpec | null {
  const turnKind = resolveSimpleSocialTurnKind(userMessage);
  if (!turnKind) {
    return null;
  }

  return buildPlainParagraphReply(
    "post, thread, or quick profile audit?",
  );
}

function buildStructuredReply(response: string): DeterministicChatReplySpec {
  return {
    response,
    presentationStyle: AUTHORED_STRUCTURE_PRESENTATION,
  };
}

function formatBioForSentence(value: string): string {
  return stripTrailingPunctuation(value)
    .replace(/\.\s+/g, ", ")
    .replace(/\s+,/g, ",");
}

function buildProfileOpener(context: ProfileReplyContext): string {
  const knownFor = context.knownFor ? stripTrailingPunctuation(context.knownFor) : null;
  const targetAudience = context.targetAudience
    ? stripTrailingPunctuation(context.targetAudience)
    : null;
  const bio = context.bio ? formatBioForSentence(context.bio) : null;

  if (knownFor && targetAudience) {
    return `I see you've positioned yourself as ${knownFor} for ${targetAudience}.`;
  }

  if (knownFor) {
    return `I see you've positioned yourself as ${knownFor}.`;
  }

  if (bio) {
    return `Your profile centers on ${bio}.`;
  }

  if (context.contentPillars.length > 0) {
    return `Your content feels anchored in ${formatNaturalList(context.contentPillars.slice(0, 2))}.`;
  }

  if (context.accountLabel) {
    return `I have a good read on how ${context.accountLabel} is showing up right now.`;
  }

  if (context.goal && context.stage) {
    return `I can tell you're pushing toward ${stripTrailingPunctuation(context.goal)} from the ${stripTrailingPunctuation(context.stage)} stage.`;
  }

  if (context.goal) {
    return `I can tell you're pushing toward ${stripTrailingPunctuation(context.goal)} right now.`;
  }

  return "I have a good read on how you're showing up here right now.";
}

function buildTopicBullets(context: ProfileReplyContext): string[] {
  if (context.topicBullets.length > 0) {
    return context.topicBullets.slice(0, 4);
  }

  if (context.recentPostSnippets.length > 0) {
    return context.recentPostSnippets.slice(0, 3).map(summarizeSnippetAsTheme);
  }

  if (context.contentPillars.length > 0) {
    return context.contentPillars.slice(0, 3);
  }

  return [];
}

function formatRecentPostSnippet(value: string): string {
  return `"${truncateSnippet(value.replace(/^"|"$/g, ""), 110)}"`;
}

function buildPostHistoryReply(args: {
  profileContext: ProfileReplyContext;
  userContextString?: string;
  topicAnchors?: string[];
}): DeterministicChatReplySpec {
  const snippets = dedupeText([
    ...args.profileContext.recentPostSnippets,
    ...extractRecentPostsFromUserContextString(args.userContextString),
    ...((args.topicAnchors || []).map((anchor) => truncateSnippet(anchor, 120))),
  ]).slice(0, 3);

  if (snippets.length === 0) {
    return buildPlainParagraphReply(
      "i have your profile context here, but i don't have recent post text loaded right now.",
    );
  }

  return buildStructuredReply(
    [
      "**Current read:** I can see a few recent posts in the current sample.",
      "",
      "## Recent Posts",
      ...snippets.map((snippet) => `- ${formatRecentPostSnippet(snippet)}`),
    ].join("\n"),
  );
}

function buildStrongestPostSection(context: ProfileReplyContext): string[] {
  if (!context.strongestPost) {
    return [];
  }

  return [
    "",
    "## Strongest Recent Post",
    "- I can also pull the strongest recent post in scope and break down why it worked.",
  ];
}

function buildProfileKnowledgeReply(context: ProfileReplyContext): DeterministicChatReplySpec {
  const topicBullets = buildTopicBullets(context);
  const responseLines = [`**Current read:** ${buildProfileOpener(context)}`];

  if (topicBullets.length > 0) {
    responseLines.push("", "## Recent Themes");
    responseLines.push(...topicBullets.map((topic) => `- ${topic}`));
  } else {
    responseLines.push(
      "",
      "## Recent Themes",
      "- Recent themes are still thin in the current sample, so I would want a fuller sync before making stronger pattern claims.",
    );
  }

  responseLines.push(...buildStrongestPostSection(context));

  return buildStructuredReply(responseLines.join("\n"));
}

function buildProfileSummaryReply(context: ProfileReplyContext): DeterministicChatReplySpec {
  return buildProfileKnowledgeReply(context);
}

function formatInteger(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function formatRatio(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "";
  }

  if (value >= 10) {
    return `${value.toFixed(0)}x`;
  }

  return `${value.toFixed(1)}x`;
}

function formatDateLabel(value: string): string | null {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function buildStrongestPostMetricBullet(strongestPost: ProfileReplyStrongestPost): string {
  const metricParts: string[] = [];

  if (strongestPost.metrics.likeCount > 0) {
    metricParts.push(`**${formatInteger(strongestPost.metrics.likeCount)}** likes`);
  }
  if (strongestPost.metrics.replyCount > 0) {
    metricParts.push(`**${formatInteger(strongestPost.metrics.replyCount)}** replies`);
  }
  if (strongestPost.metrics.repostCount > 0) {
    metricParts.push(`**${formatInteger(strongestPost.metrics.repostCount)}** reposts`);
  }
  if (strongestPost.metrics.quoteCount > 0) {
    metricParts.push(`**${formatInteger(strongestPost.metrics.quoteCount)}** quotes`);
  }

  const metricSummary =
    metricParts.length > 0
      ? `**${formatInteger(strongestPost.engagementTotal)}** total engagements, including ${metricParts.join(", ")}`
      : `**${formatInteger(strongestPost.engagementTotal)}** total engagements`;

  return `- It pulled ${metricSummary}.`;
}

function buildStrongestPostComparisonBullet(strongestPost: ProfileReplyStrongestPost): string | null {
  const ratio = strongestPost.comparison.ratio;
  if (!ratio || ratio <= 0) {
    return null;
  }

  if (strongestPost.comparison.basis === "previous_best_7d") {
    return `- That's **${formatRatio(ratio)}** higher than the best post in the previous 7 days.`;
  }

  if (strongestPost.comparison.basis === "baseline_average_engagement") {
    return `- That's about **${formatRatio(ratio)}** your recent baseline engagement.`;
  }

  return null;
}

function buildStrongestPostReasonBullet(strongestPost: ProfileReplyStrongestPost): string | null {
  if (strongestPost.reasons.length === 0) {
    return null;
  }

  if (strongestPost.reasons.length === 1) {
    return `- ${strongestPost.reasons[0]}`;
  }

  return `- ${strongestPost.reasons[0]} ${strongestPost.reasons[1]}`;
}

function buildStrongestPostReply(context: ProfileReplyContext): DeterministicChatReplySpec {
  const strongestPost = context.strongestPost;
  if (!strongestPost) {
    return buildMissingProfileReply("analytics");
  }

  const snippet = truncateSnippet(strongestPost.text, 96);
  const lines = [
    `**Strongest recent post:** "${snippet.replace(/^"|"$/g, "")}".`,
    "",
    "## Why It Stood Out",
    buildStrongestPostMetricBullet(strongestPost),
  ];

  const comparisonBullet = buildStrongestPostComparisonBullet(strongestPost);
  if (comparisonBullet) {
    lines.push(comparisonBullet);
  }

  const reasonBullet = buildStrongestPostReasonBullet(strongestPost);
  if (reasonBullet) {
    lines.push(reasonBullet);
  }

  if (!comparisonBullet && !reasonBullet) {
    const dateLabel = formatDateLabel(strongestPost.createdAt);
    if (dateLabel) {
      lines.push(`- It went live on **${dateLabel}**.`);
    }
  }

  return buildStructuredReply(lines.join("\n"));
}

export function getDeterministicChatReplySpec(args: {
  userMessage: string;
  recentHistory: string;
  userContextString?: string;
  profileReplyContext?: ProfileReplyContext | null;
  activeConstraints?: string[];
  topicAnchors?: string[];
  diagnosticContext?: unknown;
}): DeterministicChatReplySpec | null {
  const simpleSocialReply = buildSimpleSocialReply(args.userMessage);
  if (simpleSocialReply) {
    return simpleSocialReply;
  }

  if (looksLikeMissingDraftEditRequest(args.userMessage)) {
    return {
      response: buildMissingDraftEditReply(),
    };
  }

  if (looksLikeFailureExplanationQuestion(args.userMessage)) {
    const failureReply = buildFailureExplanationReply(args.recentHistory);
    if (failureReply) {
      return {
        response: failureReply,
      };
    }
  }

  const profileContext = resolveProfileReplyContext({
    profileReplyContext: args.profileReplyContext,
    userContextString: args.userContextString,
    topicAnchors: args.topicAnchors,
  });

  if (looksLikeStrongestPostQuestion(args.userMessage)) {
    if (!profileContext) {
      return buildMissingProfileReply("analytics");
    }

    return buildStrongestPostReply(profileContext);
  }

  if (looksLikeProfileSummaryRequest(args.userMessage)) {
    if (!profileContext) {
      return buildMissingProfileReply("summary");
    }

    return buildProfileSummaryReply(profileContext);
  }

  if (looksLikeUserKnowledgeQuestion(args.userMessage)) {
    if (!profileContext) {
      if ((args.activeConstraints || []).length > 0) {
        return buildPlainParagraphReply(
          "i mostly know the preferences and working constraints you've given me in this thread so far.",
        );
      }

      return buildMissingProfileReply("knowledge");
    }

    if (looksLikePostHistoryQuestion(args.userMessage)) {
      return buildPostHistoryReply({
        profileContext,
        userContextString: args.userContextString,
        topicAnchors: args.topicAnchors,
      });
    }

    return buildProfileKnowledgeReply(profileContext);
  }

  return null;
}

export function getDeterministicChatReply(args: {
  userMessage: string;
  recentHistory: string;
  userContextString?: string;
  profileReplyContext?: ProfileReplyContext | null;
  activeConstraints?: string[];
  topicAnchors?: string[];
  diagnosticContext?: unknown;
}): string | null {
  return getDeterministicChatReplySpec(args)?.response ?? null;
}
