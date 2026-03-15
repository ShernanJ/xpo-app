# App Diagrams

These diagrams describe the live implementation in `apps/web`, not the older planned monorepo shape.

If a diagram here disagrees with a migration note in `PLAN.md`, `Artifact.md`, or `LIVE_AGENT.md`, interpret this file as the current-state runtime map and the migration docs as target-state direction.

## 1. System And Infrastructure Diagram

```mermaid
flowchart LR
  subgraph clients["Clients"]
    browser["Browser app\nlanding, onboarding, chat, pricing"]
    extension["Companion extension\nreply opportunities and drafts"]
  end

  subgraph nextapp["apps/web Next.js app"]
    app_router["App Router pages\npage.tsx, onboarding, chat, pricing, login"]

    subgraph api_routes["API route groups"]
      auth_api["/api/auth/*"]
      onboarding_api["/api/onboarding/*"]
      creator_api["/api/creator/* and /api/creator/v2/*"]
      billing_api["/api/billing/*"]
      stripe_api["/api/stripe/webhook"]
      extension_api["/api/extension/*"]
    end

    subgraph domain_libs["Domain libraries in apps/web/lib"]
      agent_runtime["agent-v2\nruntime, capabilities, validators, workers"]
      onboarding_lib["onboarding\nsources, analysis, strategy, pipeline, store"]
      billing_lib["billing\nentitlements, credits, Stripe helpers"]
      auth_lib["auth\nSupabase integration and session cookies"]
      extension_lib["extension\ntoken auth and reply workflow logic"]
      shared_libs["shared infra\nworkspace handle, product events, db"]
    end
  end

  subgraph data_layer["Persistence"]
    prisma["Prisma client"]
    postgres["PostgreSQL\nchat, memory, onboarding, billing, extension tables"]
    state_store["Optional scrape and backfill state\nPostgres-backed or file-backed"]
  end

  subgraph external["External services"]
    supabase["Supabase auth"]
    groq["Groq SDK\nstructured model calls"]
    stripe["Stripe\ncheckout, portal, webhooks"]
    x_scrape["X scrape source\nweb cookies and scrape state"]
    x_api["X API source\nbearer token fallback"]
  end

  browser --> app_router
  browser --> auth_api
  browser --> onboarding_api
  browser --> creator_api
  browser --> billing_api

  extension --> extension_api

  app_router --> creator_api
  app_router --> onboarding_api
  app_router --> billing_api

  auth_api --> auth_lib
  onboarding_api --> onboarding_lib
  creator_api --> agent_runtime
  creator_api --> onboarding_lib
  creator_api --> billing_lib
  creator_api --> shared_libs
  billing_api --> billing_lib
  stripe_api --> billing_lib
  extension_api --> extension_lib
  extension_api --> shared_libs

  auth_lib --> supabase
  agent_runtime --> groq
  billing_lib --> stripe
  onboarding_lib --> x_scrape
  onboarding_lib --> x_api

  shared_libs --> prisma
  agent_runtime --> prisma
  onboarding_lib --> prisma
  billing_lib --> prisma
  extension_lib --> prisma

  prisma --> postgres
  onboarding_lib --> state_store
```

What each section does:

- `Clients`: the browser UI and extension are the two entrypoints into the system.
- `apps/web Next.js app`: the single shipped application boundary for pages and API routes.
- `API route groups`: request-specific boundaries for auth, onboarding, creator workflows, billing, Stripe events, and extension traffic.
- `Domain libraries`: where the application logic actually lives today.
- `Persistence`: Prisma plus PostgreSQL hold the durable product state, while scrape/backfill state can be file- or DB-backed.
- `External services`: Supabase handles identity, Groq handles model calls, Stripe handles payments, and X sources feed onboarding data.

## 2. Application Module Map

```mermaid
flowchart TB
  subgraph ui["UI surfaces"]
    landing["app/page.tsx and onboarding UI"]
    chat_ui["app/chat/page.tsx and app/chat/_features/*"]
    pricing_ui["app/pricing/*"]
    login_ui["app/login/* and app/signin/*"]
    ext_connect["app/extension/connect/*"]
  end

  subgraph api["API groups"]
    auth_api["api/auth/*"]
    onboarding_api["api/onboarding/*"]
    creator_v1["api/creator/*"]
    creator_v2["api/creator/v2/*"]
    billing_api["api/billing/*"]
    extension_api["api/extension/*"]
    stripe_api["api/stripe/webhook"]
  end

  subgraph libs["apps/web/lib"]
    runtime["agent-v2\ncontracts, runtime, capabilities, workers, validators"]
    onboarding["onboarding\nanalysis, profile, pipeline, sources, strategy, store"]
    billing["billing"]
    auth["auth"]
    extension["extension"]
    creator["creator playbooks"]
    ui_lib["ui markdown and rendering helpers"]
    shared["db, workspace handle, product events, seo"]
  end

  subgraph storage["State"]
    db_state["Prisma and PostgreSQL"]
    external_state["Supabase, Stripe, Groq, X sources"]
  end

  landing --> onboarding_api
  login_ui --> auth_api
  pricing_ui --> billing_api
  ext_connect --> extension_api
  chat_ui --> creator_v2
  chat_ui --> onboarding_api
  chat_ui --> billing_api

  auth_api --> auth
  onboarding_api --> onboarding
  creator_v1 --> onboarding
  creator_v2 --> runtime
  creator_v2 --> onboarding
  creator_v2 --> billing
  creator_v2 --> creator
  creator_v2 --> shared
  billing_api --> billing
  extension_api --> extension
  stripe_api --> billing

  runtime --> onboarding
  runtime --> creator
  runtime --> ui_lib
  runtime --> shared
  onboarding --> shared
  billing --> shared
  extension --> shared
  auth --> shared

  runtime --> db_state
  onboarding --> db_state
  billing --> db_state
  extension --> db_state
  auth --> db_state

  auth --> external_state
  billing --> external_state
  runtime --> external_state
  onboarding --> external_state
```

What each section does:

- `UI surfaces`: page-level product entrypoints.
- `API groups`: route families that translate UI or extension requests into domain operations.
- `apps/web/lib`: the real application core, with most business logic concentrated inside the web package.
- `State`: durable internal state in PostgreSQL plus external system state from auth, billing, model, and X providers.

## 3. `lib/agent-v2` Internal Architecture

```mermaid
flowchart LR
  input["Route layer passes OrchestratorInput"]

  subgraph contracts["contracts"]
    chat_transport["chatTransport.ts\nclient request contract"]
    turn_contract["turnContract.ts\nturnSource, artifactContext,\nworkflow hints"]
    chat_contract["chat.ts\nmemory, plans, outputs,\nquick replies, surface mode"]
  end

  subgraph runtime["runtime control plane"]
    turn_context["turnContextBuilder.ts\nbuild TurnContext"]
    routing_policy["routingPolicy.ts\nfast reply path and routing trace"]
    runtime_action["resolveRuntimeAction.ts\npick exactly one workflow"]
    runtime_types["runtimeContracts.ts and types.ts\nworkflow, worker, validation,\nrouting trace contracts"]
    runtime_memory["memoryPolicy.ts\nturn-level memory writes"]
    runtime_response["responseEnvelope.ts and responseShaper.ts\nfinal response packaging"]
  end

  subgraph memory_grounding["state and grounding"]
    memory_layer["memory/*\nconversation state, summaries,\nscoped memory, context retrieval"]
    grounding_layer["grounding/*\nsource materials, no-fabrication,\ncreator hints, preferences"]
    core_layer["core/*\nstyle profile, retrieval,\nvoice target, novelty policy"]
  end

  subgraph workers["parallel worker plane"]
    hydration_workers["turnContextHydrationWorkers.ts\nstyle profile and anchors"]
    context_workers["contextLoadWorkers.ts\nstyle rules, facts, source materials"]
    history_workers["historicalTextWorkers.ts\nprior posts and drafts"]
    validation_workers["workers/validation/*\nand draft guard workers"]
  end

  subgraph execution["workflow execution"]
    draft_pipeline["orchestrator/draftPipeline.ts\ntransitional execution spine"]

    subgraph capabilities["capabilities"]
      ideation_cap["ideation/*"]
      planning_cap["planning/*"]
      drafting_cap["drafting/*"]
      revision_cap["revision/*"]
      reply_cap["reply/*"]
      analysis_cap["analysis/*"]
    end

    model_agents["agents/*\ncontroller, planner, writer,\ncritic, reviser, coach,\nextractors, llm gateway"]
    responses["responses/*\nquick replies, repairs,\nassistant reply shaping"]
  end

  input --> chat_transport
  input --> turn_contract
  input --> chat_contract
  chat_transport --> turn_context
  turn_contract --> turn_context
  chat_contract --> turn_context

  turn_context --> memory_layer
  turn_context --> core_layer
  turn_context --> hydration_workers
  hydration_workers --> core_layer
  core_layer --> turn_context

  turn_context --> routing_policy
  routing_policy --> runtime_action
  runtime_action --> runtime_types
  runtime_types --> draft_pipeline

  routing_policy --> draft_pipeline
  draft_pipeline --> context_workers
  draft_pipeline --> history_workers
  draft_pipeline --> validation_workers
  draft_pipeline --> grounding_layer
  draft_pipeline --> memory_layer

  context_workers --> capabilities
  history_workers --> capabilities
  validation_workers --> capabilities
  grounding_layer --> capabilities
  memory_layer --> capabilities

  capabilities --> model_agents
  model_agents --> capabilities
  capabilities --> responses
  responses --> runtime_memory
  runtime_memory --> runtime_response
```

What each section does:

- `contracts`: defines the types that make UI turns and runtime semantics explicit.
- `runtime control plane`: owns turn assembly, workflow choice, trace generation, memory write patterns, and response packaging.
- `state and grounding`: provides durable conversation state, creator profile context, retrieval, and factual guardrails.
- `parallel worker plane`: runs read-only support tasks after a workflow has already been selected.
- `orchestrator/draftPipeline.ts`: still acts as the transitional execution spine that bridges runtime selection into actual capability execution.
- `capabilities`: the real workflow owners for ideation, planning, drafting, revision, reply, and analysis.
- `agents/*`: model-facing specialist workers, not peer routers competing for control.
- `responses/*`: deterministic shaping and repair before the route sends data back to the client.

## 4. AI Orchestration Sequence For /api/creator/v2/chat

```mermaid
sequenceDiagram
  participant U as Browser chat UI
  participant T as chatTransport.ts
  participant R as POST /api/creator/v2/chat
  participant N as turnNormalization.ts
  participant P as routePreflight.ts
  participant M as runtime/conversationManager.ts
  participant RP as resolveRoutingPolicy.ts
  participant RA as resolveRuntimeAction.ts
  participant W as parallel context workers
  participant C as capability execution
  participant V as validators and retry
  participant S as routePersistence.ts
  participant DB as Prisma and PostgreSQL
  participant F as route response finalizers
  participant UI as chatReplyState.ts and thread state

  U->>T: submit message, thread, workspace, turnSource, artifactContext
  T->>R: JSON transport request
  R->>N: normalize raw request into NormalizedChatTurn
  N-->>R: explicit intent, workflow hints, artifact semantics
  R->>P: load thread, memory, onboarding, profile, preferences
  P->>DB: read thread, memory, runs, style data, user state
  DB-->>P: route context
  P-->>R: preflight context bundle
  R->>M: manageConversationTurnRaw(...)
  M->>RP: build turn context and routing trace
  RP->>RA: choose a single top-level workflow
  RA-->>RP: answer_question, ideate, plan_then_draft, revise_draft, reply_to_post, or analyze_post
  RP-->>M: routing policy and initial trace
  M->>W: load style rules, facts, source materials, historical text as needed
  W-->>M: worker outputs and execution metadata
  M->>C: run chosen capability path
  C->>V: validate delivery, apply constrained retry if needed
  V-->>M: final structured response plus validation trace
  M-->>R: raw response, memory updates, routing trace
  R->>S: persist assistant message, memory, thread, draft candidates
  S->>DB: sequential writes plus grouped draft persistence
  DB-->>S: ids and persisted state changes
  S-->>R: persistence trace patch
  R->>F: finalize main or reply response envelope
  F-->>T: API response payload
  T-->>UI: thread hydration, draft state, reply state, follow-up actions
```

What each section does:

- `chatTransport.ts`: turns client state into a structured transport request.
- `turnNormalization.ts`: gives raw UI input durable semantics before any runtime decision.
- `routePreflight.ts`: loads the state the runtime needs to make a good decision.
- `runtime/conversationManager.ts`: owns the turn-level orchestration and trace.
- `resolveRuntimeAction.ts`: chooses exactly one top-level workflow.
- `parallel context workers`: do read-only fan-out work such as extracting style rules or loading assets.
- `capability execution`: performs the actual answer, ideation, draft, revision, reply, or analysis path.
- `validators and retry`: enforce output quality before persistence.
- `routePersistence.ts`: writes durable state after the runtime result exists.
- `chatReplyState.ts and thread state`: convert the response into visible UI.

## 5. AI Agent Sequential Architecture

```mermaid
flowchart TD
  start["Incoming chat turn"] --> transport["Transport contract\nworkspaceHandle, threadId, clientTurnId, message,\nturnSource, artifactContext"]
  transport --> normalize["Sequential control plane 1\nnormalize request into NormalizedChatTurn"]
  normalize --> preflight["Sequential control plane 2\nresolve thread ownership, memory, onboarding context,\nstyle card, preferences, profile hints"]
  preflight --> choose["Sequential control plane 3\nresolve one workflow owner"]

  choose --> workflow["Chosen workflow\nanswer_question, ideate, plan_then_draft,\nrevise_draft, reply_to_post, analyze_post"]

  workflow --> worker_entry["Parallel worker plane opens only after workflow selection"]

  subgraph worker_plane["Parallel worker plane"]
    ctx["Context workers\nstyle rules, core facts, source materials"]
    history["Historical text workers\nposts and draft history"]
    validation_workers["Validation support workers\nconversation, revision, delivery checks"]
  end

  worker_entry --> ctx
  worker_entry --> history
  worker_entry --> validation_workers

  ctx --> capability["Capability execution plane\nplanner, ideator, writer, reviser, reply logic, analysis logic"]
  history --> capability
  validation_workers --> capability

  capability --> validate["Sequential control plane 4\nvalidate output and apply constrained retry if needed"]
  validate --> persist["Sequential control plane 5\npersist assistant message, memory, thread metadata,\ndraft candidates, product events"]
  persist --> respond["Sequential control plane 6\nfinalize response envelope for client"]
  respond --> ui["Client UI hydration\nthread history, draft editor, reply state, quick replies"]
```

What each section does:

- `Transport contract`: preserves explicit UI intent instead of forcing the model to infer everything from free text.
- `Sequential control plane 1-3`: convert, enrich, and classify the turn before any expensive or ambiguous workflow execution.
- `Chosen workflow`: the runtime must have exactly one owner for the turn.
- `Parallel worker plane`: fan-out is allowed only for read-only support work after workflow selection.
- `Capability execution plane`: the specialist logic for drafting, revising, replies, analysis, or direct answers.
- `Sequential control plane 4-6`: quality gates, durable writes, and response shaping happen in a single ordered path.
- `Client UI hydration`: the browser turns the server result into visible product state.

## 6. Onboarding Sequence Diagram

```mermaid
sequenceDiagram
  participant U as Browser onboarding UI
  participant O as POST /api/onboarding/run
  participant V as parseOnboardingInput and billing guards
  participant S as resolveOnboardingDataSource
  participant X as scrape source or X API source
  participant A as onboarding analysis pipeline
  participant P as onboarding run store
  participant DB as Prisma and PostgreSQL
  participant SP as generateStyleProfile
  participant B as backfill pipeline
  participant UI as onboarding response and chat bootstrap

  U->>O: submit account, goal, cadence, tone, time budget
  O->>V: validate payload and handle limits
  V-->>O: normalized onboarding input
  O->>S: resolve data source
  S->>X: scrape first, X API if configured, mock fallback if needed
  X-->>S: profile, posts, replies, quotes, warnings
  S-->>O: resolved data source payload
  O->>A: run onboarding pipeline service
  A->>A: compute baseline, growth stage, content distribution, hook patterns, strategy state, analysis confidence
  A-->>O: OnboardingResult
  O->>P: persist onboarding run
  P->>DB: write OnboardingRun
  O->>DB: sync posts and update user active handle
  O->>SP: regenerate voice style profile
  SP->>DB: write VoiceProfile
  O->>B: maybe enqueue deeper backfill
  B-->>O: backfill job metadata
  O-->>UI: runId, persistedAt, backfill status, onboarding result
```

What each section does:

- `POST /api/onboarding/run`: the request boundary for the main onboarding flow.
- `parseOnboardingInput and billing guards`: ensure the request is valid and allowed for the user’s plan.
- `resolveOnboardingDataSource`: decides whether the app should use scrape data, X API data, or mock fallback.
- `onboarding analysis pipeline`: turns raw posts and profile data into a growth model and strategy payload.
- `onboarding run store`: persists the canonical onboarding result for later chat grounding.
- `generateStyleProfile`: converts synced content into reusable voice/style memory for the AI runtime.
- `backfill pipeline`: optionally deepens the captured history after the initial onboarding result is returned.
