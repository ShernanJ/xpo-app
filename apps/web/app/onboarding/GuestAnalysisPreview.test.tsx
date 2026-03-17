import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

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
  verdict:
    "Profile conversion is usable, but the account still has at least one leak before it converts cleanly.",
  coverage: {
    source: "cache",
    hasRecentPosts: true,
    recentPostCount: 3,
    hasPinnedPost: true,
    hasHeaderImage: true,
    completeness: "full",
    summary: "Using live profile fields plus scrape cache with 3 recent posts and a pinned post in view.",
  },
  evidence: [
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
    {
      key: "source_coverage",
      label: "Coverage",
      status: "pass",
      summary: "Using live profile fields plus scrape cache with 3 recent posts and a pinned post in view.",
    },
  ],
  priorities: [
    {
      key: "bio",
      status: "warn",
      title: "Sharpen the bio promise",
      why: "The bio is missing who you help + proof or CTA from the conversion formula.",
      howXpoHelps: "Xpo rewrites the bio into a tighter who/what/proof formula.",
    },
    {
      key: "pinned_post",
      status: "fail",
      title: "Fix the pinned-post handoff",
      why: "The pinned post reads weak for a featured authority asset.",
      howXpoHelps: "Xpo suggests the right pinned asset for this stage.",
    },
    {
      key: "stage",
      status: "pass",
      title: "Pressure the retention + positioning lever",
      why: "Sharpen the positioning so profile visits and recent posts reinforce the same promise.",
      howXpoHelps: "Xpo helps mid-stage accounts turn scattered traction into stronger positioning.",
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
  voicePreview: {
    shortform: "Short preview copy",
    longform: "Long preview copy with more context",
  },
  source: "cache",
};

test("renders verdict, evidence, pinned post, and CTA", () => {
  render(
    <GuestAnalysisPreview
      analysis={analysis}
      signupHref="/login?xHandle=stan"
      voicePreviewFormat="shortform"
      onVoicePreviewFormatChange={() => {}}
      onBack={() => {}}
    />,
  );

  expect(screen.getByText("Here's what Xpo sees on", { exact: false })).toBeInTheDocument();
  expect(screen.getByText("What To Fix First")).toBeInTheDocument();
  expect(screen.getByText("Signals Xpo Used")).toBeInTheDocument();
  expect(screen.getByText("Pinned Post")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /create free account to unlock full analysis/i })).toBeInTheDocument();
});

test("calls the voice-preview toggle handler and hides the pinned section when missing", async () => {
  const user = userEvent.setup();
  const onVoicePreviewFormatChange = vi.fn();

  render(
    <GuestAnalysisPreview
      analysis={{
        ...analysis,
        coverage: {
          ...analysis.coverage,
          hasPinnedPost: false,
          completeness: "partial",
        },
        profileSnapshot: {
          ...analysis.profileSnapshot,
          pinnedPost: null,
        },
      }}
      signupHref="/login?xHandle=stan"
      voicePreviewFormat="shortform"
      onVoicePreviewFormatChange={onVoicePreviewFormatChange}
      onBack={() => {}}
    />,
  );

  expect(screen.queryByText("Pinned Post")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /longform/i }));
  expect(onVoicePreviewFormatChange).toHaveBeenCalledWith("longform");
});
