import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { GuestAnalysisPreview } from "./GuestAnalysisPreview";
import type { GuestOnboardingAnalysis } from "@/lib/onboarding/guestAnalysis";

const analysis: GuestOnboardingAnalysis = {
  profile: {
    username: "stan",
    name: "Stan",
    bio: "I help SaaS founders grow with AI growth systems.",
    avatarUrl: "https://pbs.twimg.com/profile_images/avatar.jpg",
    headerImageUrl: "https://pbs.twimg.com/profile_banners/banner.jpg",
    isVerified: false,
    followersCount: 2400,
    followingCount: 310,
    createdAt: "2020-01-01T00:00:00.000Z",
  },
  stage: "1k → 10k",
  playbookStage: "1k-10k",
  verdict:
    "Profile conversion is usable, but the account still has at least one leak before it converts cleanly.",
  profileAudit: {
    score: 62,
    headline: "The account is clear enough to classify, but not yet sharp enough to convert quickly.",
    surfaceChecks: [
      {
        key: "bio",
        label: "Bio",
        status: "warn",
        summary: "The bio has part of the structure, but it still needs a clearer formula.",
      },
      {
        key: "banner",
        label: "Banner",
        status: "pass",
        summary: "The header is present and already supporting the positioning.",
      },
      {
        key: "pinned_post",
        label: "Pinned post",
        status: "fail",
        summary: "The pinned post is weak or stale enough to hurt profile conversion.",
      },
      {
        key: "recent_posts",
        label: "Recent posts",
        status: "warn",
        summary: "Recent posts show partial coherence with the profile promise.",
      },
    ],
    strengths: ["The account has a clear niche and visible proof surface."],
    gaps: ["The pinned post does not reinforce the promise strongly enough."],
    unknowns: [],
  },
  priorities: [
    {
      key: "bio",
      status: "warn",
      title: "Sharpen the bio promise",
      why: "The bio is missing who you help + proof or CTA from the conversion formula.",
    },
    {
      key: "pinned_post",
      status: "fail",
      title: "Fix the pinned-post handoff",
      why: "The pinned post reads weak for a featured authority asset.",
    },
  ],
  profileSnapshot: {
    pinnedPost: {
      id: "pin-1",
      text: "My thesis for SaaS founders is that clarity compounds.",
      createdAt: "2026-03-01T12:00:00.000Z",
      metrics: {
        likeCount: 10,
        replyCount: 2,
        repostCount: 1,
        quoteCount: 0,
      },
      url: "https://x.com/stan/status/pin-1",
    },
    recentPosts: [],
  },
  playbookGuide: {
    stageMeta: {
      label: "1k→10k",
      highlight: "consistent format + clear topic",
      winCondition: "win by becoming known for one clear topic.",
      priorities: ["positioning", "formats", "proof"],
      contentMix: {
        replies: 40,
        posts: 40,
        threads: 20,
      },
    },
    recommendedPlaybook: {
      id: "weekly-series",
      name: "Weekly Series",
      outcome: "Build topic association and repeat engagement",
      whyFit: "your current signals need clearer repetition, and this builds a recognizable format.",
      loop: {
        input: "Pick one topic you'll post about every week",
        action: "Use one format people can recognize",
        feedback: "Track returning commenters and saves",
      },
      quickStart: [
        "Pick a weekly topic",
        "Draft one repeatable hook",
        "Turn it into a recognizable series",
      ],
      checklist: {
        daily: ["Collect one idea", "Draft one hook", "Reply on-topic once"],
        weekly: ["Ship one flagship post", "Repurpose it into one follow-up"],
      },
    },
  },
  dataNotice: null,
};

test("renders the single guide layout with audit, playbook, pinned post, and CTA", () => {
  render(
    <GuestAnalysisPreview analysis={analysis} signupHref="/login?xHandle=stan" onBack={() => {}} />,
  );

  expect(screen.getByText("Here's what Xpo sees on", { exact: false })).toBeInTheDocument();
  expect(screen.getByText("Bio")).toBeInTheDocument();
  expect(screen.getByText("Banner")).toBeInTheDocument();
  expect(screen.getByText("Recent posts")).toBeInTheDocument();
  expect(screen.getByText("Stage focus")).toBeInTheDocument();
  expect(screen.getByText("Pinned Post")).toBeInTheDocument();
  expect(screen.queryByText("Weekly Series")).not.toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: /continue to xpo/i }).length).toBeGreaterThan(0);
});

test("does not render the removed evidence and voice sections and shows the missing-pin state", () => {
  render(
    <GuestAnalysisPreview
      analysis={{
        ...analysis,
        dataNotice:
          "This guide is based on live profile fields only. Recent posts and a pinned post were not available in the latest snapshot.",
        profileSnapshot: {
          ...analysis.profileSnapshot,
          pinnedPost: null,
        },
      }}
      signupHref="/login?xHandle=stan"
      onBack={() => {}}
    />,
  );

  expect(screen.queryByText("Signals Xpo Used")).not.toBeInTheDocument();
  expect(screen.queryByText("Generated In Your Voice")).not.toBeInTheDocument();
  expect(screen.queryByText("Pinned Post")).not.toBeInTheDocument();
  expect(screen.queryByText("What to fix first")).not.toBeInTheDocument();
  expect(screen.queryByText("What's working")).not.toBeInTheDocument();
  expect(screen.queryByText("Open questions")).not.toBeInTheDocument();
  expect(screen.getByText("Needs Pinned Post")).toBeInTheDocument();
  expect(screen.getByText("Bio")).toBeInTheDocument();
});
