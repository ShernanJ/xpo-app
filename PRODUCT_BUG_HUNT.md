# Product Bug Hunt Guide

This file is a handoff note for future agents. It explains what counts as a product bug in this repo, how to find one efficiently, and which bug hunt is the highest-value starting point right now.

## What A Product Bug Is

A product bug is a user-visible behavior problem, not an architecture or folder-structure problem.

Examples:

- generated post gets cut off
- reply flow chooses the wrong mode
- revision ignores the user request
- source materials chosen are irrelevant
- duplicate writes or duplicate assistant messages happen
- draft/thread UI gets out of sync with persisted state

## Fast Bug-Finding Loop

1. Start from a real symptom, not a file.
2. Reproduce it with either:
   - an existing test
   - a new focused test
   - a manual `/chat` flow
3. Trace the symptom through the ownership layers:
   - request normalization
   - runtime routing
   - capability execution
   - validation/retry
   - persistence
   - UI state hydration
4. Fix the smallest owner that should control that behavior.
5. Keep the fix test-backed.

## Highest-Value First Bug Hunt

### Target

Draft or reply truncation, meaning content that feels cut off or ends before a complete finish.

### Why This Is The Best First Hunt

- it is highly user-visible
- it directly affects output quality
- the repo already has partial guardrails, which means we have a strong starting point
- it crosses runtime, validation, and capability behavior in a way that can hide subtle failures

### Evidence Already In The Repo

Current truncation-related guardrails exist in:

- `apps/web/lib/agent-v2/validators/shared/deliveryValidators.ts`
- `apps/web/lib/agent-v2/validators/shared/conversationDeliveryValidators.ts`
- `apps/web/lib/agent-v2/workers/validation/deliveryValidationWorkers.ts`
- `apps/web/lib/agent-v2/workers/validation/conversationValidationWorkers.ts`

Coverage already exists in:

- `apps/web/lib/agent-v2/runtime/conversationManager.test.mjs`
- `apps/web/lib/agent-v2/capabilities/replyAnalysisExecutors.test.mjs`

Relevant execution paths:

- `apps/web/lib/agent-v2/runtime/draftPipeline.ts`
- `apps/web/lib/agent-v2/capabilities/revision/revisingCapability.ts`
- `apps/web/lib/agent-v2/capabilities/reply/replyTurnLogic.ts`

### Working Hypothesis

The most likely high-value failures are not “there is no truncation guard.” The likely bugs are:

- truncation is detected too late
- retry constraints are not strong enough on some paths
- one workflow falls back in a way that still feels cut off
- draft and reply paths are not equally protected

## Recommended First Investigation

1. Read:
   - `apps/web/lib/agent-v2/validators/shared/deliveryValidators.ts`
   - `apps/web/lib/agent-v2/workers/validation/deliveryValidationWorkers.ts`
   - `apps/web/lib/agent-v2/runtime/draftPipeline.ts`
2. Review the existing tests around:
   - `truncation_guard`
   - delivery retry
   - fallback-after-validation-failure
3. Add one new failing test for the exact user symptom you want to protect.

Good first test ideas:

- draft path retries once on a cut-off first pass and returns a complete second pass
- draft path fallback copy does not still look truncated after repeated failure
- reply path gets the same truncation protection guarantees as draft path
- thread output does not pass validation with a broken last post

## Other Good Bug Hunts After That

If truncation turns out to be solid, the next best targets are:

1. Wrong reply mode or stale reply-state carryover
2. Revision request not being followed precisely
3. Irrelevant source-material selection
4. UI thread/draft state drift in `/chat`

## Best Test Surfaces

Use these first:

- `apps/web/lib/agent-v2/runtime/conversationManager.test.mjs`
- `apps/web/lib/agent-v2/responseQuality.test.mjs`
- `apps/web/app/api/creator/v2/chat/route.test.mjs`
- `apps/web/app/api/creator/v2/chat/route.reply.test.mjs`
- `apps/web/lib/agent-v2/regressions/chatRegression.test.mjs`

## Agent Guidance

Recommended reasoning effort:

- `high` for runtime, routing, validation, and persistence bugs
- `medium` for localized response-shaping bugs
- `medium` for UI-state bugs if they stay inside one feature slice

Guardrails:

- do not start with broad architecture cleanup
- do not move folders while hunting a product bug
- prefer a failing test before changing behavior
- keep fixes inside the owning layer

## Current Recommendation

If another agent picks up from here, the best next task is:

> Hunt truncation/cut-off behavior in draft and reply delivery paths, starting with the validation and retry chain.
