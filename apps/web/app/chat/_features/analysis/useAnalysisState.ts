"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { CreatorAgentContext } from "@/lib/onboarding/strategy/agentContext";
import {
  buildRecommendedPlaybooks,
  type PlaybookDefinition,
  type PlaybookStageKey,
} from "@/lib/creator/playbooks";

interface ValidationError {
  message: string;
}

interface ProfileScrapeRefreshSuccess {
  ok: true;
  refreshed: boolean;
  reason:
    | "manual_refresh"
    | "new_posts_detected"
    | "fresh_enough"
    | "no_new_posts_detected"
    | "probe_failed"
    | "missing_onboarding_run";
  runId?: string;
  persistedAt?: string;
  cooldownUntil?: string | null;
  retryAfterSeconds?: number;
  syncedPostCount?: number;
  queuedBackfill?: boolean;
}

interface ProfileScrapeRefreshFailure {
  ok: false;
  code?: "COOLDOWN";
  errors: ValidationError[];
  cooldownUntil?: string | null;
  retryAfterSeconds?: number;
}

type ProfileScrapeRefreshResponse =
  | ProfileScrapeRefreshSuccess
  | ProfileScrapeRefreshFailure;

interface AnalysisFollowerProgress {
  currentFollowersLabel: string;
  targetFollowersLabel: string;
  progressPercent: number;
}

interface AnalysisSnapshotCard {
  label: string;
  value: string;
  meta?: string;
}

interface AnalysisPriorityItem {
  area: string;
  direction: string;
  note: string;
  priority: string;
}

interface AnalysisRecommendedPlaybook {
  stage: PlaybookStageKey;
  playbook: PlaybookDefinition;
  whyFit: string;
}

interface AnalysisVoiceSignalChip {
  label: string;
  value: string;
}

interface AnalysisEvidencePost {
  id: string;
  label: string;
  lane: string;
  reason: string;
  text: string;
  engagementTotal: number;
  goalFitScore: number;
  createdAt: string;
}

interface AnalysisReplyConversionHighlight {
  label: string;
  value: string;
}

interface ProfileAuditMutationSuccess {
  ok: true;
  data: {
    profileAuditState: {
      lastDismissedFingerprint: string | null;
      headerClarity: "clear" | "unclear" | "unsure" | null;
      headerClarityAnsweredAt: string | null;
      headerClarityBannerUrl: string | null;
    };
  };
}

interface ProfileAuditMutationFailure {
  ok: false;
  errors: ValidationError[];
}

type ProfileAuditMutationResponse =
  | ProfileAuditMutationSuccess
  | ProfileAuditMutationFailure;

interface UseAnalysisStateOptions {
  accountName: string | null;
  activeThreadId: string | null;
  context: CreatorAgentContext | null;
  currentPlaybookStage: PlaybookStageKey;
  fetchWorkspace: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  loadWorkspace: () => Promise<unknown>;
  submitQuickStarter: (prompt: string) => Promise<void>;
  dedupePreserveOrder: (values: string[]) => string[];
  formatEnumLabel: (value: string) => string;
  formatNicheSummary: (context: CreatorAgentContext) => string;
}

function normalizeAccountHandle(value: string): string {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

function formatDurationCompact(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return "";
  }

  const totalSeconds = Math.ceil(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes <= 0) {
    return `${seconds}s`;
  }

  if (seconds === 0) {
    return `${minutes}m`;
  }

  return `${minutes}m ${seconds}s`;
}

export function useAnalysisState(options: UseAnalysisStateOptions) {
  const {
    accountName,
    activeThreadId,
    context,
    currentPlaybookStage,
    fetchWorkspace,
    loadWorkspace,
    submitQuickStarter,
    dedupePreserveOrder,
    formatEnumLabel,
    formatNicheSummary,
  } = options;
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [isAnalysisScrapeRefreshing, setIsAnalysisScrapeRefreshing] = useState(false);
  const [analysisScrapeNotice, setAnalysisScrapeNotice] = useState<string | null>(null);
  const [analysisScrapeNoticeTone, setAnalysisScrapeNoticeTone] = useState<
    "info" | "success" | "error"
  >("info");
  const [analysisScrapeCooldownUntil, setAnalysisScrapeCooldownUntil] = useState<string | null>(
    null,
  );
  const [analysisScrapeClockMs, setAnalysisScrapeClockMs] = useState<number>(() => Date.now());

  const dailyScrapeTriggerRef = useRef<string | null>(null);
  const autoOpenedFingerprintRef = useRef<string | null>(null);
  const dismissedFingerprintRef = useRef<string | null>(null);

  const analysisScrapeCooldownRemainingMs = useMemo(() => {
    if (!analysisScrapeCooldownUntil) {
      return 0;
    }

    const cooldownUntilMs = new Date(analysisScrapeCooldownUntil).getTime();
    if (!Number.isFinite(cooldownUntilMs)) {
      return 0;
    }

    return Math.max(0, cooldownUntilMs - analysisScrapeClockMs);
  }, [analysisScrapeClockMs, analysisScrapeCooldownUntil]);

  const isAnalysisScrapeCoolingDown = analysisScrapeCooldownRemainingMs > 0;
  const analysisScrapeCooldownLabel = useMemo(
    () => formatDurationCompact(analysisScrapeCooldownRemainingMs),
    [analysisScrapeCooldownRemainingMs],
  );

  const trackProductEvent = useCallback(
    async (params: {
      eventType: string;
      properties?: Record<string, unknown>;
    }) => {
      try {
        await fetchWorkspace("/api/creator/v2/product-events", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          keepalive: true,
          body: JSON.stringify({
            eventType: params.eventType,
            threadId: activeThreadId ?? null,
            properties: params.properties || {},
          }),
        });
      } catch (error) {
        console.error("Failed to record profile audit product event:", error);
      }
    },
    [activeThreadId, fetchWorkspace],
  );

  const persistProfileAuditState = useCallback(
    async (payload: {
      lastDismissedFingerprint?: string | null;
      headerClarity?: "clear" | "unclear" | "unsure" | null;
      headerClarityBannerUrl?: string | null;
    }): Promise<boolean> => {
      try {
        const response = await fetchWorkspace("/api/creator/v2/profile-audit", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        const data = (await response.json().catch(() => null)) as ProfileAuditMutationResponse | null;
        return Boolean(response.ok && data?.ok);
      } catch {
        return false;
      }
    },
    [fetchWorkspace],
  );

  const runProfileScrapeRefresh = useCallback(
    async (
      trigger: "manual" | "daily_login",
    ): Promise<
      | { ok: true; data: ProfileScrapeRefreshSuccess }
      | { ok: false; data: ProfileScrapeRefreshFailure | null }
    > => {
      try {
        const response = await fetchWorkspace("/api/creator/profile/scrape", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ trigger }),
        });

        let data: ProfileScrapeRefreshResponse | null = null;
        try {
          data = (await response.json()) as ProfileScrapeRefreshResponse;
        } catch {
          data = null;
        }

        if (data && "cooldownUntil" in data) {
          setAnalysisScrapeCooldownUntil(data.cooldownUntil ?? null);
          setAnalysisScrapeClockMs(Date.now());
        }

        if (!response.ok || !data || !data.ok) {
          return { ok: false, data: data && !data.ok ? data : null };
        }

        if (data.refreshed) {
          await loadWorkspace();
        }

        return { ok: true, data };
      } catch {
        return { ok: false, data: null };
      }
    },
    [fetchWorkspace, loadWorkspace],
  );

  const handleManualProfileScrapeRefresh = useCallback(async () => {
    if (isAnalysisScrapeRefreshing || isAnalysisScrapeCoolingDown) {
      return;
    }

    setIsAnalysisScrapeRefreshing(true);
    setAnalysisScrapeNoticeTone("info");
    setAnalysisScrapeNotice("running a fresh scrape...");

    try {
      const result = await runProfileScrapeRefresh("manual");
      if (!result.ok) {
        if (result.data?.code === "COOLDOWN") {
          const retryLabel = result.data.retryAfterSeconds
            ? formatDurationCompact(result.data.retryAfterSeconds * 1000)
            : analysisScrapeCooldownLabel;
          setAnalysisScrapeNoticeTone("info");
          setAnalysisScrapeNotice(
            retryLabel
              ? `scrape cooldown active. try again in ${retryLabel}.`
              : "scrape cooldown active. try again shortly.",
          );
          return;
        }

        const message = result.data?.errors[0]?.message ?? "failed to rerun scrape.";
        setAnalysisScrapeNoticeTone("error");
        setAnalysisScrapeNotice(message.toLowerCase());
        return;
      }

      if (result.data.refreshed) {
        setAnalysisScrapeNoticeTone("success");
        setAnalysisScrapeNotice("fresh scrape completed. profile analysis updated.");
        return;
      }

      if (result.data.reason === "missing_onboarding_run") {
        setAnalysisScrapeNoticeTone("error");
        setAnalysisScrapeNotice(
          "this account still needs setup. run onboarding once, then try again.",
        );
        return;
      }

      if (result.data.reason === "new_posts_detected") {
        setAnalysisScrapeNoticeTone("success");
        setAnalysisScrapeNotice(
          result.data.syncedPostCount && result.data.syncedPostCount > 0
            ? `synced ${result.data.syncedPostCount} new post${result.data.syncedPostCount === 1 ? "" : "s"}${result.data.queuedBackfill ? " and queued a deeper refresh" : ""}.`
            : "new posts were detected and synced in the background.",
        );
        return;
      }

      setAnalysisScrapeNoticeTone("info");
      setAnalysisScrapeNotice("scrape check completed. no profile changes detected.");
    } finally {
      setIsAnalysisScrapeRefreshing(false);
    }
  }, [
    analysisScrapeCooldownLabel,
    isAnalysisScrapeCoolingDown,
    isAnalysisScrapeRefreshing,
    runProfileScrapeRefresh,
  ]);

  useEffect(() => {
    if (!analysisScrapeCooldownUntil) {
      return;
    }

    const interval = window.setInterval(() => {
      setAnalysisScrapeClockMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [analysisScrapeCooldownUntil]);

  useEffect(() => {
    if (!analysisScrapeCooldownUntil) {
      return;
    }

    if (analysisScrapeCooldownRemainingMs <= 0) {
      setAnalysisScrapeCooldownUntil(null);
    }
  }, [analysisScrapeCooldownRemainingMs, analysisScrapeCooldownUntil]);

  useEffect(() => {
    if (!accountName) {
      return;
    }

    const normalized = normalizeAccountHandle(accountName);
    if (!normalized || dailyScrapeTriggerRef.current === normalized) {
      return;
    }

    dailyScrapeTriggerRef.current = normalized;
    void (async () => {
      const result = await runProfileScrapeRefresh("daily_login");
      if (!result.ok) {
        return;
      }

      if (result.data.refreshed) {
        setAnalysisScrapeNoticeTone("success");
        setAnalysisScrapeNotice("new posts detected and profile analysis refreshed.");
        return;
      }

      if (result.data.reason === "new_posts_detected") {
        setAnalysisScrapeNoticeTone("success");
        setAnalysisScrapeNotice(
          result.data.syncedPostCount && result.data.syncedPostCount > 0
            ? `synced ${result.data.syncedPostCount} new post${result.data.syncedPostCount === 1 ? "" : "s"}${result.data.queuedBackfill ? " and queued a deeper refresh" : ""} in the background.`
            : "new posts detected and synced in the background.",
        );
        return;
      }

      if (result.data.reason === "probe_failed") {
        setAnalysisScrapeNoticeTone("info");
        setAnalysisScrapeNotice("background freshness check was skipped for this login.");
      }
    })();
  }, [accountName, runProfileScrapeRefresh]);

  useEffect(() => {
    const audit = context?.profileConversionAudit;
    if (!audit?.shouldAutoOpen || !audit.fingerprint) {
      return;
    }

    if (dismissedFingerprintRef.current === audit.fingerprint) {
      return;
    }

    if (autoOpenedFingerprintRef.current === audit.fingerprint) {
      return;
    }

    autoOpenedFingerprintRef.current = audit.fingerprint;
    setAnalysisOpen(true);
    void trackProductEvent({
      eventType: "profile_audit_auto_opened",
      properties: {
        fingerprint: audit.fingerprint,
        score: audit.score,
      },
    });
  }, [context?.profileConversionAudit, trackProductEvent]);

  const analysisPriorityItems = useMemo<AnalysisPriorityItem[]>(
    () => context?.strategyDelta.adjustments.slice(0, 3) ?? [],
    [context],
  );

  const analysisFollowerProgress = useMemo<AnalysisFollowerProgress>(() => {
    if (!context) {
      return {
        currentFollowersLabel: "0",
        targetFollowersLabel: "1k",
        progressPercent: 0,
      };
    }

    const followers = Math.max(0, context.creatorProfile.identity.followersCount);
    let stageStart = 0;
    let stageEnd = 1000;
    let targetFollowersLabel = "1k";

    switch (currentPlaybookStage) {
      case "0-1k":
        stageStart = 0;
        stageEnd = 1000;
        targetFollowersLabel = "1k";
        break;
      case "1k-10k":
        stageStart = 1000;
        stageEnd = 10000;
        targetFollowersLabel = "10k";
        break;
      case "10k-50k":
        stageStart = 10000;
        stageEnd = 50000;
        targetFollowersLabel = "50k";
        break;
      case "50k+":
        stageStart = 50000;
        stageEnd = 100000;
        targetFollowersLabel = "100k";
        break;
      default:
        break;
    }

    const rawProgress =
      stageEnd > stageStart
        ? ((followers - stageStart) / (stageEnd - stageStart)) * 100
        : 0;

    return {
      currentFollowersLabel: new Intl.NumberFormat("en-US").format(followers),
      targetFollowersLabel,
      progressPercent: Math.max(0, Math.min(100, rawProgress)),
    };
  }, [context, currentPlaybookStage]);

  const analysisEvidencePosts = useMemo<AnalysisEvidencePost[]>(() => {
    if (!context) {
      return [];
    }

    const seen = new Set<string>();
    const weakIds = new Set<string>([
      ...context.negativeAnchors.map((post) => post.id),
      ...context.creatorProfile.examples.cautionExamples.map((post) => post.id),
      ...context.creatorProfile.examples.goalConflictExamples.map((post) => post.id),
    ]);
    const replyIds = new Set<string>(
      context.creatorProfile.examples.replyVoiceAnchors.map((post) => post.id),
    );

    return [
      ...context.positiveAnchors,
      ...context.negativeAnchors,
      ...context.creatorProfile.examples.voiceAnchors,
      ...context.creatorProfile.examples.replyVoiceAnchors,
      ...context.creatorProfile.examples.quoteVoiceAnchors,
      ...context.creatorProfile.examples.bestPerforming,
      ...context.creatorProfile.examples.strategyAnchors,
      ...context.creatorProfile.examples.goalAnchors,
      ...context.creatorProfile.examples.cautionExamples,
      ...context.creatorProfile.examples.goalConflictExamples,
    ]
      .filter((post) => {
        if (seen.has(post.id)) {
          return false;
        }

        seen.add(post.id);
        return true;
      })
      .slice(0, 8)
      .map((post) => {
        const label = weakIds.has(post.id)
          ? "Weak anchor"
          : replyIds.has(post.id) || post.lane === "reply"
            ? "Reply anchor"
            : "Strong anchor";
        const reason =
          post.selectionReason ||
          (label === "Weak anchor"
            ? "xpo flagged this as a pattern to reduce."
            : label === "Reply anchor"
              ? "xpo flagged this as a representative reply voice sample."
              : "xpo flagged this as a strong profile signal to keep.");

        return { ...post, label, reason };
      });
  }, [context]);

  const analysisRecommendedPlaybooks = useMemo<AnalysisRecommendedPlaybook[]>(
    () => buildRecommendedPlaybooks(context, 3),
    [context],
  );

  const analysisDiagnosisSummary = useMemo(() => {
    if (!context) {
      return "insufficient data";
    }

    return `xpo sees a ${formatEnumLabel(context.creatorProfile.archetype).toLowerCase()} in ${formatNicheSummary(
      context,
    ).toLowerCase()}. biggest gap: ${context.strategyDelta.primaryGap.toLowerCase()}.`;
  }, [context, formatEnumLabel, formatNicheSummary]);

  const analysisSnapshotCards = useMemo<AnalysisSnapshotCard[]>(() => {
    if (!context) {
      return [];
    }

    return [
      {
        label: "Archetype",
        value: formatEnumLabel(context.creatorProfile.archetype),
      },
      {
        label: "Niche",
        value: formatNicheSummary(context),
      },
      {
        label: "Distribution loop",
        value: formatEnumLabel(context.creatorProfile.distribution.primaryLoop),
      },
      {
        label: "Readiness",
        value: `${context.readiness.score}`,
        meta: `sample ${context.confidence.sampleSize} posts`,
      },
    ];
  }, [context, formatEnumLabel, formatNicheSummary]);

  const analysisVoiceSignalChips = useMemo<AnalysisVoiceSignalChip[]>(() => {
    if (!context) {
      return [];
    }

    const lowerBoundedMultiLineRate =
      context.creatorProfile.voice.multiLinePostRate <= 1
        ? context.creatorProfile.voice.multiLinePostRate * 100
        : context.creatorProfile.voice.multiLinePostRate;
    const hasBulletSignal =
      context.creatorProfile.styleCard.punctuationGuidelines.some(
        (rule) => rule.includes("-") || rule.includes(">"),
      ) ||
      context.creatorProfile.voice.styleNotes.some((note) =>
        /bullet|list|hyphen|dash|angle/i.test(note),
      );
    const topTopic = context.creatorProfile.topics.dominantTopics[0];
    const topicConsistency = topTopic
      ? formatEnumLabel(topTopic.stability).toLowerCase()
      : context.creatorProfile.niche.confidence >= 70
        ? "high"
        : context.creatorProfile.niche.confidence >= 45
          ? "medium"
          : "low";
    const lowercaseShare = context.creatorProfile.voice.lowercaseSharePercent;
    const casingValue =
      context.creatorProfile.voice.primaryCasing === "lowercase"
        ? lowercaseShare >= 85
          ? "lowercase"
          : "mixed"
        : lowercaseShare >= 80
          ? "mixed"
          : "normal";
    const ctaRate = context.creatorProfile.execution.ctaUsageRate;
    const ctaUsageValue = ctaRate >= 25 ? "high" : ctaRate >= 10 ? "medium" : "low";

    return [
      { label: "casing", value: casingValue },
      {
        label: "typical length",
        value: context.creatorProfile.voice.averageLengthBand
          ? formatEnumLabel(context.creatorProfile.voice.averageLengthBand).toLowerCase()
          : "insufficient data",
      },
      {
        label: "structure",
        value: hasBulletSignal
          ? "bullet-friendly"
          : lowerBoundedMultiLineRate >= 50
            ? "multi-line"
            : "single-line",
      },
      { label: "cta usage", value: ctaUsageValue },
      { label: "topic consistency", value: topicConsistency },
    ];
  }, [context, formatEnumLabel]);

  const analysisKeepList = useMemo<string[]>(() => {
    if (!context) {
      return [];
    }

    return dedupePreserveOrder([
      ...context.strategyDelta.preserveTraits,
      ...context.creatorProfile.strategy.currentStrengths,
      ...context.creatorProfile.playbook.toneGuidelines,
    ]).slice(0, 5);
  }, [context, dedupePreserveOrder]);

  const analysisAvoidList = useMemo<string[]>(() => {
    if (!context) {
      return [];
    }

    return dedupePreserveOrder([
      ...context.strategyDelta.shiftTraits,
      ...context.creatorProfile.strategy.currentWeaknesses,
      ...context.creatorProfile.styleCard.forbiddenPhrases,
    ]).slice(0, 5);
  }, [context, dedupePreserveOrder]);

  const analysisPositioningIsTentative = useMemo(() => {
    if (!context) {
      return false;
    }

    return (
      context.growthStrategySnapshot.confidence.positioning < 65 ||
      context.growthStrategySnapshot.ambiguities.length > 0
    );
  }, [context]);

  const analysisLearningStrengths = useMemo<string[]>(() => {
    if (!context) {
      return [];
    }

    return Array.from(
      new Set([
        ...(context.replyInsights?.bestSignals || []),
        ...(context.contentInsights?.bestSignals || []),
        ...(context.strategyAdjustments?.reinforce || []),
        ...(context.contentAdjustments?.reinforce || []),
      ]),
    ).slice(0, 5);
  }, [context]);

  const analysisLearningCautions = useMemo<string[]>(() => {
    if (!context) {
      return [];
    }

    return Array.from(
      new Set([
        ...(context.replyInsights?.cautionSignals || []),
        ...(context.contentInsights?.cautionSignals || []),
        ...(context.strategyAdjustments?.deprioritize || []),
        ...(context.contentAdjustments?.deprioritize || []),
      ]),
    ).slice(0, 6);
  }, [context]);

  const analysisLearningExperiments = useMemo<string[]>(() => {
    if (!context) {
      return [];
    }

    return Array.from(
      new Set([
        ...(context.strategyAdjustments?.experiments || []),
        ...(context.contentAdjustments?.experiments || []),
      ]),
    ).slice(0, 5);
  }, [context]);

  const analysisReplyConversionHighlights = useMemo<AnalysisReplyConversionHighlight[]>(() => {
    if (!context?.replyInsights) {
      return [];
    }

    const topAnchor = context.replyInsights.topIntentAnchors?.[0];
    const topIntent = context.replyInsights.topIntentLabels?.[0];
    const fullyAttributed =
      context.replyInsights.intentAttribution?.fullyAttributedOutcomeCount || 0;

    const raw = [
      topAnchor?.label ? { label: "Top anchor", value: topAnchor.label } : null,
      topIntent?.label ? { label: "Top intent", value: topIntent.label } : null,
      topAnchor && (topAnchor.totalProfileClicks || 0) > 0
        ? {
            label: "Profile clicks",
            value: `${topAnchor.totalProfileClicks} via ${topAnchor.label}`,
          }
        : null,
      topIntent && (topIntent.totalFollowerDelta || 0) > 0
        ? {
            label: "Follower delta",
            value: `${topIntent.totalFollowerDelta} via ${topIntent.label}`,
          }
        : null,
      fullyAttributed > 0
        ? { label: "Attributed outcomes", value: `${fullyAttributed} end to end` }
        : null,
    ].filter((entry): entry is AnalysisReplyConversionHighlight => Boolean(entry));

    return Array.from(
      new Map(raw.map((entry) => [`${entry.label}:${entry.value}`, entry])).values(),
    ).slice(0, 4);
  }, [context]);

  const openAnalysis = useCallback(() => {
    setAnalysisOpen(true);
  }, []);

  const closeAnalysis = useCallback(() => {
    setAnalysisOpen(false);
    const fingerprint = context?.profileConversionAudit?.fingerprint?.trim();
    if (!fingerprint) {
      return;
    }

    dismissedFingerprintRef.current = fingerprint;
    void trackProductEvent({
      eventType: "profile_audit_dismissed",
      properties: {
        fingerprint,
        score: context?.profileConversionAudit?.score ?? null,
      },
    });
    void persistProfileAuditState({
      lastDismissedFingerprint: fingerprint,
    });
  }, [context, persistProfileAuditState, trackProductEvent]);

  const handleHeaderClaritySelection = useCallback(
    async (value: "clear" | "unclear" | "unsure") => {
      const bannerUrl = context?.profileConversionAudit?.visualRealEstateCheck.headerImageUrl ?? null;
      const fingerprint = context?.profileConversionAudit?.fingerprint ?? null;
      const ok = await persistProfileAuditState({
        lastDismissedFingerprint: fingerprint,
        headerClarity: value,
        headerClarityBannerUrl: bannerUrl,
      });
      if (!ok) {
        return false;
      }

      dismissedFingerprintRef.current = fingerprint;
      await loadWorkspace();
      void trackProductEvent({
        eventType: "profile_audit_header_answered",
        properties: {
          headerClarity: value,
          bannerUrl,
        },
      });
      return true;
    },
    [context, loadWorkspace, persistProfileAuditState, trackProductEvent],
  );

  const handleBioAlternativeCopied = useCallback(
    async (text: string) => {
      await trackProductEvent({
        eventType: "profile_audit_bio_copied",
        properties: {
          length: text.length,
        },
      });
    },
    [trackProductEvent],
  );

  const handleBioAlternativeRefine = useCallback(
    async (text: string) => {
      await trackProductEvent({
        eventType: "profile_audit_bio_refine_started",
        properties: {
          length: text.length,
        },
      });
      await submitQuickStarter(
        `tighten this x bio if needed, but stay close to it and keep the same grounded claim: "${text}"`,
      );
    },
    [submitQuickStarter, trackProductEvent],
  );

  const handlePinnedPromptStart = useCallback(
    async (kind: "origin_story" | "core_thesis") => {
      const prompts = context?.profileConversionAudit?.pinnedTweetCheck.promptSuggestions;
      const prompt = kind === "origin_story" ? prompts?.originStory : prompts?.coreThesis;
      if (!prompt) {
        return;
      }

      await trackProductEvent({
        eventType: "profile_audit_pinned_prompt_started",
        properties: {
          promptType: kind,
        },
      });
      await submitQuickStarter(prompt);
    },
    [context, submitQuickStarter, trackProductEvent],
  );

  return {
    analysisOpen,
    setAnalysisOpen,
    openAnalysis,
    closeAnalysis,
    isAnalysisScrapeRefreshing,
    setIsAnalysisScrapeRefreshing,
    analysisScrapeNotice,
    setAnalysisScrapeNotice,
    analysisScrapeNoticeTone,
    analysisScrapeCooldownUntil,
    setAnalysisScrapeCooldownUntil,
    isAnalysisScrapeCoolingDown,
    analysisScrapeCooldownLabel,
    handleManualProfileScrapeRefresh,
    analysisPriorityItems,
    analysisFollowerProgress,
    analysisEvidencePosts,
    analysisRecommendedPlaybooks,
    analysisDiagnosisSummary,
    analysisSnapshotCards,
    analysisVoiceSignalChips,
    analysisKeepList,
    analysisAvoidList,
    analysisPositioningIsTentative,
    analysisLearningStrengths,
    analysisLearningCautions,
    analysisLearningExperiments,
    analysisReplyConversionHighlights,
    handleHeaderClaritySelection,
    handleBioAlternativeCopied,
    handleBioAlternativeRefine,
    handlePinnedPromptStart,
  };
}
