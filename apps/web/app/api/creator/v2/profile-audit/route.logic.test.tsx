import { expect, test } from "vitest";

import { StyleCardSchema } from "@/lib/agent-v2/core/styleProfile";
import {
  applyProfileAnalysisConversationPatchToStyleCard,
  applyProfileAuditPatchToStyleCard,
  parseProfileAuditPatchRequest,
} from "./route.logic";

function createStyleCard() {
  return StyleCardSchema.parse({
    sentenceOpenings: [],
    sentenceClosers: [],
    pacing: "",
    emojiPatterns: [],
    slangAndVocabulary: [],
    formattingRules: [],
    customGuidelines: [],
    contextAnchors: [],
    antiExamples: [],
    feedbackSubmissions: [],
  });
}

test("parseProfileAuditPatchRequest rejects invalid header clarity values", () => {
  const parsed = parseProfileAuditPatchRequest({
    headerClarity: "bad-value",
  });

  expect(parsed.ok).toBe(false);
  if (parsed.ok) {
    return;
  }

  expect(parsed.errors[0]?.field).toBe("headerClarity");
});

test("applyProfileAuditPatchToStyleCard stores dismiss fingerprint and header answer", () => {
  const styleCard = createStyleCard();
  const patched = applyProfileAuditPatchToStyleCard({
    styleCard,
    patch: {
      lastDismissedFingerprint: "bio|banner|pinned",
      headerClarity: "unclear",
      headerClarityBannerUrl: "https://pbs.twimg.com/profile_banners/123/1500x500",
    },
    nowIso: "2026-03-15T12:00:00.000Z",
  });

  expect(patched.profileAuditState).toEqual({
    lastDismissedFingerprint: "bio|banner|pinned",
    headerClarity: "unclear",
    headerClarityAnsweredAt: "2026-03-15T12:00:00.000Z",
    headerClarityBannerUrl: "https://pbs.twimg.com/profile_banners/123/1500x500",
    analysisGoal: null,
    analysisCorrections: [],
  });
});

test("applyProfileAuditPatchToStyleCard clears header metadata when the answer is reset", () => {
  const styleCard = createStyleCard();
  const firstPass = applyProfileAuditPatchToStyleCard({
    styleCard,
    patch: {
      headerClarity: "clear",
      headerClarityBannerUrl: "https://pbs.twimg.com/profile_banners/123/1500x500",
    },
    nowIso: "2026-03-15T12:00:00.000Z",
  });
  const cleared = applyProfileAuditPatchToStyleCard({
    styleCard: firstPass,
    patch: {
      headerClarity: null,
    },
    nowIso: "2026-03-16T12:00:00.000Z",
  });

  expect(cleared.profileAuditState).toEqual({
    lastDismissedFingerprint: null,
    headerClarity: null,
    headerClarityAnsweredAt: null,
    headerClarityBannerUrl: null,
    analysisGoal: null,
    analysisCorrections: [],
  });
});

test("applyProfileAnalysisConversationPatchToStyleCard stores a durable goal and correction", () => {
  const patched = applyProfileAnalysisConversationPatchToStyleCard({
    styleCard: createStyleCard(),
    patch: {
      analysisGoal: "more founder inbound",
      analysisCorrectionDetail:
        "the strongest post was not link-led; the attached image was showing a first-place $20k win",
    },
    nowIso: "2026-03-20T12:00:00.000Z",
  });

  expect(patched.profileAuditState).toEqual({
    lastDismissedFingerprint: null,
    headerClarity: null,
    headerClarityAnsweredAt: null,
    headerClarityBannerUrl: null,
    analysisGoal: "more founder inbound",
    analysisCorrections: [
      {
        id: "analysis_correction_2026-03-20T12:00:00.000Z",
        detail:
          "the strongest post was not link-led; the attached image was showing a first-place $20k win",
        createdAt: "2026-03-20T12:00:00.000Z",
      },
    ],
  });
});
