# `lib/onboarding`

This folder owns the X account onboarding pipeline. Its job is to turn a handle plus a small amount of user input into a durable onboarding result the rest of the app can use for chat grounding, style profiling, and strategy context.

## Read This First

If you are new here, start in this order:

1. `pipeline/service.ts`
2. `sources/resolveOnboardingSource.ts`
3. `analysis/postAnalysis.ts`
4. `strategy/agentContext.ts`
5. `store/onboardingRunStore.ts`

If you are debugging onboarding end-to-end, also read:

1. `app/api/onboarding/run/route.ts`
2. `pipeline/backfill.ts`
3. `profile/profilePreview.ts`

## What This Folder Owns

- selecting a real onboarding data source
- analyzing captured posts and profile data
- computing growth-stage and strategy artifacts
- persisting onboarding runs and scrape captures
- syncing posts into Prisma for downstream retrieval
- producing creator context used later by chat
- scheduling deeper backfill when the first capture is too thin

This folder does not own chat orchestration. The chat runtime lives in `apps/web/lib/agent-v2`.

## Mental Model

The onboarding flow is:

1. Validate input
2. Resolve a source:
   - scrape
   - X API
   - mock fallback
3. Capture profile and posts
4. Analyze the capture
5. Build strategy and creator context
6. Persist the run
7. Sync posts and style profile
8. Optionally enqueue deeper backfill

The output is not just a scrape payload. It is a reusable app artifact that later powers:

- creator profile hints
- growth operating system payloads
- style profile generation
- chat grounding and strategy context

## Folder Guide

### `analysis/`

Pure-ish analysis logic over captured profile and post data.

Examples:

- engagement baseline
- content distribution
- hook patterns
- growth stage
- content insights
- evaluation summaries

Start here if the numbers or strategy conclusions look wrong.

### `contracts/`

Input, output, and validation contracts for onboarding.

Examples:

- `types.ts`
- `validation.ts`
- `generationContract.ts`
- `draftValidator.ts`

Start here if the API payload or onboarding result shape is confusing.

### `pipeline/`

The orchestration layer for onboarding.

Key files:

- `service.ts`: main onboarding execution path
- `backfill.ts`: deeper-history job scheduling and processing
- `regression.ts`: regression support

Start here if you want the high-level flow.

### `profile/`

Profile hydration and preview helpers.

Key use cases:

- previewing likely profile info before a full run
- converting raw profile data into creator-facing structures
- auditing profile conversion quality

### `shared/`

Shared onboarding artifacts and mock data.

This is support code, not the main control plane.

### `sources/`

All onboarding source resolution lives here.

Key files:

- `resolveOnboardingSource.ts`: source-selection entrypoint
- `scrapeSource.ts`: scrape-first implementation
- `xApiSource.ts`: X API fallback
- `mockSource.ts`: mock fallback

Start here if onboarding is pulling the wrong data or unexpectedly falling back.

### `store/`

Persistence helpers for onboarding state.

Key responsibilities:

- onboarding run persistence
- scrape capture cache
- backfill job state

### `strategy/`

Turns onboarding output into reusable creator context.

Key files:

- `agentContext.ts`
- `contextEnrichment.ts`
- `growthStrategy.ts`
- `strategyOverrides.ts`
- `coachReply.ts`

Start here if the generated growth guidance feels wrong even though the capture itself looks correct.

## Entry Points

Main route entrypoints:

- `app/api/onboarding/run/route.ts`
- `app/api/onboarding/preview/route.ts`
- `app/api/onboarding/runs/route.ts`
- `app/api/onboarding/backfill/*`

Main library entrypoints:

- `pipeline/service.ts`
- `sources/resolveOnboardingSource.ts`
- `strategy/agentContext.ts`
- `strategy/contextEnrichment.ts`

## Current State Notes

- Scrape-first is the practical default in the live app.
- X API is a fallback path when configured.
- Mock fallback is allowed in development and explicitly guarded in production.
- Backfill is app-managed workflow logic, not a separate external queue service.
- The onboarding result is persisted and then reused by the chat system; it is not a one-off page response.

## Common Debugging Paths

If onboarding fails before returning a result:

- check `contracts/validation.ts`
- check `sources/resolveOnboardingSource.ts`
- check scrape/X API env vars

If onboarding returns weak or misleading strategy:

- check `analysis/*`
- check `strategy/*`
- check whether the sample size was too small and triggered low-confidence output

If chat seems disconnected from onboarding:

- check `store/onboardingRunStore.ts`
- check post sync + style profile generation in `app/api/onboarding/run/route.ts`
- then move to `apps/web/lib/agent-v2`
