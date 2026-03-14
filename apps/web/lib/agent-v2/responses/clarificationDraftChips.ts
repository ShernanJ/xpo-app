import type { VoiceStyleCard } from "../core/styleProfile";
import type {
  CreatorChatQuickReply,
  DraftFormatPreference,
} from "../contracts/chat";

const JUNK_TOPIC_VALUES = new Set([
  "this",
  "that",
  "it",
  "something",
  "anything",
  "my thing",
  "stuff",
]);

interface QuickReplyVoiceProfile {
  lowercase: boolean;
  concise: boolean;
}

function inferLowercasePreference(styleCard: VoiceStyleCard | null): boolean {
  if (!styleCard) {
    return false;
  }

  const explicitCasing = styleCard.userPreferences?.casing;
  if (explicitCasing === "lowercase") {
    return true;
  }
  if (explicitCasing === "normal" || explicitCasing === "uppercase") {
    return false;
  }

  const signals = [
    ...(styleCard.formattingRules || []),
    ...(styleCard.customGuidelines || []),
  ]
    .join(" ")
    .toLowerCase();

  return (
    signals.includes("all lowercase") ||
    signals.includes("always lowercase") ||
    signals.includes("never uses capitalization") ||
    signals.includes("no uppercase")
  );
}

function inferConcisePreference(styleCard: VoiceStyleCard | null): boolean {
  const pacing = styleCard?.pacing?.toLowerCase() || "";
  const guidance = (styleCard?.customGuidelines || []).join(" ").toLowerCase();
  const writingGoal = styleCard?.userPreferences?.writingGoal;

  return (
    writingGoal === "growth_first" ||
    pacing.includes("short") ||
    pacing.includes("punchy") ||
    pacing.includes("bullet") ||
    pacing.includes("scan") ||
    guidance.includes("blunt") ||
    guidance.includes("direct") ||
    guidance.includes("tight")
  );
}

function resolveQuickReplyVoiceProfile(
  styleCard: VoiceStyleCard | null,
): QuickReplyVoiceProfile {
  return {
    lowercase: inferLowercasePreference(styleCard),
    concise: inferConcisePreference(styleCard),
  };
}

function applyQuickReplyVoiceCase(value: string, voice: QuickReplyVoiceProfile): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!voice.lowercase) {
    return normalized;
  }

  return normalized.toLowerCase();
}

function titleCaseLabel(value: string): string {
  return value.replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

function normalizeQuickReplyLabel(value: string, voice: QuickReplyVoiceProfile): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  const base = voice.lowercase ? trimmed.toLowerCase() : titleCaseLabel(trimmed);
  return base.length > 30 ? `${base.slice(0, 27).trimEnd()}...` : base;
}

function cleanTopicValue(value: string): string {
  return value
    .trim()
    .replace(/^[@#]+/, "")
    .replace(/[.?!,]+$/, "")
    .replace(/\s+/g, " ");
}

function isMetaSummaryTopic(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return (
    /^(?:the\s+)?user\s+is\b/.test(normalized) ||
    /^(?:the\s+)?creator\s+is\b/.test(normalized) ||
    /^(?:they|he|she)\s+is\b/.test(normalized) ||
    /^(?:they)\s+are\b/.test(normalized)
  );
}

function isComplaintOrMetaTopic(value: string): boolean {
  const normalized = cleanTopicValue(value).toLowerCase();
  if (!normalized) {
    return false;
  }

  return [
    /\btoo formal\b/,
    /\btoo polished\b/,
    /\btoo generic\b/,
    /\btoo long\b/,
    /\btoo robotic\b/,
    /\btoo corporate\b/,
    /\btoo salesy\b/,
    /\btoo stiff\b/,
    /\bsounds cringe\b/,
    /\bsounds like linkedin\b/,
    /\bdon't like this\b/,
    /\bthis is bad\b/,
    /^(?:what(?:'s| is)|which)\s+.*\b(?:best|top)\s+post\b/,
    /\b(?:best|top)\s+post\b/,
  ].some((pattern) => pattern.test(normalized));
}

export function compactTopicLabel(value: string): string {
  const cleaned = cleanTopicValue(value);

  if (!cleaned) {
    return "your usual lane";
  }

  const normalized = cleaned.toLowerCase();
  const conversionMatch =
    cleaned.match(
      /\b(?:turning|convert(?:ing)?|rewriting|transform(?:ing)?)\s+([a-z0-9]+)(?:\s+posts?|\s+content)?\s+(?:into|to)\s+([a-z0-9]+)\b/i,
    ) ||
    cleaned.match(
      /\b([a-z0-9]+)(?:\s+posts?|\s+content)?\s+(?:into|to)\s+([a-z0-9]+)\b/i,
    );
  const bridgeMatch = cleaned.match(
    /\b([a-z0-9]+)\s+(?:vs|versus)\s+([a-z0-9]+)\b/i,
  );
  const pairedTopicMatch = cleaned.match(
    /\b([a-z0-9][a-z0-9\s'-]{1,24})\s+and\s+([a-z0-9][a-z0-9\s'-]{1,24})\b/i,
  );
  const reduced =
    conversionMatch?.[1] && conversionMatch?.[2]
      ? `${conversionMatch[1]} to ${conversionMatch[2]}`
      : bridgeMatch?.[1] && bridgeMatch?.[2]
        ? `${bridgeMatch[1]} vs ${bridgeMatch[2]}`
        : pairedTopicMatch?.[1] && pairedTopicMatch?.[2]
          ? cleanTopicValue(
              normalized.includes("internship") && normalized.includes("interview")
                ? pairedTopicMatch[1]
                : pairedTopicMatch[1],
            )
          : cleaned.split(/\b(?:while|because|but|so|and|with)\b/i)[0].trim() || cleaned;
  const words = reduced.split(/\s+/);
  const compact = words.length > 5 ? words.slice(0, 5).join(" ") : reduced;
  return compact.length > 34 ? `${compact.slice(0, 31).trimEnd()}...` : compact;
}

function isUsableTopicCandidate(value: string | null): value is string {
  const cleaned = cleanTopicValue(value || "");
  const normalized = cleaned.toLowerCase();

  if (!cleaned || JUNK_TOPIC_VALUES.has(normalized)) {
    return false;
  }

  if (
    /\b(?:draft|write|make|give|help)\s+(?:me\s+)?(?:a\s+)?post\b/i.test(cleaned) ||
    /\b(?:pick|choose)\s+(?:an?\s+)?angle\b/i.test(cleaned)
  ) {
    return false;
  }

  if (isMetaSummaryTopic(cleaned) || isComplaintOrMetaTopic(cleaned)) {
    return false;
  }

  if (cleaned.length > 84 || cleaned.includes("\n")) {
    return false;
  }

  if (cleaned.split(/\s+/).length > 8) {
    return false;
  }

  if (/^[^a-z0-9]*$/i.test(cleaned)) {
    return false;
  }

  return true;
}

function scoreTopicCandidate(
  value: string,
  args: {
    seedTopic: string | null;
    styleCard: VoiceStyleCard | null;
    topicAnchors: string[];
  },
): number {
  const cleaned = cleanTopicValue(value);
  const normalized = cleaned.toLowerCase();
  const compactLabel = compactTopicLabel(cleaned).toLowerCase();
  let score = 0;

  if (args.seedTopic && normalized === cleanTopicValue(args.seedTopic).toLowerCase()) {
    score += 8;
  }

  if ((args.styleCard?.contextAnchors || []).some((anchor) => cleanTopicValue(anchor).toLowerCase() === normalized)) {
    score += 4;
  }

  if (args.topicAnchors.some((anchor) => cleanTopicValue(anchor).toLowerCase() === normalized)) {
    score += 3;
  }

  const wordCount = compactLabel.split(/\s+/).filter(Boolean).length;
  if (wordCount <= 3) {
    score += 3;
  } else if (wordCount <= 5) {
    score += 2;
  } else {
    score -= 2;
  }

  if (compactLabel.length <= 22) {
    score += 2;
  } else if (compactLabel.length <= 34) {
    score += 1;
  } else {
    score -= 1;
  }

  if (/\d/.test(normalized)) {
    score -= 2;
  }

  if (/\b(?:while|because|but|so|with)\b/i.test(cleaned)) {
    score -= 1;
  }

  return score;
}

function isHumanSafeTopicLabel(value: string): boolean {
  const label = compactTopicLabel(value).toLowerCase();

  if (!label || label === "your usual lane" || JUNK_TOPIC_VALUES.has(label)) {
    return false;
  }

  if (isComplaintOrMetaTopic(label)) {
    return false;
  }

  if (label.includes("...")) {
    return false;
  }

  if (label.split(/\s+/).length > 5) {
    return false;
  }

  if (/\d/.test(label)) {
    return false;
  }

  return true;
}

function collectDraftTopicCandidates(
  styleCard: VoiceStyleCard | null,
  topicAnchors: string[],
  seedTopic: string | null,
): string[] {
  const candidates = [
    seedTopic,
    ...(styleCard?.contextAnchors || []),
    ...topicAnchors,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  const seen = new Set<string>();
  const ranked: Array<{ value: string; score: number; order: number }> = [];
  const seenLabels = new Set<string>();

  for (const [index, candidate] of candidates.entries()) {
    if (!isUsableTopicCandidate(candidate)) {
      continue;
    }

    const cleaned = cleanTopicValue(candidate);
    const key = cleaned.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    const compactLabel = compactTopicLabel(cleaned).toLowerCase();
    if (seenLabels.has(compactLabel)) {
      continue;
    }

    seen.add(key);
    seenLabels.add(compactLabel);
    ranked.push({
      value: cleaned,
      score: scoreTopicCandidate(cleaned, { seedTopic, styleCard, topicAnchors }),
      order: index,
    });
  }

  return ranked
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.order - right.order;
    })
    .slice(0, 3)
    .map((item) => item.value);
}

function buildPacingHint(
  styleCard: VoiceStyleCard | null,
  options?: {
    formatPreference?: DraftFormatPreference | null;
    threadStyle?: "story" | "breakdown";
  },
): string {
  const pacing = styleCard?.pacing.toLowerCase() || "";
  const isThread = options?.formatPreference === "thread";

  if (isThread && options?.threadStyle === "story") {
    if (pacing.includes("bullet") || pacing.includes("scan")) {
      return "keep it in my voice, but let each post breathe with short paragraphs instead of a dense bullet block.";
    }

    if (pacing.includes("long") || pacing.includes("flowing")) {
      return "let each post breathe with short paragraphs and keep the thread native to x.";
    }

    if (pacing.includes("short") || pacing.includes("punchy")) {
      return "keep it crisp, but let each post carry a real beat instead of a mini-tweet.";
    }

    return "keep it close to my usual voice and let the thread breathe with natural paragraph breaks.";
  }

  if (isThread && options?.threadStyle === "breakdown") {
    if (pacing.includes("bullet") || pacing.includes("scan")) {
      return "keep it clean and scannable, but avoid cramming the opener into a bullet block.";
    }

    if (pacing.includes("long") || pacing.includes("flowing")) {
      return "use the extra room for clean development, but keep the thread easy to scan.";
    }

    return "keep it native to x and let each post hold one clear beat.";
  }

  if (pacing.includes("bullet") || pacing.includes("scan")) {
    return "use the same scan-friendly structure i usually use.";
  }

  if (pacing.includes("long") || pacing.includes("flowing")) {
    return "let it breathe a bit, but keep it readable and sharp.";
  }

  if (pacing.includes("short") || pacing.includes("punchy")) {
    return "keep it punchy and close to my normal pacing.";
  }

  return "match my usual pacing.";
}

function buildTopicDraftChip(
  topic: string,
  styleCard: VoiceStyleCard | null,
  voice: QuickReplyVoiceProfile,
): CreatorChatQuickReply {
  const baseLabel = compactTopicLabel(topic);
  return {
    kind: "clarification_choice",
    value: applyQuickReplyVoiceCase(
      `draft a post about ${topic}. keep it in my voice and stay close to what i usually post about. ${buildPacingHint(styleCard)}`,
      voice,
    ),
    label: normalizeQuickReplyLabel(baseLabel, voice),
    explicitIntent: "plan",
  };
}

function buildFormatAwareDraftChip(args: {
  topic: string | null;
  styleCard: VoiceStyleCard | null;
  formatPreference: "shortform" | "longform";
  voice: QuickReplyVoiceProfile;
}): CreatorChatQuickReply {
  const topicLabel = args.topic ? compactTopicLabel(args.topic) : "my usual lane";
  const label =
    args.formatPreference === "shortform"
      ? args.topic
        ? args.voice.concise
          ? `shortform ${topicLabel}`
          : `shortform on ${topicLabel}`
        : args.voice.concise
          ? "shortform"
          : "shortform in my usual lane"
      : args.topic
        ? args.voice.concise
          ? `longform ${topicLabel}`
          : `longform on ${topicLabel}`
        : args.voice.concise
          ? "longform"
          : "longform in my usual lane";
  const value =
    args.formatPreference === "shortform"
      ? args.topic
        ? `draft a shortform x post about ${args.topic}. keep it tight, in my voice, and close to what i usually post about. ${buildPacingHint(args.styleCard)}`
        : `draft a shortform x post in my usual lane. keep it tight, in my voice, and close to my usual topics. ${buildPacingHint(args.styleCard)}`
      : args.topic
        ? `draft a longform x post about ${args.topic}. use the extra room, keep it in my voice, and stay close to what i usually post about. ${buildPacingHint(args.styleCard)}`
        : `draft a longform x post in my usual lane. use the extra room, keep it in my voice, and stay close to my usual topics. ${buildPacingHint(args.styleCard)}`;

  return {
    kind: "clarification_choice",
    value: applyQuickReplyVoiceCase(value, args.voice),
    label: normalizeQuickReplyLabel(label, args.voice),
    explicitIntent: "plan",
    formatPreference: args.formatPreference,
  };
}

function buildAngleChip(
  primaryTopic: string | null,
  voice: QuickReplyVoiceProfile,
): CreatorChatQuickReply {
  const topicLabel = primaryTopic ? compactTopicLabel(primaryTopic) : null;
  const label = topicLabel
    ? voice.concise
      ? `new angle ${topicLabel}`
      : `angle on ${topicLabel}`
    : voice.concise
      ? "pick angle"
      : "pick an angle first";
  const value = primaryTopic
    ? `give me 3 grounded angle options for ${primaryTopic}. stay inside that topic, keep them close to what i usually post about, and do not reset broader than it.`
    : "give me 3 grounded angle options in my usual lane. keep them close to my normal topics and do not reset into something generic.";

  return {
    kind: "clarification_choice",
    value: applyQuickReplyVoiceCase(value, voice),
    label: normalizeQuickReplyLabel(label, voice),
    explicitIntent: "ideate",
  };
}

function buildThreadDraftChip(args: {
  topic: string | null;
  styleCard: VoiceStyleCard | null;
  threadStyle: "story" | "breakdown";
  voice: QuickReplyVoiceProfile;
}): CreatorChatQuickReply {
  const topicLabel = args.topic ? compactTopicLabel(args.topic) : "my usual lane";
  const label =
    args.threadStyle === "story"
      ? args.topic
        ? `${topicLabel} story`
        : "story thread"
      : args.topic
        ? `${topicLabel} breakdown`
        : "breakdown thread";
  const topicFragment = args.topic
    ? `about ${args.topic}`
    : "in my usual lane";
  const value =
    args.threadStyle === "story"
      ? `draft a story-driven x thread ${topicFragment}. make the opener clearly signal the thread, keep each post native to x, and stay close to my usual voice. ${buildPacingHint(args.styleCard, { formatPreference: "thread", threadStyle: "story" })}`
      : `draft a breakdown x thread ${topicFragment}. make it scan-friendly, concrete, native to x, and close to what i usually post about. ${buildPacingHint(args.styleCard, { formatPreference: "thread", threadStyle: "breakdown" })}`;

  return {
    kind: "clarification_choice",
    value: applyQuickReplyVoiceCase(value, args.voice),
    label: normalizeQuickReplyLabel(label, args.voice),
    explicitIntent: "plan",
    formatPreference: "thread",
  };
}

function buildThreadAngleChip(
  primaryTopic: string | null,
  voice: QuickReplyVoiceProfile,
): CreatorChatQuickReply {
  const topicLabel = primaryTopic ? compactTopicLabel(primaryTopic) : null;
  const label = topicLabel
    ? voice.concise
      ? `thread angles ${topicLabel}`
      : `thread angles on ${topicLabel}`
    : voice.concise
      ? "thread angles"
      : "give me thread angles";
  const value = primaryTopic
    ? `give me 3 grounded thread angles for ${primaryTopic}. each should fit a 4 to 6 post x thread, feel native to x, and stay close to what i usually post about.`
    : "give me 3 grounded thread angles in my usual lane. each should fit a 4 to 6 post x thread, feel native to x, and stay close to what i usually post about.";

  return {
    kind: "clarification_choice",
    value: applyQuickReplyVoiceCase(value, voice),
    label: normalizeQuickReplyLabel(label, voice),
    explicitIntent: "ideate",
    formatPreference: "thread",
  };
}

function buildThreadDirectionChoices(args: {
  primaryTopic: string | null;
  styleCard: VoiceStyleCard | null;
  voice: QuickReplyVoiceProfile;
}): CreatorChatQuickReply[] {
  return [
    buildThreadDraftChip({
      topic: args.primaryTopic,
      styleCard: args.styleCard,
      threadStyle: "story",
      voice: args.voice,
    }),
    buildThreadDraftChip({
      topic: args.primaryTopic,
      styleCard: args.styleCard,
      threadStyle: "breakdown",
      voice: args.voice,
    }),
    buildThreadAngleChip(args.primaryTopic, args.voice),
  ];
}

function buildLooseFallbackChoices(args: {
  primaryTopic: string | null;
  styleCard: VoiceStyleCard | null;
  isVerifiedAccount: boolean;
  requestedFormatPreference?: DraftFormatPreference | null;
  voice: QuickReplyVoiceProfile;
}): CreatorChatQuickReply[] {
  if (args.requestedFormatPreference === "thread") {
    return buildThreadDirectionChoices({
      primaryTopic: args.primaryTopic,
      styleCard: args.styleCard,
      voice: args.voice,
    });
  }

  if (args.isVerifiedAccount) {
    return [
      buildFormatAwareDraftChip({
        topic: args.primaryTopic,
        styleCard: args.styleCard,
        formatPreference: "shortform",
        voice: args.voice,
      }),
      buildFormatAwareDraftChip({
        topic: args.primaryTopic,
        styleCard: args.styleCard,
        formatPreference: "longform",
        voice: args.voice,
      }),
      buildAngleChip(args.primaryTopic, args.voice),
    ];
  }

  const topicChoices = args.primaryTopic
    ? [buildTopicDraftChip(args.primaryTopic, args.styleCard, args.voice)]
    : [];

  const usualLaneChoice: CreatorChatQuickReply = {
    kind: "clarification_choice",
    value: applyQuickReplyVoiceCase(
      `draft something in my usual lane. keep it natural and close to my normal topics. ${buildPacingHint(args.styleCard)}`,
      args.voice,
    ),
    label: normalizeQuickReplyLabel(
      args.voice.concise ? "usual lane" : "my usual lane",
      args.voice,
    ),
    explicitIntent: "plan",
  };
  const recentChoice: CreatorChatQuickReply = {
    kind: "clarification_choice",
    value: applyQuickReplyVoiceCase(
      `draft something recent i could realistically post. keep it in my voice, make it feel current, and stay close to my usual topics. ${buildPacingHint(args.styleCard)}`,
      args.voice,
    ),
    label: normalizeQuickReplyLabel(
      args.voice.concise ? "recent post" : "something recent",
      args.voice,
    ),
    explicitIntent: "plan",
  };
  const angleChoice = buildAngleChip(args.primaryTopic, args.voice);

  if (args.primaryTopic) {
    return [topicChoices[0], usualLaneChoice, angleChoice];
  }

  return [usualLaneChoice, recentChoice, angleChoice];
}

export function buildDynamicDraftChoices(args: {
  styleCard: VoiceStyleCard | null;
  topicAnchors: string[];
  seedTopic: string | null;
  isVerifiedAccount: boolean;
  requestedFormatPreference?: DraftFormatPreference | null;
  mode: "topic_known" | "loose";
}): CreatorChatQuickReply[] {
  const voice = resolveQuickReplyVoiceProfile(args.styleCard);
  const collectedChoices = collectDraftTopicCandidates(
    args.styleCard,
    args.topicAnchors,
    args.seedTopic,
  );
  const topicalChoices = collectedChoices.filter((topic) => {
    const score = scoreTopicCandidate(topic, {
      seedTopic: args.seedTopic,
      styleCard: args.styleCard,
      topicAnchors: args.topicAnchors,
    });

    if (!isHumanSafeTopicLabel(topic)) {
      return false;
    }

    return args.mode === "topic_known" ? score >= 4 : score >= 5;
  });
  const primaryTopic = topicalChoices[0] || null;

  if (args.requestedFormatPreference === "thread") {
    return buildThreadDirectionChoices({
      primaryTopic,
      styleCard: args.styleCard,
      voice,
    });
  }

  if (args.mode === "topic_known" && args.isVerifiedAccount) {
    return [
      buildFormatAwareDraftChip({
        topic: primaryTopic,
        styleCard: args.styleCard,
        formatPreference: "shortform",
        voice,
      }),
      buildFormatAwareDraftChip({
        topic: primaryTopic,
        styleCard: args.styleCard,
        formatPreference: "longform",
        voice,
      }),
      buildAngleChip(primaryTopic, voice),
    ];
  }

  if (topicalChoices.length >= 2) {
    return [
      buildTopicDraftChip(topicalChoices[0], args.styleCard, voice),
      buildTopicDraftChip(topicalChoices[1], args.styleCard, voice),
      buildAngleChip(primaryTopic, voice),
    ];
  }

  return buildLooseFallbackChoices({
    primaryTopic,
    styleCard: args.styleCard,
    isVerifiedAccount: args.isVerifiedAccount,
    requestedFormatPreference: args.requestedFormatPreference,
    voice,
  });
}
