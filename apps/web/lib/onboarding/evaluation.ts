import { buildCreatorProfile } from "./profile/creatorProfile";
import type {
  AnalysisConfidenceBand,
  CreatorProfile,
  OnboardingResult,
} from "./types";

export const CREATOR_EVALUATION_RUBRIC_VERSION = "creator_eval_v8";
export const CREATOR_PROFILE_MODEL_VERSION = "deterministic_v1";

export type CreatorEvaluationStatus = "strong" | "usable" | "weak";

export interface CreatorEvaluationCheck {
  key:
    | "sample_quality"
    | "topic_quality"
    | "niche_overlay_quality"
    | "target_niche_quality"
    | "archetype_confidence"
    | "playbook_quality"
    | "strategy_specificity"
    | "interaction_signal_quality"
    | "conversation_conversion_quality"
    | "distribution_loop_quality"
    | "anchor_quality"
    | "voice_match_quality";
  label: string;
  score: number;
  status: CreatorEvaluationStatus;
  summary: string;
}

export interface CreatorEvaluationSnapshot {
  sampleSize: number;
  replyCount: number;
  quoteCount: number;
  growthStage: OnboardingResult["growthStage"];
  primaryNiche: CreatorProfile["niche"]["primaryNiche"];
  secondaryNiche: CreatorProfile["niche"]["secondaryNiche"];
  targetNiche: CreatorProfile["niche"]["targetNiche"];
  archetype: CreatorProfile["archetype"];
  secondaryArchetype: CreatorProfile["secondaryArchetype"];
  conversationReadiness: CreatorProfile["conversation"]["readiness"];
  distributionLoop: CreatorProfile["distribution"]["primaryLoop"];
  voiceCasing: CreatorProfile["voice"]["primaryCasing"];
  topTopic: string | null;
}

export interface CreatorEvaluationResult {
  generatedAt: string;
  rubricVersion: string;
  creatorProfileVersion: string;
  runId: string;
  account: string;
  source: OnboardingResult["source"];
  overallScore: number;
  checks: CreatorEvaluationCheck[];
  blockers: string[];
  nextImprovements: string[];
  snapshot: CreatorEvaluationSnapshot;
}

function toStatus(score: number): CreatorEvaluationStatus {
  if (score >= 80) {
    return "strong";
  }

  if (score >= 55) {
    return "usable";
  }

  return "weak";
}

function createCheck(
  key: CreatorEvaluationCheck["key"],
  label: string,
  score: number,
  summary: string,
): CreatorEvaluationCheck {
  const bounded = Math.max(0, Math.min(100, Number(score.toFixed(2))));
  return {
    key,
    label,
    score: bounded,
    status: toStatus(bounded),
    summary,
  };
}

function bandLabel(band: AnalysisConfidenceBand): string {
  if (band === "very_low") {
    return "very low";
  }

  return band.replace(/_/g, " ");
}

function evaluateSampleQuality(onboarding: OnboardingResult): CreatorEvaluationCheck {
  const confidence = onboarding.analysisConfidence;
  return createCheck(
    "sample_quality",
    "Sample Quality",
    confidence.score,
    `Sample depth is ${bandLabel(confidence.band)} at ${confidence.sampleSize} original posts. ${confidence.message}`,
  );
}

function evaluateTopicQuality(profile: CreatorProfile): CreatorEvaluationCheck {
  const topTopic = profile.topics.dominantTopics[0];

  if (!topTopic) {
    return createCheck(
      "topic_quality",
      "Topic Quality",
      30,
      "No strong topic signal was extracted yet, so topic-driven recommendations are still weak.",
    );
  }

  const scoreBase =
    30 +
    Math.min(25, profile.topics.dominantTopics.length * 7) +
    Math.min(20, topTopic.count * 5) +
    (topTopic.specificity === "broad" ? 0 : 10) +
    (topTopic.stability === "steady" ? 8 : topTopic.stability === "emerging" ? 10 : 2);

  return createCheck(
    "topic_quality",
    "Topic Quality",
    scoreBase,
    `${topTopic.label} is the current top topic (${topTopic.percentage}% of posts, ${topTopic.stability}). Topic specificity is ${topTopic.specificity}.`,
  );
}

function evaluateNicheOverlayQuality(
  onboarding: OnboardingResult,
  profile: CreatorProfile,
): CreatorEvaluationCheck {
  const primaryNiche = profile.niche.primaryNiche;
  const secondaryNiche = profile.niche.secondaryNiche;
  const domainSignalCount = profile.niche.domainSignals.length;
  const offerSignalCount = profile.niche.offerSignals.length;
  const topTopic = profile.topics.dominantTopics[0] ?? null;
  const readablePrimary = primaryNiche.replace(/_/g, " ");
  const readableSecondary = secondaryNiche?.replace(/_/g, " ");

  let score =
    profile.niche.confidence * 0.65 +
    Math.min(15, domainSignalCount * 5) +
    Math.min(10, offerSignalCount * 3);

  if (primaryNiche === "generalist") {
    score -= 18;
  }

  if (topTopic && primaryNiche !== "generalist") {
    const topicLabel = topTopic.label.toLowerCase();
    const nicheMatch = readablePrimary
      .split(" ")
      .some((token) => token.length > 2 && topicLabel.includes(token));
    if (nicheMatch) {
      score += 8;
    } else if (profile.niche.domainSignals.some((signal) => signal.score >= 4)) {
      score += 4;
    }
  }

  if (
    onboarding.strategyState.goal === "leads" &&
    profile.niche.likelyOffer === "audience_only"
  ) {
    score -= 6;
  }

  const summaryBase =
    primaryNiche === "generalist"
      ? "The account still reads as generalist, so domain-specific playbook guidance should stay cautious."
      : `Primary niche is ${readablePrimary} at ${profile.niche.confidence}% confidence.`;

  const secondaryNote = readableSecondary
    ? ` Secondary niche pressure exists around ${readableSecondary}.`
    : "";

  return createCheck(
    "niche_overlay_quality",
    "Niche Overlay Quality",
    score,
    `${summaryBase}${secondaryNote} Likely offer is ${profile.niche.likelyOffer.replace(
      /_/g,
      " ",
    )}.`,
  );
}

function evaluateTargetNicheQuality(profile: CreatorProfile): CreatorEvaluationCheck {
  const { primaryNiche, targetNiche, recommendedNiches, transitionSummary } =
    profile.niche;

  if (!targetNiche) {
    return createCheck(
      "target_niche_quality",
      "Target Niche Quality",
      primaryNiche === "generalist" ? 28 : 62,
      primaryNiche === "generalist"
        ? "The account is broad right now, but no clear target niche recommendation was produced yet."
        : "The current niche is usable, but there is no explicit target niche handoff yet.",
    );
  }

  const topRecommendation = recommendedNiches[0] ?? null;
  const secondRecommendation = recommendedNiches[1] ?? null;
  const topScore = topRecommendation?.score ?? 0;
  const secondScore = secondRecommendation?.score ?? 0;
  const spread = Math.max(0, topScore - secondScore);
  const rationaleLength = topRecommendation?.rationale.trim().length ?? 0;

  let score =
    30 +
    Math.min(28, topScore * 0.7) +
    Math.min(16, spread * 0.8) +
    Math.min(12, recommendedNiches.length * 4) +
    (rationaleLength >= 40 ? 8 : rationaleLength >= 15 ? 4 : 0);

  if (primaryNiche === "generalist" && targetNiche !== "generalist") {
    score += 8;
  }

  if (primaryNiche !== "generalist" && targetNiche === primaryNiche) {
    score += 4;
  }

  if (/broad|generalist|mixed|clearer niche|build toward/i.test(transitionSummary)) {
    score += 6;
  }

  return createCheck(
    "target_niche_quality",
    "Target Niche Quality",
    score,
    primaryNiche === "generalist"
      ? `Observed niche is still broad, but the strongest target niche is ${targetNiche.replace(
          /_/g,
          " ",
        )}. ${transitionSummary}`
      : `Target niche is ${targetNiche.replace(
          /_/g,
          " ",
        )} with ${recommendedNiches.length} ranked recommendation(s). ${transitionSummary}`,
  );
}

function evaluateArchetypeConfidence(profile: CreatorProfile): CreatorEvaluationCheck {
  const secondary = profile.secondaryArchetype
    ? ` Secondary archetype is ${profile.secondaryArchetype}.`
    : "";

  return createCheck(
    "archetype_confidence",
    "Archetype Confidence",
    profile.archetypeConfidence,
    `Primary archetype is ${profile.archetype} at ${profile.archetypeConfidence}% confidence.${secondary}`,
  );
}

function evaluatePlaybookQuality(profile: CreatorProfile): CreatorEvaluationCheck {
  const nicheLabel = profile.niche.primaryNiche.replace(/_/g, " ");
  const hasNicheSpecialization =
    profile.niche.primaryNiche !== "generalist" &&
    (profile.playbook.toneGuidelines.some((line) =>
      line.toLowerCase().includes(nicheLabel),
    ) ||
      profile.playbook.experimentFocus.some((line) =>
        line.toLowerCase().includes(nicheLabel),
      ));

  const loopTerms: Record<CreatorProfile["distribution"]["primaryLoop"], string[]> = {
    reply_driven: ["reply", "conversation"],
    standalone_discovery: ["standalone", "native"],
    quote_commentary: ["quote", "commentary"],
    profile_conversion: ["profile", "conversion", "offer"],
    authority_building: ["point-of-view", "authority", "thoughtful"],
  };
  const loopText = [
    profile.playbook.conversationTactic,
    ...profile.playbook.experimentFocus,
    ...profile.playbook.toneGuidelines,
  ]
    .join(" ")
    .toLowerCase();
  const hasLoopSpecialization = loopTerms[profile.distribution.primaryLoop].some((term) =>
    loopText.includes(term),
  );

  const hasCapacitySignals =
    /per week|per day|reply budget|reply block|reply window/.test(
      `${profile.playbook.cadence.posting} ${profile.playbook.cadence.replies}`.toLowerCase(),
    );

  const score =
    20 +
    Math.min(16, profile.playbook.toneGuidelines.length * 4) +
    Math.min(12, profile.playbook.preferredContentTypes.length * 4) +
    Math.min(12, profile.playbook.preferredHookPatterns.length * 4) +
    Math.min(16, profile.playbook.experimentFocus.length * 4) +
    (hasNicheSpecialization ? 12 : profile.niche.primaryNiche === "generalist" ? 6 : 0) +
    (hasLoopSpecialization ? 10 : 0) +
    (hasCapacitySignals ? 8 : 0);

  const nicheNote =
    profile.niche.primaryNiche === "generalist"
      ? "Niche specialization is intentionally lighter because the account still reads as generalist."
      : hasNicheSpecialization
        ? `Playbook explicitly references the ${nicheLabel} niche.`
        : "Playbook still reads too generic for the inferred niche.";

  const loopNote = hasLoopSpecialization
    ? `The ${profile.distribution.primaryLoop.replace(/_/g, " ")} loop is reflected in the playbook.`
    : "The playbook does not yet clearly operationalize the inferred distribution loop.";

  return createCheck(
    "playbook_quality",
    "Playbook Quality",
    score,
    `${nicheNote} ${loopNote} Capacity-aware cadence is ${
      hasCapacitySignals ? "present" : "not clearly expressed"
    }.`,
  );
}

function evaluateStrategySpecificity(profile: CreatorProfile): CreatorEvaluationCheck {
  const strengths = profile.strategy.currentStrengths.length;
  const weaknesses = profile.strategy.currentWeaknesses.length;
  const angles = profile.strategy.recommendedAngles.length;
  const nextMoves = profile.strategy.nextMoves.length;
  const hasFallbackOnly =
    angles === 1 &&
    profile.strategy.recommendedAngles[0] ===
      "Increase consistency around one repeatable content pillar.";
  const scoreBase =
    25 +
    Math.min(20, strengths * 5) +
    Math.min(20, weaknesses * 5) +
    Math.min(20, angles * 5) +
    Math.min(15, nextMoves * 3) -
    (hasFallbackOnly ? 20 : 0);

  return createCheck(
    "strategy_specificity",
    "Strategy Specificity",
    scoreBase,
    `Strategy currently has ${strengths} strengths, ${weaknesses} weaknesses, ${angles} recommended angles, and ${nextMoves} next moves.`,
  );
}

function evaluateInteractionSignalQuality(profile: CreatorProfile): CreatorEvaluationCheck {
  const laneConfidences = [
    profile.reply.signalConfidence,
    profile.quote.signalConfidence,
  ].filter((value) => value > 0);
  const score =
    laneConfidences.length > 0
      ? laneConfidences.reduce((sum, value) => sum + value, 0) /
        laneConfidences.length
      : 35;

  const replyState = profile.reply.isReliable
    ? `Reply lane is reliable at ${profile.reply.signalConfidence}%.`
    : profile.reply.replyCount > 0
      ? `Reply lane is low-sample at ${profile.reply.signalConfidence}%.`
      : "No reply lane signal yet.";
  const quoteState = profile.quote.isReliable
    ? `Quote lane is reliable at ${profile.quote.signalConfidence}%.`
    : profile.quote.quoteCount > 0
      ? `Quote lane is low-sample at ${profile.quote.signalConfidence}%.`
      : "No quote lane signal yet.";

  return createCheck(
    "interaction_signal_quality",
    "Interaction Signal Quality",
    score,
    `${replyState} ${quoteState}`,
  );
}

function evaluateConversationConversionQuality(
  onboarding: OnboardingResult,
  profile: CreatorProfile,
): CreatorEvaluationCheck {
  let score = profile.conversation.conversationConversionScore * 0.75;

  if (profile.reply.isReliable) {
    score += 10;
  } else if (profile.reply.replyCount > 0) {
    score += 4;
  }

  if (profile.conversation.authorReplyFollowThroughProxy !== null) {
    score += Math.min(
      12,
      profile.conversation.authorReplyFollowThroughProxy * 0.2,
    );
  }

  if (
    onboarding.strategyState.goal === "followers" &&
    profile.conversation.readiness === "high"
  ) {
    score += 8;
  }

  if (
    onboarding.strategyState.goal === "followers" &&
    profile.conversation.readiness === "low"
  ) {
    score -= 8;
  }

  return createCheck(
    "conversation_conversion_quality",
    "Conversation Conversion Quality",
    score,
    `Conversation readiness is ${profile.conversation.readiness}. Average replies per original post is ${profile.conversation.averageRepliesPerOriginalPost}, and ${profile.conversation.postsWithRepliesRate}% of original posts currently earn replies. ${profile.conversation.rationale}`,
  );
}

function evaluateDistributionLoopQuality(
  onboarding: OnboardingResult,
  profile: CreatorProfile,
): CreatorEvaluationCheck {
  let coherenceScore = 0;

  if (profile.distribution.primaryLoop === "reply_driven") {
    coherenceScore += profile.execution.deliveryStyle === "reply_led" ? 18 : 4;
    coherenceScore += profile.reply.isReliable ? 14 : profile.reply.replyCount > 0 ? 6 : 0;
    coherenceScore +=
      profile.reply.replyEngagementDeltaVsOriginalPercent !== null &&
      profile.reply.replyEngagementDeltaVsOriginalPercent >= 0
        ? 10
        : 0;
  }

  if (profile.distribution.primaryLoop === "standalone_discovery") {
    coherenceScore += profile.execution.deliveryStyle === "standalone" ? 18 : 8;
    coherenceScore += profile.execution.linkDependence === "low" ? 10 : 0;
    coherenceScore += profile.execution.mentionDependence === "low" ? 8 : 0;
    coherenceScore += profile.topics.audienceBreadth !== "narrow" ? 6 : 0;
  }

  if (profile.distribution.primaryLoop === "quote_commentary") {
    coherenceScore += profile.quote.quoteCount > 0 ? 10 : 0;
    coherenceScore += profile.quote.isReliable ? 14 : profile.quote.quoteCount > 0 ? 6 : 0;
    coherenceScore +=
      profile.quote.quoteEngagementDeltaVsOriginalPercent !== null &&
      profile.quote.quoteEngagementDeltaVsOriginalPercent >= 0
        ? 10
        : 0;
  }

  if (profile.distribution.primaryLoop === "profile_conversion") {
    coherenceScore += profile.execution.ctaIntensity !== "low" ? 14 : 0;
    coherenceScore += profile.execution.linkDependence !== "low" ? 8 : 0;
    coherenceScore += profile.execution.mentionDependence !== "low" ? 6 : 0;
    coherenceScore += onboarding.strategyState.goal === "leads" ? 8 : 0;
  }

  if (profile.distribution.primaryLoop === "authority_building") {
    coherenceScore +=
      profile.voice.averageLengthBand === "long"
        ? 12
        : profile.voice.averageLengthBand === "medium"
          ? 8
          : 0;
    coherenceScore +=
      profile.voice.dominantHookPattern === "how_to_open" ||
      profile.voice.dominantHookPattern === "numeric_open" ||
      profile.voice.dominantHookPattern === "statement_open"
        ? 8
        : 0;
    coherenceScore += profile.execution.linkDependence === "low" ? 8 : 0;
    coherenceScore += profile.quote.isReliable ? 4 : 0;
  }

  const score = Math.max(
    0,
    Math.min(
      100,
      Number(
        (profile.distribution.confidence * 0.65 +
          coherenceScore +
          Math.min(8, profile.distribution.signals.length * 2) -
          (profile.distribution.secondaryLoop ? 4 : 0)).toFixed(2),
      ),
    ),
  );

  const secondary = profile.distribution.secondaryLoop
    ? ` Secondary loop is ${profile.distribution.secondaryLoop.replace(/_/g, " ")}.`
    : "";

  return createCheck(
    "distribution_loop_quality",
    "Distribution Loop Quality",
    score,
    `Primary loop is ${profile.distribution.primaryLoop.replace(/_/g, " ")} at ${profile.distribution.confidence}% confidence.${secondary} ${profile.distribution.rationale}`,
  );
}

function evaluateAnchorQuality(profile: CreatorProfile): CreatorEvaluationCheck {
  const positiveGroups = [
    profile.examples.bestPerforming,
    profile.examples.voiceAnchors,
    profile.examples.strategyAnchors,
    profile.examples.goalAnchors,
  ];
  const positiveAnchors = positiveGroups.flat();
  const presentPositiveGroups = positiveGroups.filter((group) => group.length > 0).length;
  const positiveUniqueIds = new Set(positiveAnchors.map((post) => post.id));
  const positiveLanes = new Set(positiveAnchors.map((post) => post.lane));

  const goalConflictExamples = profile.examples.goalConflictExamples;
  const cautionExamples = profile.examples.cautionExamples;
  const negativeAnchors = [...goalConflictExamples, ...cautionExamples];
  const negativeUniqueIds = new Set(negativeAnchors.map((post) => post.id));
  const negativeLanes = new Set(negativeAnchors.map((post) => post.lane));
  const cautionIds = new Set(cautionExamples.map((post) => post.id));
  const distinctGoalConflictCount = goalConflictExamples.filter(
    (post) => !cautionIds.has(post.id),
  ).length;

  const score =
    18 +
    Math.min(24, positiveUniqueIds.size * 4) +
    Math.min(16, presentPositiveGroups * 4) +
    Math.min(12, positiveLanes.size * 4) +
    Math.min(12, negativeUniqueIds.size * 3) +
    Math.min(10, distinctGoalConflictCount * 5) +
    Math.min(8, negativeLanes.size * 4) -
    (presentPositiveGroups <= 1 ? 18 : 0) -
    (goalConflictExamples.length === 0 ? 12 : 0);

  const conflictNote =
    goalConflictExamples.length === 0
      ? "No goal-conflict examples were selected yet."
      : distinctGoalConflictCount === 0
        ? "Goal-conflict retrieval currently overlaps with generic caution examples."
        : `${distinctGoalConflictCount} goal-conflict examples are distinct from generic caution examples.`;

  return createCheck(
    "anchor_quality",
    "Anchor Quality",
    score,
    `Positive anchors cover ${presentPositiveGroups} retrieval sets, ${positiveUniqueIds.size} unique posts, and ${positiveLanes.size} lanes. ${conflictNote}`,
  );
}

function evaluateVoiceMatchQuality(profile: CreatorProfile): CreatorEvaluationCheck {
  const styleCard = profile.styleCard;
  const primaryVoiceAnchors = profile.examples.voiceAnchors;
  const replyVoiceAnchors = profile.examples.replyVoiceAnchors;
  const quoteVoiceAnchors = profile.examples.quoteVoiceAnchors;

  const styleRichness =
    styleCard.preferredOpeners.length +
    styleCard.preferredClosers.length +
    styleCard.signaturePhrases.length +
    styleCard.punctuationGuidelines.length;
  const laneCoverage =
    (primaryVoiceAnchors.length > 0 ? 1 : 0) +
    (replyVoiceAnchors.length > 0 ? 1 : 0) +
    (quoteVoiceAnchors.length > 0 ? 1 : 0);
  const hasExplicitLowercaseSignal =
    profile.voice.primaryCasing === "lowercase" &&
    profile.voice.lowercaseSharePercent >= 55;
  const hasForbiddenPhraseGuard =
    styleCard.forbiddenPhrases.length > 0;
  const hasSignaturePhrases = styleCard.signaturePhrases.length > 0;
  const hasReusableOpenClosePatterns =
    styleCard.preferredOpeners.length > 0 || styleCard.preferredClosers.length > 0;

  let score =
    22 +
    Math.min(20, styleRichness * 4) +
    Math.min(18, primaryVoiceAnchors.length * 6) +
    Math.min(12, laneCoverage * 4) +
    (hasSignaturePhrases ? 10 : 0) +
    (hasReusableOpenClosePatterns ? 8 : 0) +
    (hasForbiddenPhraseGuard ? 8 : 0);

  if (profile.voice.primaryCasing === "lowercase") {
    score += hasExplicitLowercaseSignal ? 10 : 2;
  } else {
    score += profile.voice.lowercaseSharePercent <= 60 ? 6 : 0;
  }

  if (primaryVoiceAnchors.length === 0) {
    score -= 15;
  }

  if (styleRichness <= 2) {
    score -= 12;
  }

  if (!hasForbiddenPhraseGuard) {
    score -= 6;
  }

  const laneNote =
    laneCoverage >= 3
      ? "Voice anchors now cover originals, replies, and quotes."
      : laneCoverage === 2
        ? "Voice anchors cover multiple lanes, but one lane is still sparse."
        : "Voice anchors are still concentrated in one lane.";

  const casingNote =
    profile.voice.primaryCasing === "lowercase"
      ? `Observed casing is lowercase with ${profile.voice.lowercaseSharePercent}% lowercase share.`
      : `Observed casing is ${profile.voice.primaryCasing} with ${profile.voice.lowercaseSharePercent}% lowercase share.`;

  return createCheck(
    "voice_match_quality",
    "Voice Match Quality",
    score,
    `${casingNote} Style card richness is ${styleRichness}. ${laneNote} Forbidden-phrase guard is ${
      hasForbiddenPhraseGuard ? "present" : "missing"
    }.`,
  );
}

function buildBlockers(
  onboarding: OnboardingResult,
  profile: CreatorProfile,
  checks: CreatorEvaluationCheck[],
): string[] {
  const blockers: string[] = [];
  const weakChecks = checks.filter((check) => check.status === "weak");

  if (!onboarding.analysisConfidence.minimumViableReached) {
    blockers.push("Sample is below minimum viable depth.");
  }

  if (profile.topics.dominantTopics.length === 0) {
    blockers.push("Topic layer is too weak to drive strong strategy.");
  }

  if (checks.some((check) => check.key === "niche_overlay_quality" && check.status === "weak")) {
    blockers.push("Niche overlay is still too weak to reliably specialize the playbook.");
  }

  if (checks.some((check) => check.key === "target_niche_quality" && check.status === "weak")) {
    blockers.push("Target niche recommendation is still too weak to guide a clear niche transition.");
  }

  if (profile.archetypeConfidence < 55) {
    blockers.push("Archetype signal is still mixed.");
  }

  if (checks.some((check) => check.key === "playbook_quality" && check.status === "weak")) {
    blockers.push("Playbook is still too generic to guide generation confidently.");
  }

  if (
    checks.some(
      (check) =>
        check.key === "conversation_conversion_quality" && check.status === "weak",
    )
  ) {
    blockers.push(
      "Conversation conversion is still too weak to rely on reply-led growth planning.",
    );
  }

  if (
    checks.some(
      (check) => check.key === "distribution_loop_quality" && check.status === "weak",
    )
  ) {
    blockers.push("Distribution loop inference is still too weak to drive aggressive growth planning.");
  }

  if (checks.some((check) => check.key === "anchor_quality" && check.status === "weak")) {
    blockers.push("Retrieval anchors are still too shallow for reliable planning context.");
  }

  if (
    checks.some((check) => check.key === "voice_match_quality" && check.status === "weak")
  ) {
    blockers.push("Voice fidelity is still too weak to trust creator-matching generation.");
  }

  if (
    profile.identity.followerBand === "0-1k" &&
    !profile.reply.isReliable &&
    !profile.quote.isReliable
  ) {
    blockers.push(
      "Interaction lanes are still low-confidence for early-stage growth tactics.",
    );
  }

  if (weakChecks.length >= 3) {
    blockers.push(
      "Multiple weak checks are still present, so downstream drafting should stay conservative.",
    );
  }

  return blockers;
}

function buildNextImprovements(
  onboarding: OnboardingResult,
  profile: CreatorProfile,
  checks: CreatorEvaluationCheck[],
): string[] {
  const improvements: string[] = [];
  const weakKeys = new Set(
    checks.filter((check) => check.status === "weak").map((check) => check.key),
  );

  if (
    !onboarding.analysisConfidence.recommendedDepthReached ||
    weakKeys.has("sample_quality")
  ) {
    improvements.push("Backfill deeper post history before trusting strategy too heavily.");
  }

  if (weakKeys.has("topic_quality")) {
    improvements.push(
      "Improve topic/entity resolution or gather more data until stronger repeated topics appear.",
    );
  }

  if (weakKeys.has("niche_overlay_quality")) {
    improvements.push(
      "Tighten domain detection until the system can separate niche, offer, and behavior more clearly.",
    );
  }

  if (weakKeys.has("target_niche_quality")) {
    improvements.push(
      "Strengthen target niche recommendations so broad accounts get a clearer lane to build toward.",
    );
  }

  if (weakKeys.has("archetype_confidence")) {
    improvements.push(
      "Keep archetype guidance blended until the creator signal becomes less mixed.",
    );
  }

  if (weakKeys.has("playbook_quality")) {
    improvements.push(
      "Make the playbook more operational so it reflects niche, distribution loop, and user capacity more explicitly.",
    );
  }

  if (weakKeys.has("interaction_signal_quality")) {
    improvements.push(
      "Keep reply and quote lanes advisory-only until their samples become more reliable.",
    );
  }

  if (weakKeys.has("conversation_conversion_quality")) {
    improvements.push(
      "Improve conversation conversion before leaning on reply-led growth loops too heavily.",
    );
  }

  if (weakKeys.has("distribution_loop_quality")) {
    improvements.push(
      "Keep distribution-loop guidance advisory until the inferred growth loop aligns more clearly with observed behavior.",
    );
  }

  if (weakKeys.has("strategy_specificity")) {
    improvements.push(
      "Strengthen the strategy delta so recommendations become more specific than generic pattern advice.",
    );
  }

  if (weakKeys.has("anchor_quality")) {
    improvements.push(
      "Improve positive and negative retrieval coverage so the agent context has stronger concrete examples to follow and avoid.",
    );
  }

  if (weakKeys.has("voice_match_quality")) {
    improvements.push(
      "Strengthen style-card richness and lane-specific voice anchors so generation can match the creator's real phrasing more reliably.",
    );
  }

  if (improvements.length === 0) {
    improvements.push(
      "The current deterministic layer is in a usable place. The next gains should come from deeper data and retrieval, not broad rewrites.",
    );
  }

  return improvements.slice(0, 5);
}

export function evaluateCreatorProfile(params: {
  runId: string;
  onboarding: OnboardingResult;
  creatorProfile?: CreatorProfile;
}): CreatorEvaluationResult {
  const profile =
    params.creatorProfile ??
    buildCreatorProfile({
      sourceRunId: params.runId,
      onboarding: params.onboarding,
    });

  const checks = [
    evaluateSampleQuality(params.onboarding),
    evaluateTopicQuality(profile),
    evaluateNicheOverlayQuality(params.onboarding, profile),
    evaluateTargetNicheQuality(profile),
    evaluateArchetypeConfidence(profile),
    evaluatePlaybookQuality(profile),
    evaluateStrategySpecificity(profile),
    evaluateInteractionSignalQuality(profile),
    evaluateConversationConversionQuality(params.onboarding, profile),
    evaluateDistributionLoopQuality(params.onboarding, profile),
    evaluateAnchorQuality(profile),
    evaluateVoiceMatchQuality(profile),
  ];

  const overallScore = Number(
    (
      checks.reduce((sum, check) => sum + check.score, 0) / Math.max(1, checks.length)
    ).toFixed(2),
  );

  return {
    generatedAt: new Date().toISOString(),
    rubricVersion: CREATOR_EVALUATION_RUBRIC_VERSION,
    creatorProfileVersion: CREATOR_PROFILE_MODEL_VERSION,
    runId: params.runId,
    account: params.onboarding.account,
    source: params.onboarding.source,
    overallScore,
    checks,
    blockers: buildBlockers(params.onboarding, profile, checks),
    nextImprovements: buildNextImprovements(params.onboarding, profile, checks),
    snapshot: {
      sampleSize: params.onboarding.recentPostSampleCount,
      replyCount: params.onboarding.replyPostSampleCount,
      quoteCount: params.onboarding.quotePostSampleCount,
      growthStage: params.onboarding.growthStage,
      primaryNiche: profile.niche.primaryNiche,
      secondaryNiche: profile.niche.secondaryNiche,
      targetNiche: profile.niche.targetNiche,
      archetype: profile.archetype,
      secondaryArchetype: profile.secondaryArchetype,
      conversationReadiness: profile.conversation.readiness,
      distributionLoop: profile.distribution.primaryLoop,
      voiceCasing: profile.voice.primaryCasing,
      topTopic: profile.topics.dominantTopics[0]?.label ?? null,
    },
  };
}
