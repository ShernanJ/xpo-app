import type { ImgHTMLAttributes } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import {
  ProfileAnalysisDialog,
  type ProfileAnalysisDialogProps,
} from "./ProfileAnalysisDialog";
import type { PlaybookDefinition } from "@/lib/creator/playbooks";
import type { CreatorAgentContext } from "@/lib/onboarding/strategy/agentContext";

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: (props: ImgHTMLAttributes<HTMLImageElement>) => <img {...props} />,
}));

const FIRST_BIO =
  "I help founders build audience systems that turn profile visits into pipeline.";
const SECOND_BIO = "Helping SaaS builders grow authority on X with clear operating systems.";

function createPlaybook(): PlaybookDefinition {
  return {
    id: "reply-ladder",
    name: "Reply Ladder",
    outcome: "Get discovered by bigger accounts",
    whenItWorks: "Best when your strongest ideas still need distribution.",
    difficulty: "Easy",
    timePerDay: "15 min/day",
    bestFor: ["builders"],
    loop: {
      input: "Find 5 prompts",
      action: "Write 3 sharp replies",
      feedback: "Track profile clicks",
    },
    checklist: {
      daily: ["Reply to 3 posts"],
      weekly: ["Review what converted"],
    },
    templates: [],
    metrics: ["Profile clicks"],
    rationale: "Replying gets faster discovery.",
    mistakes: ["Being too generic"],
    examples: ["Disagree with one sharp point"],
    quickStart: ["Find 5 posts", "Write 3 replies", "Track clicks"],
  };
}

function createContext(): CreatorAgentContext {
  return {
    generatedAt: "2026-03-20T12:00:00.000Z",
    contextVersion: "agent_context_v3",
    creatorProfileVersion: "creator_profile_v1",
    evaluationRubricVersion: "rubric_v1",
    runId: "run_123",
    account: "shernanj",
    avatarUrl: "https://pbs.twimg.com/profile_images/avatar.jpg",
    source: "scrape",
    creatorProfile: {
      identity: {
        username: "shernanj",
        displayName: "Shernan",
        followersCount: 836,
        followingCount: 224,
        followerBand: "0-1k",
        isVerified: false,
        accountAgeDays: 365,
      },
      strategy: {
        primaryGoal: "followers",
      },
    },
    performanceModel: {},
    strategyDelta: {
      primaryGap: "clarity",
    },
    growthStrategySnapshot: {
      knownFor: "Clear systems for creator growth",
      targetAudience: "Early-stage founders building on X",
      contentPillars: ["growth systems", "positioning", "proof posts"],
      profileConversionCues: ["Show who you help", "Back it up with proof"],
      offBrandThemes: ["generic motivation"],
      ambiguities: ["The bio sounds broad instead of specific."],
    },
    replyInsights: {
      selectionRate: "12%",
      postRate: "8%",
      observedRate: "5%",
    },
    contentInsights: {
      totalCandidates: 7,
      postRate: "18%",
      observedRate: "9%",
    },
    profileConversionAudit: {
      generatedAt: "2026-03-20T12:00:00.000Z",
      score: 62,
      headline: "Your profile is attracting attention but leaking conversion.",
      fingerprint: "fp-123",
      shouldAutoOpen: true,
      steps: [
        {
          key: "bio_formula",
          title: "Bio Formula",
          status: "fail",
          score: 42,
          summary: "The bio is too vague.",
          findings: ["The bio does not say who you help."],
          actionLabel: "Sharpen the promise",
        },
      ],
      strengths: ["Pinned post exists"],
      gaps: ["Banner lacks a clear promise"],
      recommendedBioEdits: [FIRST_BIO, SECOND_BIO],
      recentPostCoherenceNotes: ["Recent posts consistently point to creator systems."],
      unknowns: ["Header clarity is still partially subjective."],
      bioFormulaCheck: {
        status: "fail",
        score: 42,
        summary: "The bio is too vague.",
        findings: ["Missing a clear audience."],
        bio: "building in public",
        charCount: 18,
        matchesFormula: {
          what: false,
          who: false,
          proofOrCta: false,
        },
        alternatives: [
          {
            id: "bio-1",
            text: FIRST_BIO,
            proofMode: "cta",
          },
          {
            id: "bio-2",
            text: SECOND_BIO,
            proofMode: "cta",
          },
          {
            id: "bio-3",
            text: "I help operators explain what they do so the right people follow fast.",
            proofMode: "cta",
          },
        ],
      },
      visualRealEstateCheck: {
        status: "warn",
        score: 65,
        summary: "The banner exists, but it does not explain the offer.",
        findings: ["The promise is not obvious at a glance."],
        hasHeaderImage: true,
        headerImageUrl: "https://pbs.twimg.com/profile_banners/banner.jpg",
        headerClarity: null,
        headerClarityResolved: false,
      },
      pinnedTweetCheck: {
        status: "fail",
        score: 30,
        summary: "The pinned tweet is stale and low-authority.",
        findings: ["The pinned tweet does not show a strong proof loop."],
        pinnedPost: {
          id: "pin-1",
          text: "old pinned tweet",
          createdAt: "2024-01-01T00:00:00.000Z",
          metrics: {
            likeCount: 10,
            replyCount: 2,
            repostCount: 1,
            quoteCount: 0,
          },
          url: "https://x.com/test/status/1",
        },
        category: "weak",
        ageDays: 430,
        isStale: true,
        promptSuggestions: {
          originStory: "write me an origin story thread i can pin on x",
          coreThesis: "write me a core thesis thread i can pin on x",
        },
      },
    },
    confidence: {},
    readiness: {},
    anchorSummary: {},
    positiveAnchors: [
      {
        id: "anchor-1",
        text: "The fastest way to grow on X is to make your profile answer one question instantly.",
        createdAt: "2026-03-14T12:00:00.000Z",
      },
    ],
    negativeAnchors: [],
    retrieval: {},
    unknowns: [],
  } as unknown as CreatorAgentContext;
}

function createProps(
  overrides: Partial<ProfileAnalysisDialogProps> = {},
): ProfileAnalysisDialogProps {
  return {
    open: true,
    onOpenChange: vi.fn(),
    context: createContext(),
    accountName: "shernanj",
    isVerifiedAccount: false,
    currentPlaybookStage: "0-1k",
    analysisFollowerProgress: {
      currentFollowersLabel: "836 followers",
      targetFollowersLabel: "1k target",
      progressPercent: 83.6,
    },
    analysisDiagnosisSummary:
      "Clarity is the main leak right now. Tighten the profile promise and the pinned proof loop.",
    analysisSnapshotCards: [
      { label: "Best Format", value: "List posts", meta: "16.7% share" },
      { label: "Hook Pattern", value: "Statement open", meta: "50% share" },
    ],
    analysisPositioningIsTentative: true,
    analysisPriorityItems: [
      {
        area: "positioning",
        direction: "increase",
        note: "Make the audience and promise obvious in the first two lines.",
        priority: "high",
      },
    ],
    analysisRecommendedPlaybooks: [
      {
        stage: "0-1k",
        playbook: createPlaybook(),
        whyFit: "You need stronger distribution and more proof loops.",
      },
    ],
    analysisLearningStrengths: ["Proof-driven posts are starting to resonate."],
    analysisLearningCautions: ["Broad motivational posts blur the positioning."],
    analysisLearningExperiments: ["Test a weekly positioning teardown series."],
    analysisReplyConversionHighlights: [
      { label: "Follow rate", value: "5.2%" },
    ],
    analysisVoiceSignalChips: [
      { label: "Tone", value: "direct" },
      { label: "Cadence", value: "daily" },
    ],
    analysisKeepList: ["Lead with a concrete claim."],
    analysisAvoidList: ["Generic motivation without proof."],
    analysisEvidencePosts: [
      {
        id: "evidence-1",
        label: "Strong anchor",
        lane: "strategy",
        reason: "This post clearly explains the positioning gap.",
        text: "Your profile has to convert the traffic your replies earn.",
        engagementTotal: 88,
        goalFitScore: 81,
        createdAt: "2026-03-15T12:00:00.000Z",
      },
    ],
    analysisScrapeNotice: null,
    analysisScrapeNoticeTone: "info",
    isAnalysisScrapeCoolingDown: false,
    analysisScrapeCooldownLabel: "",
    isAnalysisScrapeRefreshing: false,
    onRefreshScrape: vi.fn(),
    onHeaderClaritySelect: vi.fn().mockResolvedValue(true),
    onBioAlternativeCopied: vi.fn(),
    onBioAlternativeRefine: vi.fn(),
    onPinnedPromptStart: vi.fn(),
    onOpenFeedback: vi.fn(),
    onOpenGrowthGuide: vi.fn(),
    onOpenGrowthGuideForRecommendation: vi.fn(),
    ...overrides,
  };
}

test("renders the split preview rail and analysis content together", () => {
  render(<ProfileAnalysisDialog {...createProps()} />);

  const previewPane = screen.getByTestId("profile-analysis-preview-pane");
  const infoPane = screen.getByTestId("profile-analysis-info-pane");

  expect(screen.getAllByText("Shernan").length).toBeGreaterThan(0);
  expect(screen.getAllByText("@shernanj").length).toBeGreaterThan(0);
  expect(screen.getByText("836 followers")).toBeVisible();
  expect(within(previewPane).getByText("Conversion Score")).toBeVisible();
  expect(within(infoPane).getByText("Profile Conversion Audit")).toBeVisible();
  expect(within(infoPane).getByText("Recommended playbooks for you")).toBeVisible();
  expect(screen.queryByText("Diagnosis summary")).not.toBeInTheDocument();
});

test("updates the left preview card when a different bio rewrite is applied", async () => {
  const user = userEvent.setup();

  render(<ProfileAnalysisDialog {...createProps()} />);

  const previewPane = screen.getByTestId("profile-analysis-preview-pane");

  expect(within(previewPane).getByText(FIRST_BIO)).toBeVisible();

  await user.click(screen.getAllByRole("button", { name: "Apply" })[0]);

  expect(within(previewPane).queryByText(FIRST_BIO)).not.toBeInTheDocument();
  expect(within(previewPane).getByText(SECOND_BIO)).toBeVisible();
});

test("stacks the preview first and analysis second on mobile without pane toggles", () => {
  render(<ProfileAnalysisDialog {...createProps()} />);

  const previewPaneSection = screen
    .getByTestId("profile-analysis-preview-pane")
    .closest("section");
  const infoPaneSection = screen
    .getByTestId("profile-analysis-info-pane")
    .closest("section");

  expect(previewPaneSection?.className).not.toContain("hidden md:block");
  expect(previewPaneSection?.className).toContain("block");
  expect(infoPaneSection?.className).toContain("block");
  expect(infoPaneSection?.className).not.toContain("hidden md:block");
  expect(screen.queryByRole("button", { name: "View profile preview" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Back to analysis" })).not.toBeInTheDocument();
});

test("preserves the key analysis actions in the redesigned modal", async () => {
  const user = userEvent.setup();
  const props = createProps();

  render(<ProfileAnalysisDialog {...props} />);

  await user.click(screen.getAllByRole("button", { name: "Refine in chat" })[0]);
  expect(props.onBioAlternativeRefine).toHaveBeenCalledWith(FIRST_BIO);

  await user.click(screen.getByRole("button", { name: "Write origin story" }));
  expect(props.onPinnedPromptStart).toHaveBeenCalledWith("origin_story");

  await user.click(screen.getByRole("button", { name: "Open in Growth Guide" }));
  expect(props.onOpenGrowthGuideForRecommendation).toHaveBeenCalledWith("0-1k", "reply-ladder");

  await user.click(screen.getByRole("button", { name: "Rerun Scrape" }));
  expect(props.onRefreshScrape).toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "Open feedback" }));
  expect(props.onOpenFeedback).toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "Open Growth Guide" }));
  expect(props.onOpenGrowthGuide).toHaveBeenCalled();
});
