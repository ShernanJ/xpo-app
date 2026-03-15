# stanley-x-mvp

This repository currently ships a single Next.js application in `apps/web`. The app is an X creator assistant and growth workflow product with onboarding, chat-based AI orchestration, reply assistance, source-material grounding, billing, and a companion extension API.

This README documents the live implementation in the repo today. When the code and older planning docs disagree, treat the code in `apps/web` as the source of truth.

## Current State

- Active runtime: `apps/web`
- Primary stack: Next.js 16, React 19, TypeScript, Tailwind CSS 4
- Persistence: Prisma 7 on PostgreSQL
- Auth: Supabase identity plus a custom app session cookie
- AI runtime: Groq SDK for structured chat, planning, drafting, revision, reply, and analysis flows
- Billing: Stripe checkout, portal, webhooks, and local entitlement tracking
- Companion surfaces: browser extension APIs, onboarding APIs, creator chat APIs

Important repo note:

- The top-level `apps/api`, `packages/*`, `workers/*`, and `infra/` folders are currently empty placeholders, not the shipped runtime.
- The old root README described a planned multi-package architecture with Neon and Upstash workers. That is not the current implementation.

## What The App Does

The live app combines several product surfaces:

- Landing and onboarding for X account analysis and strategy bootstrapping
- A `/chat` workspace with multi-turn AI assistance for ideation, planning, drafting, revision, replies, and post analysis
- Source-material management for grounding outputs in user-provided facts, stories, and playbooks
- Billing and entitlement controls for free, Pro, and lifetime plans
- Companion extension APIs for reply opportunity ranking and reply draft workflows

## Repo Layout

The practical layout for engineers is:

```text
.
├── README.md
├── PLAN.md
├── Artifact.md
├── LIVE_AGENT.md
├── apps/
│   └── web/
│       ├── app/              # App Router pages and API routes
│       ├── components/       # Shared UI and providers
│       ├── lib/              # Domain logic: agent runtime, onboarding, billing, auth, extension
│       ├── prisma/           # Schema and migrations
│       ├── public/
│       ├── scripts/
│       ├── package.json
│       └── .env.example
└── docs/
    ├── app-architecture.md
    └── app-diagrams.md
```

The root package is not the app entrypoint. Develop from `apps/web`.

## Getting Started

1. Install dependencies for the app package:

   ```bash
   cd apps/web
   pnpm install
   ```

2. Copy the environment template:

   ```bash
   cp .env.example .env
   ```

3. Fill the minimum required values:

   - `DATABASE_URL`
   - `DATABASE_MIGRATION_URL`
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SESSION_SECRET`
   - `GROQ_API_KEY`

4. Start the app:

   ```bash
   pnpm dev
   ```

5. Open [http://localhost:3000](http://localhost:3000).

## Environment Groups

The canonical env template lives at [`apps/web/.env.example`](apps/web/.env.example).

The variables are grouped into these areas:

- Core app: database, Supabase, session secret
- AI provider: Groq API key and optional model override
- Public URLs and support email
- Monetization flags and pricing display values
- Stripe checkout and webhook configuration
- Onboarding source mode selection
- X scrape and X API credentials
- Onboarding backfill tuning
- Developer flags and script-only helpers

Operational notes:

- `NEXTAUTH_*` variables are marked deprecated in the env template.
- `ONBOARDING_MODE` controls whether onboarding uses scrape, X API, mock, or auto fallback.
- In production, mock onboarding fallback is intentionally guarded by `ONBOARDING_ALLOW_MOCK_FALLBACK`.

## Common Commands

Run these from `apps/web`:

```bash
pnpm dev
pnpm build
pnpm lint
pnpm test:ui
pnpm test:e2e
pnpm test:v2
pnpm test:extension
```

Additional useful scripts:

```bash
pnpm replay:creator-transcript
pnpm capture:user-tweets
pnpm scrape:user-tweets:http
```

## Architecture Overview

At a high level, the app works like this:

1. The browser UI submits structured chat or onboarding requests to Next.js route handlers in `apps/web/app/api`.
2. Route-boundary helpers normalize input, resolve workspace and auth state, and assemble domain context.
3. Domain logic in `apps/web/lib` handles AI orchestration, onboarding analysis, billing, extension workflows, and persistence policies.
4. Prisma writes chat threads, messages, memories, onboarding runs, source materials, billing state, extension tokens, and product events to PostgreSQL.
5. External services provide identity, billing, model inference, and X data access.

For the detailed audit and diagrams, see:

- [`docs/app-architecture.md`](docs/app-architecture.md)
- [`docs/app-diagrams.md`](docs/app-diagrams.md)

## Main Runtime Areas

### Frontend

- `apps/web/app/page.tsx`: landing entrypoint
- `apps/web/app/onboarding/*`: onboarding flow
- `apps/web/app/chat/page.tsx`: primary chat workspace
- `apps/web/app/chat/_features/*`: extracted chat feature state and UI
- `apps/web/app/pricing/*`, `apps/web/app/login/*`, `apps/web/app/extension/connect/*`: supporting product surfaces

### API

- `apps/web/app/api/auth/*`: auth login, session, logout, email code flows
- `apps/web/app/api/onboarding/*`: preview, run, validate, scrape, backfill
- `apps/web/app/api/creator/v2/*`: chat, threads, preferences, source materials, feedback, draft analysis/candidates
- `apps/web/app/api/billing/*` and `apps/web/app/api/stripe/webhook/route.ts`: checkout, portal, billing state, Stripe events
- `apps/web/app/api/extension/*`: extension token, opportunity batch, reply options, reply drafts, reply logs

### Domain Logic

- `apps/web/lib/agent-v2/*`: AI runtime, capabilities, validators, workers, memory, responses, grounding
- `apps/web/lib/onboarding/*`: data-source resolution, analysis, strategy, profile hydration, persistence, backfill
- `apps/web/lib/billing/*`: entitlements, policy, Stripe helpers, credit ledger logic
- `apps/web/lib/auth/*`: Supabase auth integration and custom session handling
- `apps/web/lib/extension/*`: token auth, reply opportunity logic, extension contracts

## Current Implementation Notes

- The shipped app is a single Next.js deployment boundary, not a live multi-service monorepo.
- The chat runtime is mid-migration toward cleaner runtime boundaries, and the supporting migration notes live in the docs below.
- A legacy NextAuth dependency and route exist in the repo, but the primary login/session flow is Supabase-backed with a custom cookie session.
- The current LLM gateway is the Groq SDK. The code also supports `openai/*` model identifiers through the same client path.

## Migration Reference Docs

These files are still useful, but they describe migration intent and target-state architecture more than the exact shipped runtime:

- [`PLAN.md`](PLAN.md)
- [`Artifact.md`](Artifact.md)
- [`LIVE_AGENT.md`](LIVE_AGENT.md)

Use them as architecture direction, not as a replacement for the live code audit in `docs/`.
