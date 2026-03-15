# App Architecture Audit

This document audits the live implementation in `apps/web`. It is intentionally grounded in the current route handlers, package config, env template, Prisma schema, and domain modules.

## Executive Summary

- The shipped product is a single Next.js App Router application in `apps/web`.
- The app combines onboarding, chat-based AI assistance, grounded drafting/revision, reply workflows, billing, and companion extension APIs.
- The active runtime relies on Prisma + PostgreSQL, Supabase identity plus a custom session cookie, Stripe billing, and the Groq SDK for model calls.
- The repository still contains top-level placeholder folders (`apps/api`, `packages/*`, `workers/*`, `infra/`), but they are empty and are not part of the current runtime.
- The root README that previously lived here described a planned architecture, not the implementation that is currently running.

## Product Surfaces

### User-facing pages

- `/`: landing page, currently routed through the onboarding landing experience
- `/onboarding`: onboarding flow for X handle analysis and initial strategy setup
- `/chat` and `/chat/[threadId]`: main AI workspace for chat, drafts, replies, source materials, analysis, and billing prompts
- `/login` and `/signin`: authentication entrypoints
- `/pricing`: monetization and plan selection
- `/extension/connect`: extension connection surface
- `/privacy`, `/terms`, `/refund-policy`: legal/support pages

### Chat workspace shape

The chat route is the densest client surface in the app:

- `apps/web/app/chat/page.tsx` is still large at about 3.7k lines
- Route-private feature folders now carry substantial state and presentation logic
- Feature slices include billing, composer, draft editor, draft queue, feedback, growth guide, preferences, source materials, analysis, thread history, workspace state, and workspace chrome

This means the app already moved away from a single-file chat page, but `/chat` is still the main orchestration-heavy UI boundary.

## Runtime Boundaries

### Frontend boundary

The primary frontend entrypoint is `apps/web/app/chat/page.tsx`.

Its responsibilities now include:

- wiring route state and workspace selection
- coordinating feature hooks under `app/chat/_features/*`
- submitting transport payloads
- consuming chat responses and hydrating UI state

Notable extracted helpers:

- `app/chat/_features/transport/chatTransport.ts`
- `app/chat/_features/reply/chatReplyState.ts`
- `app/chat/_features/thread-history/*`
- `app/chat/_features/draft-editor/*`
- `app/chat/_features/workspace/*`

### API boundary

The main AI route is `apps/web/app/api/creator/v2/chat/route.ts`.

Its live responsibilities include:

- auth and billing gate checks
- thread ownership and workspace resolution
- request JSON parsing and turn normalization
- route preflight for memory, onboarding context, profile hints, and thread state
- dispatch into the runtime conversation manager
- post-runtime persistence for assistant messages, memory updates, thread updates, and draft candidates
- response assembly for main chat and reply workflows

The route is supported by private helpers under:

- `_lib/normalization`
- `_lib/request`
- `_lib/control`
- `_lib/persistence`
- `_lib/main`
- `_lib/reply`
- `_lib/response`

### Domain boundary

Most of the business logic lives in `apps/web/lib`.

Primary domains:

- `lib/agent-v2`: AI runtime, workflows, validators, worker execution metadata, memory, response shaping, grounding
- `lib/onboarding`: X account capture, analysis, strategy generation, profile hydration, persistence, backfill
- `lib/billing`: entitlements, credit policy, Stripe API helpers, lifetime slot logic
- `lib/auth`: Supabase auth integration and app session handling
- `lib/extension`: extension token auth, reply opportunity ranking, reply-support endpoints

## API Surface Audit

### Auth

Auth routes live under `apps/web/app/api/auth/*`.

Current behavior:

- login and session flows use Supabase identity plus a custom app session cookie
- `apps/web/lib/auth/serverSession.ts` loads the signed session token and resolves the app user from Prisma
- the env template explicitly marks `NEXTAUTH_*` as deprecated

Audit note:

- a legacy NextAuth route and dependency still exist, but they do not appear to be the primary auth path

### Onboarding

Onboarding routes live under `apps/web/app/api/onboarding/*`.

Current behavior:

- validates onboarding input
- enforces per-user handle limits through billing policy
- resolves a source through scrape, X API, or mock fallback
- computes analysis and strategy artifacts
- persists the onboarding run
- syncs captured posts into Prisma
- regenerates the style profile
- optionally enqueues a backfill job
- updates the user’s active X handle

The core entrypoint is `apps/web/lib/onboarding/pipeline/service.ts`, backed by source resolvers in `lib/onboarding/sources/*`.

### Creator v2

The `apps/web/app/api/creator/v2/*` group is the main authenticated product API surface.

It includes:

- chat turn handling
- draft candidate routes
- draft analysis
- preferences
- feedback
- source materials
- threads
- scrape helpers
- product events

This API family is what the main chat workspace depends on.

### Billing

Billing routes live under `apps/web/app/api/billing/*` plus the Stripe webhook route.

Current behavior:

- checkout session creation
- Stripe customer/subscription lookup
- billing portal session creation
- local entitlement and credit state management
- webhook event ingestion and idempotent persistence

The app stores billing state in Prisma models rather than delegating plan state solely to Stripe.

### Extension

Extension routes live under `apps/web/app/api/extension/*`.

Current behavior:

- bearer-token authentication for the companion extension
- ranked reply opportunity batches
- reply option and reply draft generation
- reply logging
- extension token issuance

This surface shares the same persistence and product-event infrastructure as the main app, but uses a separate token auth mechanism.

## AI Runtime Audit

### Current control flow

The live AI runtime is centered on:

- `apps/web/app/api/creator/v2/chat/_lib/normalization/turnNormalization.ts`
- `apps/web/app/api/creator/v2/chat/_lib/request/routePreflight.ts`
- `apps/web/lib/agent-v2/runtime/conversationManager.ts`
- `apps/web/lib/agent-v2/runtime/resolveRuntimeAction.ts`
- `apps/web/lib/agent-v2/runtime/draftPipeline.ts`
- `apps/web/app/api/creator/v2/chat/_lib/persistence/routePersistence.ts`

The runtime currently supports these top-level workflows:

- `answer_question`
- `ideate`
- `plan_then_draft`
- `revise_draft`
- `reply_to_post`
- `analyze_post`

### What happens on a chat turn

1. The client sends structured transport data: message, thread, workspace handle, intent hints, `turnSource`, and optional `artifactContext`.
2. `turnNormalization.ts` converts the raw request into a normalized turn with workflow hints, artifact semantics, and reply-handling rules.
3. `routePreflight.ts` loads thread ownership, onboarding state, memory, style card, profile hints, preferences, and existing thread context.
4. `runtime/conversationManager.ts` builds turn context and resolves routing policy.
5. `resolveRuntimeAction.ts` chooses a single top-level workflow.
6. Parallel context workers may extract style rules, core facts, and source material assets before or during capability execution.
7. Capability execution runs through the draft pipeline and supporting capability modules.
8. Validators and retry helpers enforce structured output quality.
9. Route-boundary persistence writes assistant messages, memory changes, thread metadata, and draft candidates.
10. The client turns the response into thread history, draft state, reply state, and follow-up UI.

### Sequential vs parallel behavior

The runtime is intentionally split:

- sequential control plane for turn normalization, workflow choice, and persistence
- parallel worker plane for read-only context loading, retrieval, candidate generation, and validation support

Current evidence of the worker plane:

- `lib/agent-v2/workers/contextLoadWorkers.ts`
- `lib/agent-v2/workers/historicalTextWorkers.ts`
- `lib/agent-v2/workers/validation/*`

## Deep Dive: `apps/web/lib/agent-v2`

This is the most important and most confusing part of the app. The easiest way to understand it is to stop thinking of it as "one agent" and instead think of it as a layered runtime with a single turn coordinator plus several specialist capability modules.

### Mental model

The `agent-v2` stack is organized like this:

1. `contracts/` defines what comes in and out
2. `runtime/` decides how a turn should be handled
3. `workers/` do parallel read-only support work
4. `capabilities/` perform the selected workflow
5. `agents/` contain model-facing generators and extractors
6. `responses/` shape human-facing assistant output
7. `memory/` and persistence helpers keep durable conversation state coherent

That layering matters because the "agent" is not a single prompt. It is a multi-stage runtime that progressively turns raw UI input into a specific workflow, then into a grounded assistant response, then into persisted product state.

### Folder-by-folder guide

#### `contracts/`

This folder defines the transport and semantic contracts shared across the runtime.

Key responsibilities:

- `chatTransport.ts`: request shape from the client
- `turnContract.ts`: normalized turn semantics such as `turnSource`, `artifactContext`, and workflow hints
- `chat.ts`: chat output types, memory types, plans, quick replies, and surface-mode structures

Why it exists:

- the client and the runtime need a stable contract
- structured actions like draft selection and reply confirmation should not be reconstructed from vague free text

#### `runtime/`

This folder is the control plane. It is where turn-level ownership is established.

Key responsibilities:

- `conversationManager.ts`: top-level runtime coordinator for one chat turn
- `turnContextBuilder.ts`: loads and assembles the context needed for a turn
- `routingPolicy.ts`: applies routing policy and fast-reply logic
- `resolveRuntimeAction.ts`: picks exactly one workflow owner
- `runtimeContracts.ts`: workflow, worker, validation, and persistence trace types
- `runtimeTrace.ts`: summarizes worker execution and trace metadata
- `responseEnvelope.ts` and `responseShaper.ts`: finalize the assistant response envelope
- `memoryPolicy.ts`: centralizes turn-level memory write patterns
- `workerPlane.ts`: shared helpers for worker and validation metadata

Why it exists:

- this is where the app enforces sequential control before parallel fan-out
- it keeps workflow selection, traceability, and final response semantics in one place

#### `capabilities/`

This folder contains the workflow-specific executors. Each capability owns the logic for one type of user outcome.

Current capability groups:

- `analysis/`: post-analysis workflow
- `drafting/`: single-draft and bundle generation, grounded retry, output packaging
- `ideation/`: ideas menu generation
- `planning/`: planning mode, clarification, pending-plan handling, fast-start heuristics
- `reply/`: reply workflows, handled reply turns, reply planning/state
- `revision/`: edit/review flows, replanning, semantic repair on active drafts

Why it exists:

- once the runtime selects a workflow, the corresponding capability becomes the owner of the execution phase
- this prevents all product behavior from collapsing into one giant controller file

#### `agents/`

This folder contains model-facing primitives and smaller specialist generators.

Key examples:

- `controller.ts`: classifier/controller decision support
- `planner.ts`, `ideator.ts`, `writer.ts`, `reviser.ts`, `critic.ts`, `coach.ts`
- `styleExtractor.ts`, `factExtractor.ts`, `antiPatternExtractor.ts`
- `llm.ts`: Groq SDK JSON gateway

Important clarification:

- these are not top-level workflow routers
- they are specialist workers and generators used by runtime and capability code

#### `workers/`

This folder holds read-only support fan-out that can safely run in parallel.

Key examples:

- `turnContextHydrationWorkers.ts`: style profile + anchor retrieval
- `contextLoadWorkers.ts`: style rules, core facts, source material assets
- `historicalTextWorkers.ts`: prior posts and prior drafts
- `draftBundleCandidateWorkers.ts`: candidate fan-out for multi-draft generation
- `draftGuardValidationWorkers.ts` and `workers/validation/*`: output checks and validation helpers

Why it exists:

- the runtime can parallelize expensive support work without parallelizing workflow ownership or persistence

#### `grounding/`

This folder controls factual and stylistic grounding.

Key responsibilities:

- creator-profile hint shaping
- grounding packets
- source-material selection and serialization
- no-fabrication constraints
- draft and plan grounding policies
- user preference translation

Why it exists:

- it keeps "what the assistant is allowed to claim" separate from generic prompting and generic memory

#### `memory/`

This folder is the durable conversation-state layer.

Key responsibilities:

- loading and creating conversation memory records
- snapshotting stored memory into runtime-safe structures
- salience and scoped-memory logic
- rolling summary support
- retrieval of relevant prior context

What this memory actually tracks:

- conversation state such as collecting context, plan pending approval, draft ready, or editing
- active constraints
- pending plan
- active draft reference
- clarification state
- active reply context
- reply option selection state
- preferred surface mode

This is product state, not just raw transcript storage.

#### `responses/`

This folder shapes the assistant output after capabilities generate raw material.

Key responsibilities:

- conversational fast replies
- planner and ideation quick replies
- draft reply packaging
- correction repair and constraint acknowledgment
- feedback memory notices

Why it exists:

- the model output is not always the final user-facing response
- the app adds deterministic shaping, messaging, and repair behavior before the client receives it

#### `core/`

This folder contains reusable business rules and deterministic policy modules.

Key responsibilities:

- style profile generation
- retrieval logic
- novelty gates
- plan pitch normalization
- preference constraints
- voice target resolution

Why it exists:

- this is the stable policy layer that capability modules can reuse

#### `runtime/`

This folder is the control-plane home.

What is here:

- `conversationManager.ts`: the runtime entrypoint that assembles turn context, routing, traces, and execution dispatch
- `draftPipeline.ts`: the execution spine that bridges runtime decisions into capability execution
- supporting runtime policy/helpers such as `turnContextBuilder.ts`, `routingPolicy.ts`, `workerPlane.ts`, and `responseEnvelope.ts`

Why it is clearer now:

- runtime-owned control flow lives in one place instead of being split across a transitional `orchestrator/` folder
- capability-specific logic now lives next to the workflow that owns it

Practical rule:

- if you want to understand turn ownership, start in `runtime/`
- if you want to understand workflow branching after selection, read `runtime/draftPipeline.ts`

### Internal execution sequence inside `lib/agent-v2`

The internal turn sequence is roughly:

1. Accept `OrchestratorInput`
2. Build `TurnContext` in `runtime/turnContextBuilder.ts`
3. Load or create persisted memory
4. Scope memory to the current turn
5. Hydrate turn context with style profile and anchor retrieval workers
6. Resolve routing policy in `runtime/routingPolicy.ts`
7. Resolve one runtime workflow in `runtime/resolveRuntimeAction.ts`
8. Enter `runtime/draftPipeline.ts`
9. Run additional workers for facts, rules, source materials, historical text, draft validation, or bundle generation
10. Delegate to the chosen capability module
11. Merge worker and validation metadata into the routing trace
12. Save turn memory through runtime memory policy
13. Return a raw runtime response and routing trace to the route layer

### Capability ownership matrix

Use this as a shortcut when you are lost in the code:

- User just wants an answer:
  - runtime workflow: `answer_question`
  - main code path: `runtime/routingPolicy.ts` fast reply or conversational response helpers
- User wants ideas:
  - runtime workflow: `ideate`
  - main code path: `capabilities/ideation/ideationCapability.ts`
- User wants a plan or a first draft:
  - runtime workflow: `plan_then_draft`
  - main code path: `capabilities/planning/*` and `capabilities/drafting/*`
- User wants to edit or review an existing draft:
  - runtime workflow: `revise_draft`
  - main code path: `capabilities/revision/*`
- User is in a reply workflow:
  - runtime workflow: `reply_to_post`
  - main code path: `capabilities/reply/*`
- User wants analysis:
  - runtime workflow: `analyze_post`
  - main code path: `capabilities/analysis/*`

### Why this folder feels confusing

The confusion mostly comes from five overlapping ideas:

- the word "agent" is used for both the whole system and the model-facing helpers
- `runtime/` is the control-plane home, and `runtime/draftPipeline.ts` owns the remaining shared execution flow
- `capabilities/` are the real workflow owners, but some supporting logic still lives in neighboring folders
- `memory/`, `grounding/`, and `responses/` all influence the final answer, so it can be hard to tell which layer is responsible for what
- routing traces, worker traces, and validation traces make the flow richer, but they add more types and more movement between modules

The simplest reading order is:

1. `contracts/chatTransport.ts`
2. `contracts/turnContract.ts`
3. `runtime/turnContextBuilder.ts`
4. `runtime/routingPolicy.ts`
5. `runtime/resolveRuntimeAction.ts`
6. `runtime/draftPipeline.ts`
7. the relevant folder under `capabilities/`

### Important live types to know

These types are the quickest way to understand the runtime shape:

- `OrchestratorInput`: what the runtime receives
- `TurnContext`: the fully hydrated per-turn execution context
- `RoutingTrace`: the turn-by-turn diagnostic story
- `AgentRuntimeWorkflow`: the single selected workflow owner
- `CapabilityExecutionRequest` and `CapabilityExecutionResult`: execution contracts for specialized workflows

### Current structural watchlist

The top-level folder cleanup is landed, but a few files are still the main places where complexity can re-accumulate:

- `apps/web/lib/agent-v2/runtime/draftPipeline.ts`
  - still the shared execution spine after workflow resolution
  - keep new workflow-local behavior in `capabilities/*`, `responses/*`, `grounding/*`, or `workers/*` unless it is truly cross-workflow runtime logic
- `apps/web/lib/agent-v2/grounding/sourceMaterials.ts`
  - currently the heaviest grounding file
  - likely future split point if source-material selection and shaping continue to expand
- `apps/web/lib/agent-v2/capabilities/reply/replyContinuationPlanner.ts`
  - large but correctly placed reply continuity surface
  - likely future split point inside `capabilities/reply/` if reply state handling grows again
- `apps/web/lib/agent-v2/responses/correctionRepair.ts`
  - large deterministic response helper
  - should stay in `responses/`, but should not become a generic post-processing catch-all

Large test files such as `runtime/conversationManager.test.mjs` and `responseQuality.test.mjs` are broad on purpose and are not the same kind of structural risk.
- `RuntimeWorkerExecution`: metadata for worker-plane activity
- `RuntimeValidationResult`: metadata for validation and retry behavior

If you are debugging a confusing turn, these types are often more useful than reading prompts first.

### LLM integration

The active LLM gateway is `apps/web/lib/agent-v2/agents/llm.ts`.

Current behavior:

- model requests go through the Groq SDK
- Groq-native models request JSON output directly
- `openai/*` model identifiers are also supported through the same client path
- the runtime includes retry handling for empty JSON content on OpenAI-style models

## Onboarding Pipeline Audit

The onboarding pipeline is synchronous request handling plus optional deferred backfill.

Main stages:

1. Parse input and validate account shape
2. Enforce billing-based handle limits
3. Resolve the data source:
   - scrape
   - X API
   - mock fallback
4. Compute post analysis:
   - engagement baseline
   - content distribution
   - hook patterns
   - growth stage
   - analysis confidence
5. Build strategy state and contextual artifacts
6. Persist the onboarding run
7. Sync posts into Prisma for later retrieval and style profiling
8. Regenerate the user style profile
9. Enqueue a background backfill job when deeper history is recommended

Storage used by onboarding:

- `OnboardingRun`
- `Post`
- `VoiceProfile`
- `ScrapeCaptureCache`
- file-backed or Postgres-backed scrape/backfill state depending on env configuration

Audit note:

- onboarding currently behaves more like app-managed workflow processing than an external worker queue architecture

## Data Model Audit

The Prisma schema is the main persistence contract for the live app.

### Identity and workspace

- `User`
- `ChatThread`
- `ChatMessage`
- `ChatMessageFeedback`
- `ConversationMemory`

### Onboarding and creator state

- `OnboardingRun`
- `Post`
- `VoiceProfile`
- `SourceMaterialAsset`
- `DraftCandidate`
- `FeedbackSubmission`

### Extension and reply workflows

- `ExtensionApiToken`
- `ReplyOpportunity`

### Billing and payments

- `BillingEntitlement`
- `CreditLedgerEntry`
- `StripeWebhookEvent`
- `LifetimeSlotReservation`

### Operational support

- `ProductEvent`
- `ScrapeCaptureCache`

## External Integrations

### Supabase

Used for:

- user identity and auth flows
- email/password or code-based login support

The app still keeps its own user row and signed session token after auth succeeds.

### Stripe

Used for:

- checkout sessions
- customer lookup
- billing portal
- webhook event ingestion

The app mirrors entitlement state locally in Prisma.

### Groq

Used for:

- structured model inference across planning, drafting, critique, revision, reply, and analysis

### X data access

Used for:

- onboarding scrape source
- optional X API source
- extension reply context workflows

## Audit Findings

### 1. Documentation drift is significant

The old root README described a planned multi-package system with `apps/api`, `packages/*`, `workers/*`, Neon, and Upstash queues. The live app is a single `apps/web` deployment boundary, and those top-level folders are empty placeholders today.

### 2. Current auth implementation differs from legacy naming

The live login/session flow is Supabase plus a custom signed session cookie. NextAuth still appears in the dependency tree and a legacy route exists, but the env template and active routes indicate that NextAuth is not the primary runtime path.

### 3. Migration docs are useful but not a current-state source of truth

`PLAN.md`, `Artifact.md`, and `LIVE_AGENT.md` are valuable architecture references, but they mix shipped behavior with target-state migration language. Engineers need a separate current-state audit, which is the purpose of this document and the companion diagrams.

### 4. The main orchestration hotspots are still large

Current rough sizes in the live workspace:

- `app/chat/page.tsx`: about 3718 lines
- `app/api/creator/v2/chat/route.ts`: about 378 lines
- `lib/agent-v2/runtime/conversationManager.ts`: about 478 lines
- `lib/onboarding/pipeline/service.ts`: about 290 lines

These are manageable, but they remain the highest-value files to watch when reasoning about architecture changes.

### 5. The runtime is centralized inside `apps/web/lib`

Despite older monorepo planning, the actual app keeps most business logic inside the Next.js package:

- AI runtime
- onboarding pipeline
- billing rules
- auth/session logic
- extension workflows

That makes `apps/web/lib` the real application core today.

## Practical Guidance For Engineers

- Treat `apps/web` as the application boundary.
- Use the route-private `_features` and `_lib` folders before growing top-level route files.
- Use the runtime and onboarding docs in this `docs/` folder when you need current behavior.
- Use `PLAN.md`, `Artifact.md`, and `LIVE_AGENT.md` for migration intent and target architecture.
