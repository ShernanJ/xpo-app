import test from "node:test";
import assert from "node:assert/strict";

import { selectResponseShapePlan } from "./surfaceModeSelector.ts";
import { shapeAssistantResponse } from "./responseShaper.ts";

test("response shaper strips memory notices and follow-up prompts for direct answers", () => {
  const plan = selectResponseShapePlan({
    outputShape: "coach_question",
    response:
      "Noted - I'll remember that feedback for next drafts.\n\nthat one feels cleaner now. want me to turn that into a post?",
    hasQuickReplies: false,
    hasAngles: false,
    hasPlan: false,
    hasDraft: false,
    conversationState: "needs_more_context",
    preferredSurfaceMode: "natural",
  });

  const response = shapeAssistantResponse({
    response:
      "Noted - I'll remember that feedback for next drafts.\n\nthat one feels cleaner now. want me to turn that into a post?",
    outputShape: "coach_question",
    plan,
  });

  assert.equal(plan.surfaceMode, "ask_one_question");
  assert.equal(response, "that one feels cleaner now.");
});

test("response shaper strips fluffy lead-ins from visible replies", () => {
  const plan = selectResponseShapePlan({
    outputShape: "coach_question",
    response: "love that. i can help with post ideas, drafts, or revisions.",
    hasQuickReplies: false,
    hasAngles: false,
    hasPlan: false,
    hasDraft: false,
    conversationState: "needs_more_context",
    preferredSurfaceMode: "natural",
  });

  const response = shapeAssistantResponse({
    response: "love that. i can help with post ideas, drafts, or revisions.",
    outputShape: "coach_question",
    plan,
  });

  assert.equal(response, "i can help with post ideas, drafts, or revisions.");
});

test("response shaper strips short canned acknowledgments before substantive replies", () => {
  const plan = selectResponseShapePlan({
    outputShape: "coach_question",
    response: "got it. the sharper move is to lead with the contradiction instead of the feature list.",
    hasQuickReplies: false,
    hasAngles: false,
    hasPlan: false,
    hasDraft: false,
    conversationState: "needs_more_context",
    preferredSurfaceMode: "natural",
  });

  const response = shapeAssistantResponse({
    response: "got it. the sharper move is to lead with the contradiction instead of the feature list.",
    outputShape: "coach_question",
    plan,
  });

  assert.equal(response, "the sharper move is to lead with the contradiction instead of the feature list.");
});

test("response shaper keeps standalone short acknowledgments when there is nothing else to say", () => {
  const plan = selectResponseShapePlan({
    outputShape: "coach_question",
    response: "got it.",
    hasQuickReplies: false,
    hasAngles: false,
    hasPlan: false,
    hasDraft: false,
    conversationState: "needs_more_context",
    preferredSurfaceMode: "natural",
  });

  const response = shapeAssistantResponse({
    response: "got it.",
    outputShape: "coach_question",
    plan,
  });

  assert.equal(response, "got it.");
});

test("surface mode selector marks draft revisions as revise_and_return", () => {
  const plan = selectResponseShapePlan({
    outputShape: "short_form_post",
    response: "updated it based on your note. want any tweaks before posting?",
    hasQuickReplies: false,
    hasAngles: false,
    hasPlan: false,
    hasDraft: true,
    conversationState: "editing",
    preferredSurfaceMode: "natural",
  });

  const response = shapeAssistantResponse({
    response: "updated it based on your note. want any tweaks before posting?",
    outputShape: "short_form_post",
    plan,
  });

  assert.equal(plan.surfaceMode, "revise_and_return");
  assert.equal(response, "updated it based on your note.");
});

test("surface mode selector keeps structured generations structured", () => {
  const plan = selectResponseShapePlan({
    outputShape: "planning_outline",
    response: "this direction feels strongest.\n\nwant me to draft this as-is, or tweak the angle first?",
    hasQuickReplies: true,
    hasAngles: false,
    hasPlan: true,
    hasDraft: false,
    conversationState: "plan_pending_approval",
    preferredSurfaceMode: "structured",
  });

  assert.deepEqual(plan, {
    mode: "structured_generation",
    surfaceMode: "offer_options",
    shouldShowArtifacts: true,
    shouldExplainReasoning: false,
    shouldAskFollowUp: true,
    maxFollowUps: 1,
  });
});

test("surface mode selector treats thread drafts as full generated output", () => {
  const plan = selectResponseShapePlan({
    outputShape: "thread_seed",
    response: "drafted a version. tune tone, hook, or length?",
    hasQuickReplies: false,
    hasAngles: false,
    hasPlan: false,
    hasDraft: true,
    conversationState: "draft_ready",
    preferredSurfaceMode: "natural",
  });

  assert.deepEqual(plan, {
    mode: "structured_generation",
    surfaceMode: "generate_full_output",
    shouldShowArtifacts: true,
    shouldExplainReasoning: false,
    shouldAskFollowUp: false,
    maxFollowUps: 0,
  });

  const response = shapeAssistantResponse({
    response: "drafted a version. tune tone, hook, or length?",
    outputShape: "thread_seed",
    plan,
  });

  assert.equal(response, "drafted a version. tune tone, hook, or length?");
});

test("response shaper formats long direct coach replies into a structured thesis and bullets", () => {
  const plan = selectResponseShapePlan({
    outputShape: "coach_question",
    response:
      'lead with a concrete hook that shows the payoff for followers. example: "Built $30M ARR with 10 engineers." follow with a one-line proof: "60k creators on our platform, $2.5M MRR." add a CTA that ties to your PDF: "FREE hiring playbook ->". keep it under 150 characters and avoid filler.',
    hasQuickReplies: false,
    hasAngles: false,
    hasPlan: false,
    hasDraft: false,
    conversationState: "needs_more_context",
    preferredSurfaceMode: "natural",
  });

  const response = shapeAssistantResponse({
    response:
      'lead with a concrete hook that shows the payoff for followers. example: "Built $30M ARR with 10 engineers." follow with a one-line proof: "60k creators on our platform, $2.5M MRR." add a CTA that ties to your PDF: "FREE hiring playbook ->". keep it under 150 characters and avoid filler.',
    outputShape: "coach_question",
    plan,
  });

  assert.match(response, /^\*\*Takeaway:\*\* lead with a concrete hook that shows the payoff for followers\./m);
  assert.match(response, /- example: "Built \$30M ARR with 10 engineers\."/i);
  assert.equal(/Bottom line|Note:|Best next move/i.test(response), false);
  assert.match(response, /keep it under 150 characters and avoid filler/i);
});

test("response shaper preserves authored structure for profile replies", () => {
  const responseText = [
    "I see you've positioned yourself as a builder focused on growth systems.",
    "",
    "Lately you've been posting about:",
    "- Retrieval quality and proof-first writing",
    "- Narrowing the lane before scaling output",
    "",
    "I can also pull the strongest recent post I can see here and break down why it worked.",
  ].join("\n");

  const plan = selectResponseShapePlan({
    outputShape: "coach_question",
    response: responseText,
    hasQuickReplies: false,
    hasAngles: false,
    hasPlan: false,
    hasDraft: false,
    conversationState: "needs_more_context",
    preferredSurfaceMode: "natural",
  });

  const response = shapeAssistantResponse({
    response: responseText,
    outputShape: "coach_question",
    plan,
    presentationStyle: "preserve_authored_structure",
  });

  assert.equal(response.includes("- **Bottom line:**"), false);
  assert.equal(response, responseText);
});

test("response shaper formats long coach replies before a follow-up question", () => {
  const responseText =
    "Your hooks hit hard because they lead with numbers and contrast. What works: - Bold claim, then a quick breakdown of the range. - FREE offer framed as high-value content. What to tighten: - Add a single line that tells the reader why they should care now. - Keep the body scannable with short takeaway lines. Next step: rewrite one recent caption around a stronger why-now line. Which post would you like to revamp first?";

  const plan = selectResponseShapePlan({
    outputShape: "coach_question",
    response: responseText,
    hasQuickReplies: false,
    hasAngles: false,
    hasPlan: false,
    hasDraft: false,
    conversationState: "needs_more_context",
    preferredSurfaceMode: "natural",
  });

  const response = shapeAssistantResponse({
    response: responseText,
    outputShape: "coach_question",
    plan,
  });

  assert.equal(plan.surfaceMode, "ask_one_question");
  assert.match(response, /^\*\*Takeaway:\*\* Your hooks hit hard because they lead with numbers and contrast\./m);
  assert.match(response, /^Which post would you like to revamp first\?$/m);
  assert.equal(/Bottom line|What to fix|Next:/i.test(response), false);
});

test("response shaper structures medium replies more aggressively in structured surface mode", () => {
  const plan = selectResponseShapePlan({
    outputShape: "coach_question",
    response:
      "the positioning is close, but the promise still takes too long to land. tighten the first line so the audience and payoff are visible immediately. then use one proof point instead of stacking two softer claims.",
    hasQuickReplies: false,
    hasAngles: false,
    hasPlan: false,
    hasDraft: false,
    conversationState: "needs_more_context",
    preferredSurfaceMode: "structured",
  });

  const response = shapeAssistantResponse({
    response:
      "the positioning is close, but the promise still takes too long to land. tighten the first line so the audience and payoff are visible immediately. then use one proof point instead of stacking two softer claims.",
    outputShape: "coach_question",
    plan,
  });

  assert.match(response, /^\*\*Takeaway:\*\* the positioning is close, but the promise still takes too long to land\./m);
  assert.match(response, /- tighten the first line so the audience and payoff are visible immediately\./i);
});

test("response shaper leaves short direct coach replies unformatted", () => {
  const plan = selectResponseShapePlan({
    outputShape: "coach_question",
    response: "lead with the proof first, then tighten the CTA.",
    hasQuickReplies: false,
    hasAngles: false,
    hasPlan: false,
    hasDraft: false,
    conversationState: "needs_more_context",
    preferredSurfaceMode: "natural",
  });

  const response = shapeAssistantResponse({
    response: "lead with the proof first, then tighten the CTA.",
    outputShape: "coach_question",
    plan,
  });

  assert.equal(response, "lead with the proof first, then tighten the CTA.");
});

test("response shaper preserves existing markdown structure", () => {
  const plan = selectResponseShapePlan({
    outputShape: "coach_question",
    response: "- **Hook:** lead with the proof\n- **CTA:** tighten the ask",
    hasQuickReplies: false,
    hasAngles: false,
    hasPlan: false,
    hasDraft: false,
    conversationState: "needs_more_context",
    preferredSurfaceMode: "natural",
  });

  const response = shapeAssistantResponse({
    response: "- **Hook:** lead with the proof\n- **CTA:** tighten the ask",
    outputShape: "coach_question",
    plan,
  });

  assert.equal(response, "- **Hook:** lead with the proof\n- **CTA:** tighten the ask");
});
