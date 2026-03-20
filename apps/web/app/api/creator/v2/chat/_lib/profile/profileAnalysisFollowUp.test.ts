import { expect, test } from "vitest";

import {
  PROFILE_ANALYSIS_FEEDBACK_PROMPT,
  buildProfileAnalysisQuestionResponse,
  extractPersistedProfileAnalysisArtifact,
  interpretProfileAnalysisFollowUp,
} from "./profileAnalysisFollowUp";
import type { ProfileAnalysisArtifact } from "@/lib/chat/profileAnalysisArtifact";
import type { ProfileReplyContext } from "@/lib/agent-v2/grounding/profileReplyContext";

function createArtifact(): ProfileAnalysisArtifact {
  return {
    kind: "profile_analysis",
    profile: {
      username: "kkevinvalencia",
      name: "Kevin Valencia",
      bio: "19, gpu infra // eng @cloverlabsco",
      avatarUrl: null,
      headerImageUrl: null,
      isVerified: false,
      followersCount: 109,
      followingCount: 121,
      createdAt: "2025-08-01T00:00:00.000Z",
    },
    pinnedPost: {
      id: "pin-1",
      text: "holy fucking cinema. https://t.co/Fqnj4ifTfI",
      createdAt: "2026-01-26T00:00:00.000Z",
      metrics: {
        likeCount: 80,
        replyCount: 20,
        repostCount: 1,
        quoteCount: 0,
      },
      url: "https://x.com/kkevinvalencia/status/pin-1",
      imageUrls: ["https://pbs.twimg.com/media/kevin-proof.jpg"],
    },
    audit: {
      score: 48,
      headline:
        "Kevin Valencia's X profile has solid proof of achievement but the surrounding copy and recent flow keep visitors from seeing a clear value proposition.",
      fingerprint: "fp-kevin",
      shouldAutoOpen: true,
      steps: [
        {
          key: "bio_formula",
          title: "Bio Formula Check",
          status: "fail",
          score: 40,
          summary: "The bio has part of the structure, but it still needs a clearer formula.",
          findings: [],
          actionLabel: "Rewrite bio",
        },
        {
          key: "visual_real_estate",
          title: "Visual Real Estate",
          status: "warn",
          score: 60,
          summary: "The banner needs confirmation or cleanup before it can be trusted as conversion real estate.",
          findings: [],
          actionLabel: "Fix banner",
        },
        {
          key: "pinned_tweet",
          title: "Pinned Tweet Validator",
          status: "warn",
          score: 66,
          summary: "The pinned post carries real proof, but the copy or freshness should be tightened.",
          findings: [],
          actionLabel: "Fix pinned tweet",
        },
      ],
      strengths: ["Proof of impact: The pinned cheque/trophy image instantly signals credibility."],
      gaps: ["The bio has part of the structure, but it still needs a clearer formula."],
      unknowns: [],
      bioFormulaCheck: {
        status: "fail",
        score: 40,
        summary: "The bio has part of the structure, but it still needs a clearer formula.",
        findings: [],
        bio: "19, gpu infra // eng @cloverlabsco",
        charCount: 31,
        matchesFormula: {
          what: true,
          who: false,
          proofOrCta: false,
        },
        alternatives: [],
      },
      visualRealEstateCheck: {
        status: "warn",
        score: 60,
        summary: "The banner needs confirmation or cleanup before it can be trusted as conversion real estate.",
        findings: [],
        hasHeaderImage: true,
        headerImageUrl: null,
        headerClarity: null,
        headerClarityResolved: false,
      },
      pinnedTweetCheck: {
        status: "warn",
        score: 66,
        summary: "The pinned post carries real proof, but the copy or freshness should be tightened.",
        findings: [],
        pinnedPost: null,
        category: "milestone",
        ageDays: 50,
        isStale: false,
        visualEvidenceSummary:
          'A winner photo with a large cheque and first-place trophies. Visible text: "First Prize Winner $20k CAD". The image communicates a real achievement and gives the profile tangible authority.',
        proofStrength: "high",
        imageAdjusted: true,
        promptSuggestions: {
          originStory: "origin story",
          coreThesis: "core thesis",
        },
      },
    },
    bannerAnalysis: null,
    pinnedPostImageAnalysis: {
      imageRole: "proof",
      readableText: "First Prize Winner $20k CAD",
      primarySubject: "Kevin holding a large cheque beside trophies",
      sceneSummary: "A winner photo with a large cheque and first-place trophies.",
      strategicSignal:
        "The image communicates a real achievement and gives the profile tangible authority.",
      keyDetails: ["first prize winner", "$20k CAD", "trophies"],
    },
    analysisGoal: null,
    analysisCorrections: [],
  };
}

function createProfileReplyContext(): ProfileReplyContext {
  return {
    accountLabel: "Kevin Valencia @kkevinvalencia",
    bio: "19, gpu infra // eng @cloverlabsco",
    knownFor: "gpu infra and engineering wins",
    targetAudience: "builders and engineers",
    contentPillars: ["gpu infra systems"],
    stage: "0-1k",
    goal: "authority",
    topicInsights: [
      {
        label: "Proof-backed engineering wins",
        confidence: "high",
        kind: "proof",
        evidenceSnippets: ["First Prize Winner $20k CAD"],
        source: "mixed",
      },
    ],
    topicBullets: ["Proof-backed engineering wins"],
    recentPostSnippets: ["holy fucking cinema. https://t.co/Fqnj4ifTfI"],
    pinnedPost: "holy fucking cinema. https://t.co/Fqnj4ifTfI",
    recentPostCount: 3,
    strongestPost: {
      timeframe: "recent",
      text: "holy fucking cinema. https://t.co/Fqnj4ifTfI",
      createdAt: "2026-01-26T00:00:00.000Z",
      engagementTotal: 101,
      metrics: {
        likeCount: 80,
        replyCount: 20,
        repostCount: 1,
        quoteCount: 0,
      },
      imageUrls: ["https://pbs.twimg.com/media/kevin-proof.jpg"],
      linkSignal: "media_only",
      comparison: {
        basis: "baseline_average_engagement",
        referenceEngagementTotal: 14,
        ratio: 7.2,
      },
      reasons: [
        "This reads more like a media-backed proof post than a link-led post, so the attached image is likely carrying part of the attention.",
      ],
      hookPattern: "statement_open",
      contentType: "single_line",
    },
  };
}

test("interpretProfileAnalysisFollowUp reruns the audit for a concrete correction", () => {
  const result = interpretProfileAnalysisFollowUp({
    userMessage:
      "that's wrong. it wasn't a link. the attached image was the $20k first-place win and that's why the post performed.",
    topicSummary: "profile analysis",
  });

  expect(result).toMatchObject({
    kind: "rerun_audit",
    analysisCorrectionDetail:
      "that's wrong. it wasn't a link. the attached image was the $20k first-place win and that's why the post performed",
  });
});

test("interpretProfileAnalysisFollowUp asks one clarification question for an ambiguous correction", () => {
  const result = interpretProfileAnalysisFollowUp({
    userMessage: "that's not right",
    topicSummary: "profile analysis",
  });

  expect(result.kind).toBe("clarify_correction");
  if (result.kind !== "clarify_correction") {
    return;
  }

  expect(result.question.length).toBeGreaterThan(10);
});

test("interpretProfileAnalysisFollowUp treats a stated goal as a rerun trigger", () => {
  const result = interpretProfileAnalysisFollowUp({
    userMessage: "my goal is more founder inbound",
    topicSummary: "profile analysis",
  });

  expect(result).toMatchObject({
    kind: "rerun_audit",
    analysisGoal: "more founder inbound",
    analysisCorrectionDetail: null,
  });
});

test("buildProfileAnalysisQuestionResponse answers from the current artifact evidence", () => {
  const response = buildProfileAnalysisQuestionResponse({
    userMessage: "why did you say the strongest post was link-led?",
    artifact: createArtifact(),
    profileReplyContext: createProfileReplyContext(),
  });

  expect(response).toContain("shouldn't be described as a link-led post");
  expect(response).toContain("visual proof did the heavy lifting");
});

test("extractPersistedProfileAnalysisArtifact reads the saved artifact payload", () => {
  const artifact = createArtifact();
  const parsed = extractPersistedProfileAnalysisArtifact({
    profileAnalysisArtifact: artifact,
  });

  expect(parsed?.audit.fingerprint).toBe("fp-kevin");
  expect(PROFILE_ANALYSIS_FEEDBACK_PROMPT).toContain("goal");
});
