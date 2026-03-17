# XPO App Summary

> Generated from repository inspection on 2026-03-17. This summary is based on the checked-in code, manifests, Prisma schema, migrations, docs, and route handlers. I did not run the full application or full test suite while producing it.

## Executive Summary

- This repository is monorepo-shaped, but the only real shipped runtime is `apps/web`.
- The product is an X/Twitter creator assistant: onboarding and scrape capture feed a chat-first AI workspace for ideation, drafting, revision, reply workflows, profile analysis, and extension-assisted engagement loops.
- The actual backend stack is Next.js App Router + Prisma/PostgreSQL + Supabase Auth + a custom JWT session cookie + Groq SDK + Stripe.
- The codebase is real and fairly deep: 58 API route handlers live under `apps/web/app/api`, and 352 files live under `apps/web/lib`.
- The schema is hybrid: top-level entities are relational, but many important product artifacts are stored as JSON blobs.
- Cleanup is not finished. Legacy NextAuth artifacts still exist, several top-level folders are empty placeholders, and multiple features degrade or disappear if env flags or the latest Prisma migrations are missing.

## 1. Tech Stack

### High-level stack

| Area | Actual implementation | Notes |
| --- | --- | --- |
| App runtime | Next.js 16.1.6 App Router | Single deployed app in `apps/web` |
| UI | React 19.2.3 | Client-heavy `/chat` workspace |
| Language | TypeScript + Node `.mjs` scripts | App code is mostly TS; scripts/tests mix TS and ESM |
| Database | PostgreSQL | Accessed through Prisma |
| ORM | Prisma 7.4.2 | Generated client committed under `apps/web/lib/generated/prisma` |
| Auth provider | Supabase Auth | Used via direct REST calls, not the Supabase JS SDK |
| Session layer | Custom JWT cookie via `jose` | Cookie name is `sx_session`, signed with `SESSION_SECRET` |
| AI provider | Groq SDK | Main model gateway for chat, banner analysis, and image-post flows |
| Billing | Stripe | Checkout, portal, webhook ingestion, entitlement reconciliation |
| Styling | Tailwind CSS 4 + custom global CSS | No external UI component framework |
| Animation | Framer Motion | Used in UI interactions |
| Icons | Lucide React | Primary icon library |
| Validation | Zod | Request parsing and domain schema validation |
| Test stack | Vitest, Playwright, Node test runner | Mix of component, route, regression, and e2e tests |

### Notable implementation details

- The repo does **not** have a `pnpm-workspace.yaml`, Turborepo config, Nx config, or Lerna config.
- The root package is not the real app entrypoint. The real application package is `apps/web/package.json`.
- Auth is **not** currently driven by NextAuth, even though `next-auth` and `@auth/prisma-adapter` remain in dependencies.
- Styling is mostly hand-rolled Tailwind and custom CSS, not a third-party design system.

### Root `package.json`

```json
{
  "dependencies": {
    "framer-motion": "^12.35.0"
  }
}
```

### `apps/web/package.json` dependencies

```json
{
  "@auth/prisma-adapter": "^2.11.1",
  "@prisma/adapter-pg": "^7.4.2",
  "@prisma/client": "^7.4.2",
  "bcryptjs": "^3.0.3",
  "dotenv": "^17.3.1",
  "framer-motion": "^12.35.0",
  "groq-sdk": "^0.37.0",
  "jose": "^6.1.3",
  "lucide-react": "^0.576.0",
  "next": "16.1.6",
  "next-auth": "^4.24.13",
  "pg": "^8.19.0",
  "react": "19.2.3",
  "react-dom": "19.2.3",
  "stripe": "^20.4.0",
  "zod": "^4.3.6"
}
```

### `apps/web/package.json` devDependencies

```json
{
  "@tailwindcss/postcss": "^4",
  "@testing-library/jest-dom": "^6.9.1",
  "@testing-library/react": "^16.3.2",
  "@testing-library/user-event": "^14.6.1",
  "@types/bcryptjs": "^2.4.6",
  "@types/node": "^20",
  "@types/pg": "^8.18.0",
  "@types/react": "^19",
  "@types/react-dom": "^19",
  "eslint": "^9",
  "eslint-config-next": "16.1.6",
  "fast-check": "3.23.2",
  "jsdom": "^28.1.0",
  "playwright": "^1.58.2",
  "prisma": "^7.4.2",
  "tailwindcss": "^4",
  "typescript": "^5",
  "vitest": "^4.1.0"
}
```

### Dependency cleanup debt worth knowing

- `next-auth`, `@auth/prisma-adapter`, and `bcryptjs` are still installed, but I could not find active app-code imports for them outside package metadata and lockfiles.
- `@prisma/client` is installed, but the runtime imports the generated local client from `apps/web/lib/generated/prisma`.
- The root `package.json` is basically vestigial; it only duplicates `framer-motion`.

## 2. Directory Structure

```text
.
├── README.md
├── PLAN.md / Artifact.md / LIVE_AGENT.md / DEVELOPMENT.md
├── apps/
│   ├── api/                                   # empty placeholder
│   └── web/                                   # actual shipped application
│       ├── app/                               # App Router pages and API routes
│       │   ├── api/
│       │   │   ├── auth/
│       │   │   ├── billing/
│       │   │   ├── creator/
│       │   │   │   └── v2/
│       │   │   ├── extension/
│       │   │   ├── onboarding/
│       │   │   ├── performance/
│       │   │   ├── stripe/
│       │   │   └── test/
│       │   ├── chat/                          # main chat workspace UI
│       │   │   ├── _components/
│       │   │   ├── _dialogs/
│       │   │   └── _features/
│       │   ├── onboarding/
│       │   ├── login/
│       │   ├── pricing/
│       │   ├── extension/connect/
│       │   └── privacy / terms / refund-policy
│       ├── components/                        # shared UI and shell components
│       ├── e2e/                               # Playwright specs
│       ├── lib/
│       │   ├── agent-v2/                      # AI runtime core
│       │   │   ├── agents/
│       │   │   ├── capabilities/
│       │   │   ├── contracts/
│       │   │   ├── core/
│       │   │   ├── grounding/
│       │   │   ├── memory/
│       │   │   ├── persistence/
│       │   │   ├── responses/
│       │   │   ├── runtime/
│       │   │   └── workers/
│       │   ├── auth/
│       │   ├── billing/
│       │   ├── chat/
│       │   ├── creator/
│       │   ├── extension/
│       │   ├── feedback/
│       │   ├── generated/prisma/             # generated Prisma client committed to repo
│       │   ├── onboarding/
│       │   │   ├── analysis/
│       │   │   ├── contracts/
│       │   │   ├── pipeline/
│       │   │   ├── profile/
│       │   │   ├── sources/
│       │   │   ├── store/
│       │   │   └── strategy/
│       │   ├── security/
│       │   └── ui/
│       ├── prisma/
│       │   ├── schema.prisma
│       │   └── migrations/
│       ├── public/
│       ├── scripts/                           # worker, scrape, replay, verification scripts
│       ├── package.json
│       └── .env.example
├── db/                                        # sample/local JSON and JSONL artifacts
├── docs/                                      # current-state architecture docs
├── infra/                                     # empty placeholder
├── packages/                                  # empty placeholder tree
├── scripts/                                   # root helper scripts
└── workers/                                   # empty placeholder tree
```

### Important structural notes

- `apps/web/app/chat/page.tsx` is still a large integration surface at about **2219 lines**.
- `apps/web/app/api/creator/v2/chat/route.ts` is the heaviest backend boundary at about **1247 lines**.
- `apps/web/prisma/schema.prisma` is **572 lines** and is the canonical data model.
- `packages/`, `workers/`, `infra/`, and `apps/api/` currently contain directories only, not active source code.
- `db/` is not the live database layer. It contains checked-in JSON/JSONL artifacts such as onboarding runs and scrape captures.

## 3. Database Schema

### Schema source and migration status

- Canonical schema file: `apps/web/prisma/schema.prisma`
- Datasource: PostgreSQL
- Prisma generator output: `apps/web/lib/generated/prisma`
- Migration folders present:
  - `20260305193000_baseline_supabase`
  - `20260308160000_draft_candidates`
  - `20260310173000_source_material_assets`
  - `20260310224500_product_events`
  - `20260311130000_extension_growth_loop`
  - `20260311183000_extension_contract_upgrade`
  - `20260313170000_reply_opportunity_handle_isolation`
  - `20260316110000_chat_turn_control`
  - `20260316153000_production_hardening_phase1`
  - `20260316184500_conversation_memory_optimistic_locking`
  - `20260316193000_chat_media_assets`

### Schema shape at a glance

- The app uses a **hybrid relational + JSON-heavy schema**.
- Tenanting is primarily `userId` plus optional `xHandle`.
- A lot of product state is stored in JSON blobs:
  - onboarding inputs/results
  - style cards and preferences
  - chat message payloads
  - conversation memory state
  - draft artifacts
  - source material claims/snippets
  - reply opportunity metadata
  - feedback context/attachments
  - analytics event properties
- Chat media bytes are stored directly in Postgres, not object storage.

### Enums

- `BillingPlan`: `free`, `pro`, `lifetime`
- `BillingStatus`: `active`, `past_due`, `canceled`, `blocked_fair_use`
- `BillingCycle`: `monthly`, `annual`, `lifetime`
- `CreditActionType`: `monthly_grant`, `debit`, `refund`, `manual_adjustment`, `migration_grant`
- `LifetimeReservationStatus`: `pending`, `completed`, `expired`, `canceled`
- `ChatMessageFeedbackValue`: `up`, `down`
- `DraftCandidateStatus`: `pending`, `approved`, `rejected`, `edited`, `posted`, `observed`
- `SourceMaterialType`: `story`, `playbook`, `framework`, `case_study`
- `ReplyOpportunityState`: `ranked`, `opened`, `generated`, `selected`, `copied`, `posted`, `dismissed`, `observed`
- `ChatTurnStatus`: `queued`, `running`, `cancel_requested`, `cancelled`, `completed`, `failed`
- `OnboardingBackfillJobStatus`: `pending`, `processing`, `completed`, `failed`

### Identity and profile models

| Model | Purpose | Key fields / notes |
| --- | --- | --- |
| `User` | Canonical app user, keyed to Supabase identity | `id`, `email`, `handle`, `activeXHandle`, broad relation hub to onboarding, chat, billing, extension, and analytics |
| `VoiceProfile` | Per-user/per-handle voice card and preferences | `styleCard` JSON holds voice guidelines, preferences, profile audit state, and legacy feedback submissions |

### Onboarding and X data models

| Model | Purpose | Key fields / notes |
| --- | --- | --- |
| `OnboardingRun` | Stores raw onboarding input and computed analysis result | `input` JSON, `result` JSON, linked to user, memories, and draft candidates |
| `Post` | Normalized user posts captured from X | X post ID primary key, `lane` (`original`/`reply`/`quote`), `metrics` JSON |
| `ScrapeCaptureCache` | Cached scrape payload by account | `profile`, `posts`, `replyPosts`, `quotePosts`, TTL via `expiresAt` |
| `OnboardingBackfillJob` | Async queue for deeper scrape pagination | dedupe key, attempts, lease/heartbeat, capture tracking |

### Chat runtime models

| Model | Purpose | Key fields / notes |
| --- | --- | --- |
| `ChatThread` | User thread container within a workspace handle | `title`, `xHandle`, timestamps, linked messages/media/drafts/memory |
| `ChatMessage` | Transcript rows | `role`, `content`, optional `data` JSON payload for structured artifacts |
| `ConversationMemory` | Durable AI memory state | unique on `runId` or `threadId`, `activeConstraints` JSON, `lastDraftArtifactId` |
| `ChatTurnControl` | Turn orchestration and idempotency state | `runId`, `clientTurnId`, status, lease, heartbeat, progress labels, billing idempotency, assistant message linkage |
| `ChatMediaAsset` | Uploaded media bytes and previews | stores raw `Bytes`, metadata, thread/user linkage |
| `ChatMessageFeedback` | User thumbs up/down on assistant messages | unique on `userId + messageId` |

### Drafting and grounding models

| Model | Purpose | Key fields / notes |
| --- | --- | --- |
| `DraftCandidate` | Draft inbox / candidate lifecycle | `artifact` JSON, `voiceTarget`, `noveltyNotes`, status transitions, observed metrics |
| `SourceMaterialAsset` | User-managed grounding assets | `type`, `title`, `verified`, `claims`, `snippets`, `doNotClaim`, `lastUsedAt` |

### Extension, feedback, and analytics models

| Model | Purpose | Key fields / notes |
| --- | --- | --- |
| `ExtensionApiToken` | Chrome extension bearer tokens | hashed token, scope, expiry, revocation, last-used tracking |
| `ReplyOpportunity` | Persisted reply-opportunity ranking and lifecycle | tweet snapshot JSON, heuristic score/tier, generated options, selected/copied/posted state |
| `FeedbackSubmission` | User-submitted bug/product feedback | category, status, title/message, `fields`, `context`, `attachments` JSON |
| `ProductEvent` | Analytics/event log | `eventType`, optional thread/message/candidate links, `properties` JSON |
| `RequestRateLimitBucket` | Database-backed rate limiting bucket | per-key rolling window counter |

### Billing models

| Model | Purpose | Key fields / notes |
| --- | --- | --- |
| `BillingEntitlement` | Current plan, credits, and Stripe linkage | plan/status/cycle, Stripe customer/subscription ids, fair-use flags |
| `CreditLedgerEntry` | Immutable credit ledger | grants, debits, refunds, adjustments, idempotency key |
| `StripeWebhookEvent` | Webhook idempotency/processing audit | raw payload JSON, status, error message |
| `LifetimeSlotReservation` | Reservation system for lifetime/founder-pass inventory | checkout session ID, status, expiry |

### How the user examples map to the actual schema

- **User** -> `User`
- **Profiles** -> `VoiceProfile` plus `User.activeXHandle`
- **Voice Guidelines** -> `VoiceProfile.styleCard` JSON
- **Post Drafts** -> `DraftCandidate.artifact` JSON and draft payloads stored in `ChatMessage.data`
- **Post history / source posts** -> `Post` and `ScrapeCaptureCache`
- **Conversation state** -> `ChatThread`, `ChatMessage`, `ConversationMemory`, `ChatTurnControl`

## 4. API Routes & Endpoints

There are **58 route handlers** under `apps/web/app/api`.

### Auth routes

| Path | Methods | Purpose |
| --- | --- | --- |
| `/api/auth/[...nextauth]` | `GET`, `POST` | Legacy stub route. Always returns 404 and is not part of the active auth flow. |
| `/api/auth/login` | `POST` | Email/password sign-in via Supabase; falls back to sign-up or OTP flow when needed; issues `sx_session`. |
| `/api/auth/email-code/request` | `POST` | Requests an email verification code from Supabase Auth. |
| `/api/auth/email-code/verify` | `POST` | Verifies the email code and issues the app session cookie. |
| `/api/auth/session` | `GET`, `PATCH` | Reads the current app session and updates `handle` / `activeXHandle`. |
| `/api/auth/logout` | `POST` | Clears the `sx_session` cookie. |

### Billing routes

| Path | Methods | Purpose |
| --- | --- | --- |
| `/api/billing/state` | `GET` | Reads local billing state and reconciles against Stripe checkout/session state when possible. |
| `/api/billing/checkout` | `POST` | Creates Stripe checkout sessions for monthly, annual, or lifetime offers. |
| `/api/billing/portal` | `POST` | Creates a Stripe customer portal session. |
| `/api/billing/ack-pricing-modal` | `POST` | Marks the first pricing modal as seen and returns updated billing state. |
| `/api/stripe/webhook` | `POST` | Stripe webhook ingestion and entitlement reconciliation. |

### Onboarding and X-ingestion routes

| Path | Methods | Purpose |
| --- | --- | --- |
| `/api/onboarding/preview` | `GET` | Lightweight profile preview for a handle before full onboarding. |
| `/api/onboarding/validate` | `POST` | Validates onboarding input payloads. |
| `/api/onboarding/run` | `POST` | Main authenticated onboarding pipeline: resolve data source, analyze profile/posts, persist run, sync posts, refresh style profile, maybe queue backfill. |
| `/api/onboarding/runs` | `GET` | Lists recent onboarding runs. |
| `/api/onboarding/scrape/import` | `POST` | Imports a raw scrape payload into the scrape capture store. |
| `/api/onboarding/scrape/latest` | `GET` | Fetches the latest cached scrape capture for an account. |
| `/api/onboarding/backfill/jobs` | `GET` | Reads queue summary or individual backfill job state. Session-auth or worker-auth. |
| `/api/onboarding/backfill/process` | `POST` | Worker-auth only. Processes the next onboarding backfill job. |

### Creator helper and legacy routes

| Path | Methods | Purpose |
| --- | --- | --- |
| `/api/creator/chat` | `POST` | Deprecated. Returns 410 and instructs callers to use `/api/creator/v2/chat`. |
| `/api/creator/context` | `POST` | Builds creator agent context from the latest onboarding run for the active handle. |
| `/api/creator/generation-contract` | `POST` | Builds a structured generation contract from onboarding/context data. |
| `/api/creator/evaluate` | `POST` | Runs evaluation logic over one onboarding run or a batch of recent runs. |
| `/api/performance/model` | `POST` | Builds a performance model from an onboarding run. |
| `/api/creator/profile` | `POST` | Builds a creator profile payload from an onboarding run. |
| `/api/creator/profile/handles` | `GET`, `POST` | Lists known handles for the user and updates the active handle. |
| `/api/creator/profile/scrape` | `POST` | Refreshes scrape data for the active handle, either manually or as a daily-login freshness probe. |
| `/api/creator/regression` | `POST` | Runs an onboarding-grounded regression suite for internal quality checks. |

### Main creator v2 routes

| Path | Methods | Purpose |
| --- | --- | --- |
| `/api/creator/v2/chat` | `POST` | Main AI chat orchestrator. Handles workflow routing, billing, memory, persistence, progress, and final response packaging. |
| `/api/creator/v2/chat/interrupt` | `POST` | Requests cancellation of a running or queued chat turn. |
| `/api/creator/v2/chat/turns/[turnId]` | `GET` | Reads turn-control status, progress, and completion/error state. |
| `/api/creator/v2/chat/media/[assetId]` | `GET` | Serves stored chat media bytes or preview bytes from the database. |
| `/api/creator/v2/chat/welcome` | `GET` | Generates the initial onboarding welcome response for the chat surface. |
| `/api/creator/v2/chat/image-turns` | `POST` | Handles image-based chat turns, including image upload, visual analysis, ideation, and confirmation flow. |
| `/api/creator/v2/threads` | `GET`, `POST` | Lists threads for the active workspace handle and creates new threads. |
| `/api/creator/v2/threads/[threadId]` | `GET`, `PATCH`, `DELETE` | Fetches thread history, renames a thread, or deletes a thread. |
| `/api/creator/v2/threads/[threadId]/messages/[messageId]` | `PATCH`, `DELETE` | Persists edited draft data back to a message or rewinds/deletes thread state from a message boundary. |
| `/api/creator/v2/threads/[threadId]/messages/[messageId]/feedback` | `POST`, `DELETE` | Saves or removes thumbs up/down feedback on assistant messages. |
| `/api/creator/v2/threads/[threadId]/draft-promotions` | `POST` | Promotes edited drafts into version history and can seed source materials from promoted drafts. |
| `/api/creator/v2/draft-candidates` | `GET`, `POST` | Lists draft candidates or auto-generates a draft queue using onboarding context and the runtime. |
| `/api/creator/v2/draft-candidates/[candidateId]` | `PATCH` | Approves, rejects, edits, posts, observes, or otherwise advances draft candidate lifecycle. |
| `/api/creator/v2/draft-analysis` | `POST` | AI analysis/compare of drafts. Also debits and refunds credits when monetization is enabled. |
| `/api/creator/v2/preferences` | `GET`, `PATCH` | Reads and updates per-handle writing preferences inside the style card. |
| `/api/creator/v2/source-materials` | `GET`, `POST` | Lists and creates source material assets used for grounding. |
| `/api/creator/v2/source-materials/[assetId]` | `PATCH`, `DELETE` | Updates or deletes source material assets. |
| `/api/creator/v2/source-materials/seed` | `POST` | Seeds source materials from onboarding examples and recent draft candidates. |
| `/api/creator/v2/profile-audit` | `PATCH` | Persists profile-audit state into the style card. |
| `/api/creator/v2/feedback` | `GET`, `POST`, `PATCH` | Lists, creates, and status-updates structured user feedback submissions. |
| `/api/creator/v2/product-events` | `POST` | Records product analytics/event rows. |
| `/api/creator/v2/banner-analysis` | `POST` | AI analysis of an uploaded X banner image. |
| `/api/creator/v2/image-posts` | `POST` | AI image-to-post generation. |
| `/api/creator/v2/scrape` | `POST` | Authenticated scrape/onboarding run for a target account in the current workspace flow. |

### Chrome extension routes

| Path | Methods | Purpose |
| --- | --- | --- |
| `/api/extension/token` | `POST` | Issues a bearer token for the companion Chrome extension. |
| `/api/extension/opportunity-batch` | `POST` | Receives candidate posts from the extension, ranks reply opportunities, persists them, and returns top picks. |
| `/api/extension/reply-options` | `POST` | Generates reply options for a persisted reply opportunity. |
| `/api/extension/reply-draft` | `POST` | Generates a reply draft payload and updates opportunity lifecycle state. |
| `/api/extension/reply-log` | `POST` | Records extension-side lifecycle events such as selected, copied, posted, dismissed, or observed. |

### Test and internal utility routes

| Path | Methods | Purpose |
| --- | --- | --- |
| `/api/test/session` | `POST` | Playwright-only auth bypass. Only active when `PLAYWRIGHT_AUTH_BYPASS=1`. |

### Routes most important to understand first

- **Main AI generation**: `/api/creator/v2/chat`
- **Image-assisted generation**: `/api/creator/v2/chat/image-turns`, `/api/creator/v2/banner-analysis`, `/api/creator/v2/image-posts`
- **Onboarding and X data**: `/api/onboarding/run`, `/api/creator/profile/scrape`, `/api/creator/v2/scrape`, `/api/onboarding/scrape/import`, `/api/onboarding/scrape/latest`
- **Chrome extension ingestion**: `/api/extension/opportunity-batch`, `/api/extension/reply-options`, `/api/extension/reply-draft`, `/api/extension/reply-log`
- **Billing control plane**: `/api/billing/state`, `/api/billing/checkout`, `/api/stripe/webhook`

## 5. Authentication Flow

### Actual auth architecture

- Identity provider: **Supabase Auth**
- App session mechanism: **custom JWT cookie**, not a NextAuth session
- Cookie name: `sx_session`
- Session signer/verifier: `jose`
- Session duration: 90 days

### End-to-end flow

1. The browser posts credentials to `/api/auth/login`.
2. The server calls Supabase Auth REST endpoints directly:
   - password sign-in via `/auth/v1/token?grant_type=password`
   - sign-up via `/auth/v1/signup`
   - OTP/email-code request via `/auth/v1/otp`
   - OTP verification via `/auth/v1/verify`
3. On successful auth, the server calls `ensureAppUserForAuthIdentity(...)`:
   - it upserts the local `User` row in Prisma
   - the local user ID is intended to mirror Supabase `auth.users.id`
   - it also contains a migration shim for legacy NextAuth-era rows that collide on email
4. The server signs a local JWT containing `userId` and `email`.
5. The JWT is stored in an `httpOnly`, `sameSite=lax` cookie named `sx_session`.
6. Subsequent server routes call `getServerSession()`:
   - read `sx_session`
   - verify JWT signature with `SESSION_SECRET`
   - load the actual user from Prisma
7. The client side uses `lib/auth/client.ts`, which is a small custom auth client:
   - `signIn()` posts to `/api/auth/login`
   - `signOut()` posts to `/api/auth/logout`
   - `useSession()` polls `/api/auth/session`
8. `/api/auth/session` also supports `PATCH` to update `handle` and `activeXHandle`.

### Important auth realities

- The app is **not** using NextAuth runtime flows anymore.
- `apps/web/.env.example` explicitly says `NEXTAUTH_*` variables are deprecated.
- `apps/web/app/api/auth/[...nextauth]/route.ts` is a dead stub that returns 404.
- The app does **not** keep or reuse a Supabase access token for general backend work. Supabase is mainly used as the identity source at login/OTP time; the app then relies on its own cookie session.

### Separate auth path for the Chrome extension

- The extension does **not** use the browser session cookie.
- Logged-in users call `/api/extension/token` to mint an `ExtensionApiToken`.
- Raw extension tokens are HMAC-hashed before storage.
- Extension requests authenticate with `Authorization: Bearer <token>`.
- The bearer token is verified against `ExtensionApiToken`, scope-checked, expiry-checked, and last-used timestamps are updated.

## 6. Current State (Working vs. TODO)

### Working / clearly implemented

- `apps/web` is a real, functioning single-app runtime with landing, login, onboarding, chat, pricing, extension connect, and legal pages.
- Prisma/Postgres is the real persistence layer, with migrations present for onboarding, chat, draft candidates, source materials, product events, extension growth loop, chat turn control, optimistic-lock memory, and chat media.
- Supabase-backed auth plus the custom `sx_session` cookie is implemented end to end.
- The main AI route `/api/creator/v2/chat` is not a stub. It has real normalization, billing checks, memory loading, runtime dispatch, persistence, progress tracking, cancellation, and duplicate-turn handling.
- The `lib/agent-v2` runtime is substantial and supports at least these workflows: `answer_question`, `ideate`, `plan_then_draft`, `revise_draft`, `reply_to_post`, and `analyze_post`.
- The chat workspace is feature-rich: thread history, draft editor, draft queue, feedback, preferences, source materials, growth guide, reply workflows, billing dialogs, and workspace-handle switching all have real code.
- There is a real background worker path: `pnpm -C apps/web run worker:background` processes queued chat turns and onboarding backfill jobs.
- Onboarding is real: profile preview, full run, scrape cache, post sync, style profile generation, and async backfill queue are all implemented.
- X/Twitter data ingestion paths are real: scrape-based capture with cookies/query IDs, X API bearer-token fallback, manual scrape payload import, and profile refresh/freshness probing are all implemented.
- Billing is real when enabled: checkout, portal, webhook reconciliation, entitlement state, credit ledger, fair-use flags, lifetime-slot reservation.
- Chrome extension backend is real: token issuance, opportunity ranking, reply options, reply drafts, lifecycle logging, and persisted `ReplyOpportunity` state.
- Security hardening is real: CSP + nonce middleware, extra security headers in `next.config.ts`, allowed-origin enforcement, DB-backed rate limiting, and worker-secret auth for internal job endpoints are all present.

### Partially implemented / conditional / sharp edges

- The repo still looks like a monorepo, but it is not an actively managed workspace. There is no `pnpm-workspace.yaml`, and the only real app is `apps/web`.
- `apps/api`, `packages/*`, `workers/*`, and `infra/` are empty placeholders. They communicate future architecture, not current runtime.
- NextAuth migration cleanup is incomplete: `next-auth` and `@auth/prisma-adapter` are still installed, `/api/auth/[...nextauth]` still exists, and active auth is now Supabase + custom cookie.
- Some installed dependencies appear to be leftover baggage rather than active runtime requirements: `next-auth`, `@auth/prisma-adapter`, and `bcryptjs`.
- Onboarding can still fall back to **mock data**: `ONBOARDING_MODE=mock` forces it, scrape/X API failures can degrade to mock in non-production-safe paths, and checked-in files under `db/` already contain mock-based onboarding results.
- Real X data quality depends heavily on env/config: scrape cookies, CSRF, bearer/query IDs, session state, or `X_API_BEARER_TOKEN`. If neither is healthy, mock fallback can mask the failure in non-prod-safe configurations.
- Billing is feature-flagged. If monetization is disabled, pricing UI and billing routes intentionally return 404/not found.
- Several features degrade gracefully if the latest migrations are missing: missing `RequestRateLimitBucket` makes rate limiting fail open, missing `ProductEvent` drops analytics events, missing `SourceMaterialAsset` makes source-material routes return empty lists or 503, missing `ChatTurnControl` can make chat infra return 503 and break recovery/cancellation, and missing `ChatMessageFeedback` causes feedback lookup to be skipped.
- The schema is flexible but operationally messy because so much behavior depends on JSON payloads rather than strongly typed relational tables.
- The biggest orchestration surfaces are still maintenance hotspots: `apps/web/app/chat/page.tsx` is about 2219 lines and `apps/web/app/api/creator/v2/chat/route.ts` is about 1247 lines.
- Some helper endpoints feel internal or only lightly productized: `/api/onboarding/runs`, `/api/performance/model`, `/api/creator/profile`, `/api/creator/evaluate`, and `/api/creator/regression`.

### Not built / not active / legacy-only

- `/api/creator/chat` is explicitly deprecated and returns HTTP 410.
- `/api/auth/[...nextauth]` returns HTTP 404 for both GET and POST.
- `apps/api` has no source files.
- `packages/`, `workers/`, and `infra/` have no source files.
- `apps/web/types` is empty.
- The root package is not a meaningful application package.

### Concrete TODO and migration debt I would flag to the next senior dev

- Remove or fully finish the old NextAuth migration path.
- Decide whether this repo is a real monorepo or a single app, then clean up the empty placeholder trees and duplicate root package metadata.
- Replace or constrain mock onboarding fallback more aggressively so real X-source failures are unmistakable.
- Reduce the amount of product-critical JSON state if reporting/queryability matters.
- Continue splitting down the two main integration hotspots: `app/chat/page.tsx` and `app/api/creator/v2/chat/route.ts`.
- Audit lightly protected or internal-looking helper routes before exposing them broadly.
- The only explicit active-code TODO I found in the main runtime was in `apps/web/lib/agent-v2/agents/critic.ts`, which still calls out future multi-dimensional draft scoring. The bigger debt is not missing TODO comments; it is architectural cleanup and production-hardening consistency.
