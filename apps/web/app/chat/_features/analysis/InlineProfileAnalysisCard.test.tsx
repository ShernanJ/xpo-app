import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";

import { InlineProfileAnalysisCard } from "./InlineProfileAnalysisCard";
import type { ProfileAnalysisArtifact } from "@/lib/chat/profileAnalysisArtifact";

const artifact: ProfileAnalysisArtifact = {
  kind: "profile_analysis",
  profile: {
    username: "shernanjavier",
    name: "shernan ✦",
    bio: "sharing my learnings as i build in public / road to gmi",
    avatarUrl: "https://pbs.twimg.com/profile_images/avatar.jpg",
    headerImageUrl: "https://pbs.twimg.com/profile_banners/banner.jpg",
    isVerified: false,
    followersCount: 125,
    followingCount: 245,
    createdAt: "2017-09-01T00:00:00.000Z",
  },
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
  audit: {
    score: 62,
    headline: "Your profile is attracting attention but leaking conversion.",
    fingerprint: "fp-123",
    shouldAutoOpen: true,
    steps: [],
    strengths: [],
    gaps: [],
    unknowns: [],
    bioFormulaCheck: {
      status: "fail",
      score: 42,
      summary: "The bio is too vague.",
      findings: [],
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
          text: "I help founders build audience systems that turn profile visits into pipeline.",
          proofMode: "cta",
        },
        {
          id: "bio-2",
          text: "Helping SaaS builders grow authority on X with clear operating systems.",
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
      findings: [],
      hasHeaderImage: true,
      headerImageUrl: "https://pbs.twimg.com/profile_banners/banner.jpg",
      headerClarity: null,
      headerClarityResolved: false,
    },
    pinnedTweetCheck: {
      status: "fail",
      score: 30,
      summary: "The pinned tweet is stale and low-authority.",
      findings: [],
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
  bannerAnalysis: {
    vision: {
      readable_text: "Helping founders grow on X",
      color_palette: ["black", "white", "gold"],
      objects_detected: ["text", "logo"],
      is_bottom_left_clear: false,
      overall_vibe: "dark luxury",
    },
    feedback: {
      score: 7.8,
      strengths: ["The banner includes readable text that creates a clearer promise."],
      actionable_improvements: [
        "Move important text away from the bottom-left profile-photo overlap zone.",
      ],
    },
    meta: {
      visionModel: "meta-llama/llama-4-scout-17b-16e-instruct",
      reasoningModel: "openai/gpt-oss-120b",
      reasoningFallbackUsed: false,
    },
  },
};

test("renders the X-style profile shell and routes pinned-thread prompts back into chat", async () => {
  const user = userEvent.setup();

  render(<InlineProfileAnalysisCard artifact={artifact} />);

  expect(screen.getByText("shernan ✦")).toBeInTheDocument();
  expect(screen.getByText("Conversion Score")).toBeInTheDocument();
  expect(screen.getByText("62/100")).toBeInTheDocument();
  expect(screen.queryByText("Your profile is attracting attention but leaking conversion.")).not.toBeInTheDocument();
  expect(screen.queryByText("Profile Audit")).not.toBeInTheDocument();
  expect(screen.getByText("Pinned Post")).toBeInTheDocument();
  expect(screen.queryByText("Profile Analysis")).not.toBeInTheDocument();
  expect(screen.queryByText("Overall:")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /write origin story/i })).not.toBeInTheDocument();
  await user.tab();
});
