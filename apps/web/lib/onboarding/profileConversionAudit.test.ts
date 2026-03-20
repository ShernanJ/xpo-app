import assert from "node:assert/strict";
import test from "node:test";

import { buildProfileConversionAudit } from "./profile/profileConversionAudit.ts";
import type { ProfileAnalysisPinnedPostImageAnalysis } from "./profile/pinnedPostImageAnalysis.ts";

function createAudit(args?: {
  bio?: string;
  headerImageUrl?: string | null;
  pinnedPost?: {
    id: string;
    text: string;
    createdAt: string;
    url?: string | null;
  } | null;
  recentPosts?: Array<{ text: string }>;
  followersCount?: number;
  isVerified?: boolean;
  source?: "scrape" | "x_api" | "mock";
  pinnedPostImageAnalysis?: ProfileAnalysisPinnedPostImageAnalysis | null;
  profileAuditState?: {
    lastDismissedFingerprint: string | null;
    headerClarity: "clear" | "unclear" | "unsure" | null;
    headerClarityAnsweredAt: string | null;
    headerClarityBannerUrl: string | null;
  } | null;
}) {
  const headerImageUrl =
    args?.headerImageUrl === undefined
      ? "https://pbs.twimg.com/profile_banners/123/1500x500"
      : args.headerImageUrl;

  return buildProfileConversionAudit({
    onboarding: {
      source: args?.source ?? "scrape",
      profile: {
        bio: args?.bio ?? "Helping SaaS founders scale to $10k MRR with AI growth systems.",
        headerImageUrl,
        followersCount: args?.followersCount ?? 2400,
        isVerified: args?.isVerified ?? false,
      },
      pinnedPost:
        args?.pinnedPost === undefined
          ? {
              id: "post-1",
              text: "My thesis for SaaS founders: clear positioning compounds faster than more posting. Here are 5 lessons from building repeatable AI growth systems for small teams.\n\n1. Positioning beats volume.\n2. Specificity beats cleverness.",
              createdAt: "2026-02-20T12:00:00.000Z",
              url: "https://x.com/stan/status/post-1",
            }
          : args.pinnedPost,
      recentPosts: (args?.recentPosts ?? [
        { text: "AI growth systems work best when the positioning is obvious." },
        { text: "SaaS founders need a bio that says who they help and how." },
        { text: "Clear profile conversion cues turn attention into the right followers." },
      ]) as never,
    } as never,
    context: {
      growthStrategySnapshot: {
        knownFor: "AI growth systems for SaaS founders",
        targetAudience: "SaaS founders",
        contentPillars: ["AI growth systems", "profile conversion", "positioning"],
      },
      creatorProfile: {
        strategy: {
          primaryGoal: "authority",
        },
      },
    } as never,
    profileAuditState: args?.profileAuditState ?? null,
    pinnedPostImageAnalysis: args?.pinnedPostImageAnalysis ?? null,
  });
}

test("profile conversion audit fails a generic bio and proposes exactly three rewrites", () => {
  const audit = createAudit({
    bio: "Coffee lover. Building things on the internet.",
  });

  assert.equal(audit.bioFormulaCheck.status, "fail");
  assert.equal(audit.bioFormulaCheck.alternatives.length, 3);
  assert.equal(
    audit.gaps.some((entry) => entry.toLowerCase().includes("bio")),
    true,
  );
});

test("profile conversion audit passes a formula-complete bio", () => {
  const audit = createAudit({
    bio: "I help SaaS founders scale to $10k MRR with AI growth systems. Follow for weekly teardowns.",
  });

  assert.equal(audit.bioFormulaCheck.status, "pass");
  assert.equal(audit.bioFormulaCheck.matchesFormula.what, true);
  assert.equal(audit.bioFormulaCheck.matchesFormula.who, true);
  assert.equal(audit.bioFormulaCheck.matchesFormula.proofOrCta, true);
});

test("profile conversion audit fails when no header image exists on a scrape profile", () => {
  const audit = createAudit({
    headerImageUrl: null,
  });

  assert.equal(audit.visualRealEstateCheck.status, "fail");
  assert.equal(audit.visualRealEstateCheck.hasHeaderImage, false);
});

test("profile conversion audit warns when a header exists but the self-check is unresolved", () => {
  const audit = createAudit({
    profileAuditState: null,
  });

  assert.equal(audit.visualRealEstateCheck.status, "warn");
  assert.equal(audit.visualRealEstateCheck.headerClarityResolved, false);
  assert.equal(audit.shouldAutoOpen, true);
});

test("profile conversion audit passes a strong pinned authority post", () => {
  const audit = createAudit({
    pinnedPost: {
      id: "post-2",
      text: "My thesis for SaaS founders: specific positioning compounds faster than posting more. I have tested this across AI growth systems, onboarding funnels, and profile rewrites.\n\n1. Clarity raises profile clicks.\n2. Proof raises follows.\n3. Repetition raises recall.",
      createdAt: "2026-03-01T12:00:00.000Z",
      url: "https://x.com/stan/status/post-2",
    },
    profileAuditState: {
      lastDismissedFingerprint: null,
      headerClarity: "clear",
      headerClarityAnsweredAt: "2026-03-10T10:00:00.000Z",
      headerClarityBannerUrl: "https://pbs.twimg.com/profile_banners/123/1500x500",
    },
  });

  assert.equal(audit.pinnedTweetCheck.status, "pass");
  assert.equal(audit.pinnedTweetCheck.category, "core_thesis");
});

test("profile conversion audit fails a stale and weak pinned post", () => {
  const audit = createAudit({
    pinnedPost: {
      id: "post-3",
      text: "random thought from last year",
      createdAt: "2024-01-01T12:00:00.000Z",
      url: "https://x.com/stan/status/post-3",
    },
  });

  assert.equal(audit.pinnedTweetCheck.status, "fail");
  assert.equal(audit.pinnedTweetCheck.isStale, true);
});

test("profile conversion audit upgrades a short pinned post when the image carries strong proof", () => {
  const audit = createAudit({
    pinnedPost: {
      id: "post-4",
      text: "holy fucking cinema.",
      createdAt: "2026-01-26T12:00:00.000Z",
      url: "https://x.com/stan/status/post-4",
    },
    pinnedPostImageAnalysis: {
      imageRole: "proof",
      readableText: "First Prize Winner $20k CAD",
      primarySubject: "winner holding a cheque and trophies",
      sceneSummary: "Photo of the creator holding a first-prize cheque beside trophies.",
      strategicSignal:
        "The image gives first-time visitors concrete proof of a public win and real authority.",
      keyDetails: ["first prize winner", "$20k CAD cheque", "trophies"],
    },
    profileAuditState: {
      lastDismissedFingerprint: null,
      headerClarity: "clear",
      headerClarityAnsweredAt: "2026-03-10T10:00:00.000Z",
      headerClarityBannerUrl: "https://pbs.twimg.com/profile_banners/123/1500x500",
    },
  });

  assert.equal(audit.pinnedTweetCheck.proofStrength, "high");
  assert.equal(audit.pinnedTweetCheck.imageAdjusted, true);
  assert.notEqual(audit.pinnedTweetCheck.category, "weak");
  assert.notEqual(audit.pinnedTweetCheck.status, "fail");
  assert.equal(
    audit.pinnedTweetCheck.visualEvidenceSummary?.includes("First Prize Winner $20k CAD"),
    true,
  );
});

test("bio alternatives fall back to CTA endings when grounded proof is missing", () => {
  const audit = createAudit({
    followersCount: 320,
    isVerified: false,
  });

  assert.deepEqual(
    audit.bioFormulaCheck.alternatives.map((alternative) => alternative.proofMode),
    ["cta", "cta", "cta"],
  );
  assert.equal(
    audit.bioFormulaCheck.alternatives.every((alternative) =>
      alternative.text.includes("Follow for"),
    ),
    true,
  );
});
