# Security Best Practices Report

Date: 2026-03-16

## Executive Summary

I audited the `apps/web` auth, scraper, agent, and creator chat surfaces and implemented a substantial first production-hardening pass. The biggest improvements now in code are shared request hardening, worker-only protection for onboarding backfill processing, Postgres-backed job/rate-limit state, durable chat turn state, deploy-time schema verification, and reduced raw LLM logging.

After this pass, I did **not** find an active critical issue in the audited surfaces. I **did** find one high-severity gap and several medium-severity production-readiness gaps that still need follow-up before claiming the system is fully production-ready and horizontally scalable.

## Scope

Audited and/or modified areas:

- Auth/session routes
- Creator chat v2 route, control plane, persistence, and client reattachment flow
- Scraper and onboarding backfill execution paths
- Shared security utilities and security headers
- Agent logging around model output / failures
- Prisma schema and startup verification relevant to chat, rate limiting, and scraper jobs

## Open Findings

## High Severity

### SBP-001: Cookie-authenticated mutation routes still use inconsistent CSRF/origin and abuse protections

- Severity: High
- Impact: Several cookie-authenticated `POST`/`PATCH` routes still accept state-changing requests without the new shared `Origin` allowlist check, without bounded JSON parsing, and without request throttling. That leaves the app with an inconsistent CSRF/abuse posture and makes it easier for one forgotten route to become the next production incident.
- Representative evidence:
  - `apps/web/app/api/creator/v2/preferences/route.ts:55-80` accepts a session-authenticated `PATCH` and reads `await request.json()` directly, but does not call `requireAllowedOrigin`, `consumeRateLimit`, or `parseJsonBody`.
  - `apps/web/app/api/billing/portal/route.ts:12-48` accepts a session-authenticated `POST` that creates a Stripe portal session, but does not use the shared origin/body/rate-limit guardrail layer.
  - `apps/web/app/api/creator/v2/product-events/route.ts:15-64` accepts a session-authenticated `POST` and parses raw JSON directly, again without the shared request hardening helpers.
- Fix guidance: Extend `requireAllowedOrigin`, `parseJsonBody`, and `consumeRateLimit` to the remaining cookie-authenticated mutation routes, especially billing, preferences, product events, draft actions, source-material writes, thread mutations, onboarding triggers, and any other browser-facing `POST`/`PATCH`/`DELETE` endpoints.
- Notes: This report is based on direct code inspection and a route scan. Some endpoints were already hardened in this pass, but the coverage is not complete yet.

## Medium Severity

### SBP-002: Chat turns are durable in storage, but execution is still request-bound

- Severity: Medium
- Impact: A chat turn now has durable metadata and the UI can reattach to active turns, but the actual AI execution still runs inside the request lifecycle. On disconnect-sensitive or serverless runtimes, a tab switch, navigation, or dropped connection can still terminate the work before completion. That is a scalability and reliability gap for the exact "leave one chat, open another chat, and let the first keep running" behavior you want.
- Evidence:
  - `apps/web/app/api/creator/v2/chat/route.ts:351-369` still executes the full turn inline by calling `handleChatRouteRequest(...)` from the HTTP request path.
  - `apps/web/app/api/creator/v2/chat/route.ts:1047-1070` still calls `manageConversationTurnRaw(...)` directly inside the route.
  - `apps/web/app/api/creator/v2/chat/_lib/control/routeTurnControl.ts:174-298` defines lease-claim and heartbeat helpers for chat turns, but there is not yet a worker consuming them.
  - `apps/web/scripts/process-background-jobs.mjs:3-35` only processes onboarding backfill jobs today; it does not claim or execute chat turns.
- Fix guidance: Add a dedicated chat worker that claims `ChatTurnControl` rows via leases, executes the turn outside the request lifecycle, heartbeats progress, and writes terminal status. The route should become enqueue-first with optional short-lived streaming while connected.

### SBP-003: Conversation memory updates are still vulnerable to lost updates under concurrent writers

- Severity: Medium
- Impact: `ConversationMemory` updates still follow a read/merge/write pattern without an optimistic version check or unique per-thread/per-run constraint. Concurrent writes can overwrite one another, which is a data integrity and scale issue when retries, duplicate tabs, or future background workers overlap on the same thread.
- Evidence:
  - `apps/web/lib/agent-v2/memory/memoryStore.ts:606-711` does `findFirst(...)`, merges the snapshot in application code, then performs `update(...)` by row `id`.
  - `apps/web/prisma/schema.prisma:253-268` defines `ConversationMemory` without a uniqueness constraint on `threadId` or `runId`.
- Fix guidance: Add a unique ownership strategy for thread/run memory and switch memory persistence to either transactional upserts with uniqueness guarantees or optimistic locking with a version/timestamp precondition.

### SBP-004: `build` success still does not prove production database readiness on platforms that skip `prestart`

- Severity: Medium
- Impact: This is the root cause class behind the `P2021` `ChatTurnControl` incident. `next build` can succeed even when the runtime database is missing required tables, because the build only compiles code against the generated Prisma client. The new `prestart` and verification script help for `next start` deployments, but serverless/platform-managed deployments still need an explicit migration step before traffic.
- Evidence:
  - `apps/web/package.json:7-11` defines `build` as `prisma generate && next build`, while `prestart` separately runs `prisma migrate deploy` and `node scripts/verify-required-db-tables.mjs`.
  - `apps/web/scripts/verify-required-db-tables.mjs:10-35` verifies the required tables only when that script is executed.
  - `apps/web/README.md:23-35` now documents that `pnpm build` compiles code but does not prove DB readiness and that serverless deploys need a separate migration step.
- Fix guidance: Add an explicit deployment-stage migration job in the real production pipeline before traffic is shifted. For platforms that do not run `next start`, do not rely on `prestart` as the only control.

### SBP-005: The global CSP is improved, but still relies on `unsafe-inline` in production

- Severity: Medium
- Impact: The app now ships a global CSP and `unsafe-eval` is limited to development, which is better than before. However, production still allows inline scripts via `script-src 'unsafe-inline'`, which weakens CSP as a defense-in-depth layer against XSS.
- Evidence:
  - `apps/web/next.config.ts:3-19` builds the CSP and keeps `script-src 'self' 'unsafe-inline'` in production, while only adding `'unsafe-eval'` outside production.
- Fix guidance: Move to a nonce- or hash-based CSP for framework-required inline scripts and remove `unsafe-inline` from the production `script-src` directive once the app is compatible.

## Implemented In This Pass

### SBP-FIX-001: Shared server-side request hardening layer added

- Evidence:
  - `apps/web/lib/security/requestValidation.ts:12-147` adds origin allowlisting, structured error envelopes, request-body byte limits, and IP extraction.
  - `apps/web/lib/security/rateLimit.ts:1-69` adds a Postgres-backed rate-limit bucket using Prisma transactions.
  - `apps/web/next.config.ts:8-49` adds baseline security headers.

### SBP-FIX-002: Auth/session and high-risk chat/scraper routes now use the hardening layer

- Evidence:
  - `apps/web/app/api/auth/login/route.ts:93-182`
  - `apps/web/app/api/auth/email-code/request/route.ts:16-61`
  - `apps/web/app/api/auth/email-code/verify/route.ts:32-96`
  - `apps/web/app/api/auth/logout/route.ts:6-10`
  - `apps/web/app/api/auth/session/route.ts:27-104`
  - `apps/web/app/api/creator/v2/chat/route.ts:287-369`
  - `apps/web/app/api/creator/v2/chat/interrupt/route.ts:22-89`
  - `apps/web/app/api/creator/v2/scrape/route.ts:20-84`
  - `apps/web/app/api/creator/profile/scrape/route.ts:212-278`
  - `apps/web/app/api/creator/v2/threads/[threadId]/route.ts:136-265`

### SBP-FIX-003: Worker-only onboarding processing is no longer publicly callable

- Evidence:
  - `apps/web/lib/security/workerAuth.ts:3-27` enforces the internal worker secret.
  - `apps/web/app/api/onboarding/backfill/process/route.ts:6-20` now rejects calls without worker authorization.

### SBP-FIX-004: Scraper backfill coordination moved from file-backed state to Postgres leases

- Evidence:
  - `apps/web/prisma/schema.prisma:270-302` adds `OnboardingBackfillJob` and `RequestRateLimitBucket`.
  - `apps/web/lib/onboarding/store/backfillJobStore.ts:121-250` implements dedupe, claim, lease, and heartbeat behavior in Postgres.
  - `apps/web/scripts/process-background-jobs.mjs:1-35` adds a dedicated onboarding background worker loop.

### SBP-FIX-005: Chat turn state is now durable enough for idempotency, interruption, and reattachment

- Evidence:
  - `apps/web/prisma/schema.prisma:186-220` extends `ChatTurnControl` with durable status, lease, billing, progress, and error metadata.
  - `apps/web/app/api/creator/v2/chat/route.ts:693-715` suppresses duplicate in-progress turns and same-thread overlap.
  - `apps/web/app/api/creator/v2/chat/turns/[turnId]/route.ts:7-55` adds turn-status reads for UI reattachment.
  - `apps/web/app/api/creator/v2/threads/[threadId]/route.ts:117-128` includes the current `activeTurn` in thread hydration.

### SBP-FIX-006: Sensitive model logging was reduced

- Evidence:
  - `apps/web/lib/agent-v2/agents/llm.ts:174-224` logs request IDs, model names, and parse failures without dumping full model payloads.
  - `apps/web/lib/agent-v2/agents/ideator.ts:627-630` no longer logs the raw model output blob on validation failure.
  - `apps/web/lib/agent-v2/core/styleProfile.ts:427-432` no longer logs the raw provider error body.

### SBP-FIX-007: Missing-table failures now fail clearer, and startup can verify required tables

- Evidence:
  - `apps/web/scripts/verify-required-db-tables.mjs:1-42` checks for `ChatTurnControl`, `OnboardingBackfillJob`, and `RequestRateLimitBucket`.
  - `apps/web/package.json:7-11` wires schema verification into `prestart`.
  - `apps/web/app/api/creator/v2/chat/route.ts:1141-1147` converts the missing `ChatTurnControl` table case into a clearer `503` with migration guidance.

## Why The `ChatTurnControl` Error Passed Build

`next build` passed because that command only compiles application code and typechecks against the generated Prisma client. It does **not** inspect the actual production database schema. Before runtime traffic hit `/api/creator/v2/chat`, nothing forced the deployed database to prove that `public.ChatTurnControl` existed.

That is why the failure only appeared at runtime:

- `apps/web/package.json:7` builds code
- `apps/web/package.json:8-11` handles migration and schema verification separately
- `apps/web/scripts/verify-required-db-tables.mjs:10-35` is the first code that checks whether the actual tables exist

The new safeguards reduce the chance of that failure class recurring, but they only fully protect deployments that actually run the migration/verification step before traffic.

## Verification Performed

- `pnpm build` in `apps/web` — passed
- `pnpm run test:v2-route` in `apps/web` — passed (`58/58`)
- `pnpm exec vitest run app/chat/_features/thread-history/useThreadHistoryHydration.test.tsx app/chat/_features/chat-page/ChatCanvasContext.test.tsx` in `apps/web` — passed (`7/7`)

## Recommended Next Order Of Work

1. Finish hardening the remaining cookie-authenticated mutation routes with the shared request guardrails.
2. Implement a real chat worker that claims `ChatTurnControl` rows and executes them off-request.
3. Add uniqueness/optimistic locking for `ConversationMemory`.
4. Move the production deploy process to an explicit `migrate deploy` + schema verification stage before traffic.
5. Replace the remaining production `unsafe-inline` CSP dependency with nonce/hash-based script allowances.
