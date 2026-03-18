import assert from "node:assert/strict";
import test from "node:test";

import { buildEffectiveContext } from "./contextRetriever.ts";

test("buildEffectiveContext includes approved plan and source material references", () => {
  const context = buildEffectiveContext({
    recentHistory: "user: write the post\nassistant: here's the draft",
    rollingSummary: "Current topic: hiring systems",
    relevantTopicAnchors: ["founders trust tactical postmortems"],
    factualContext: ["taiv requested an interview"],
    voiceContextHints: ["leans candid and direct"],
    activeConstraints: ["Correction lock: taiv is a real interview checkpoint."],
    approvedPlan: {
      objective: "hiring systems",
      angle: "show the one filter that kept the team lean",
      targetLane: "original",
      hookType: "direct",
      pitchResponse: "lead with the filter that changed the team shape",
    },
    activeDraft: "ship the filter before you scale the headcount.",
    sourceMaterialRefs: [
      {
        title: "Hiring notes",
        type: "playbook",
        claims: ["the filter reduced interview drift"],
        snippets: ["we kept reusing the same scorecard wording"],
      },
    ],
  });

  assert.match(context, /APPROVED PLAN:/);
  assert.match(context, /SOURCE MATERIAL REFERENCES:/);
  assert.match(context, /CURRENT ARTIFACT SUMMARY:/);
  assert.match(context, /Hiring notes \(playbook\)/);
});

test("buildEffectiveContext drops stale ideation menu lines once a plan or draft is in play", () => {
  const context = buildEffectiveContext({
    recentHistory: [
      "assistant: 1. the hiring filter that kept our team lean",
      "assistant: 2. why onboarding breaks when nobody owns the first week",
      "assistant: which one do you want me to draft?",
      "user: go with angle 2",
      "assistant: sounds good",
    ].join("\n"),
    rollingSummary: "Current topic: hiring systems",
    relevantTopicAnchors: ["historical anchor"],
    approvedPlan: {
      objective: "hiring systems",
      angle: "why onboarding breaks when nobody owns the first week",
      targetLane: "original",
    },
    activeDraft: "first week ownership is the real onboarding system.",
  });

  assert.doesNotMatch(
    context,
    /the hiring filter that kept our team lean|which one do you want me to draft/i,
  );
  assert.match(context, /LATEST RELEVANT TURNS:/);
  assert.match(context, /user: go with angle 2/i);
});
