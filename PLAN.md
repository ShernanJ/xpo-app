# Agent Runtime vNext: Sequential Control Plane, Parallel Worker Plane

## Summary
Adopt a **sequential agent design at the control plane** and **parallel execution only inside a chosen workflow**. For Xpo, this is the long-term good-practice architecture: one authoritative runtime decides what kind of turn this is, one owner mutates memory/artifacts/persistence, and parallel workers are only used for independent retrieval, candidate generation, scoring, and validation after workflow selection is already fixed.

This plan keeps `PLAN.md` as the canonical target-state architecture spec, while [Artifact.md](Artifact.md) and [LIVE_AGENT.md](LIVE_AGENT.md) track migration status and operator reality against the codebase.

Target control-plane order:
- Transport contract
- Turn normalization
- Runtime action resolution
- Workflow dispatch
- Persistence
- Response envelope

Transitional note:
- Current code still finalizes/shapes the orchestrator response before route persistence and thread updates. That ordering is migration debt, not the desired steady state.

Current active slice:
- Phase 5 validation and retry is now landed across draft, revision, reply, and analysis on top of the landed backend/lib and API folder cleanup
- Immediate follow-on: continue deleting compatibility shims only after imports are fully migrated and keep reply-path trace unification explicit migration debt until direct reply-preflight shares the common runtime entry
- Frontend architecture track: route-private folders, shared UI primitives, and a dedicated frontend test stack
- Backend/lib architecture track: landed domain-first folders, thin orchestration entrypoints, and explicit seams between contracts, control flow, workers, validators, and infra
- API architecture track: landed thin route entrypoints, route-boundary helpers, and feature-owned route-private folders

## Status language
- `target architecture` means the intended end state.
- `landed` means already true in code today.
- `migration debt` means transitional behavior that still exists and should be removed later.

## Core Design Decisions
- Use **Sequential Control, Parallel Workers** as the official runtime pattern.
- Keep exactly one top-level workflow owner per turn:
  - `answer_question`
  - `ideate`
  - `plan_then_draft`
  - `revise_draft`
  - `reply_to_post`
  - `analyze_post`
- Do not let multiple agents or heuristics compete to classify the same raw turn in parallel.
- Use parallelism only for work that is:
  - read-only
  - side-effect free
  - mergeable without ambiguity
- Treat planner, writer, critic, reviser, reply generation, retrieval, and validators as **capability workers**, not peer routers.
- Require all state mutation to flow through the sequential runtime path:
  - memory updates
  - active draft/reply context
  - artifact persistence
  - thread metadata
  - product-event logging

## Frontend Architecture Track
- Keep App Router route roots thin: only route entry files stay at the route root; route-local implementation moves into private folders.
- Organize frontend code by feature slice first, not by one flat route folder.
- Shared primitives live in `apps/web/components/ui`; route-specific state and UI stay inside the route unless they are truly reused.
- Frontend work in this program must use `vercel-react-best-practices`, `vercel-composition-patterns`, and `web-design-guidelines`.
- Frontend testing is now split by layer:
  - pure state modules stay on `node:test`
  - synchronous client components use Vitest + React Testing Library
  - route behavior uses Playwright

## Backend/Lib Architecture Track
- Keep `apps/web/lib` organized by domain first, not by one large shared utility layer.
- Inside each domain, separate stable contracts and pure logic from orchestration and infra concerns.
- For `apps/web/lib/agent-v2`, the long-term target is:
  - `contracts/`: transport and API-facing contracts only
  - `runtime/`: workflow resolution, runtime trace, and shared execution contracts
  - `core/`: pure business rules and reusable policy logic
  - `capabilities/`: workflow-sliced execution modules such as draft, revision, reply, analysis, ideation, and planning
  - `workers/`: read-only parallel worker helpers
  - `validators/`: deterministic validation and retry helpers
  - `memory/`: memory retrieval, salience, and summary management
  - `agents/`: model-facing prompt builders and worker implementations
- The old `orchestrator/` folder has been dissolved; `runtime/` is now the control-plane home and should stay narrow.
- `apps/web/lib/onboarding` now has the same domain-first target, and the active migration surface is landed into:
  - `profile/`
  - `analysis/`
  - `strategy/`
  - `pipeline/`
  - `contracts/`
  - `shared/`
  - `store/`
  - `sources/`
- Backend migrations should prefer seam extraction and import redirection first, then directory moves once ownership is clear.
- Avoid repo-wide folder churn during active behavior slices unless the touched area already needs extraction for correctness or testability.
- Concrete target map for `apps/web/lib/agent-v2`:
  - `contracts/`
    - transport and shared external contracts such as `chatTransport.ts`, `chat.ts`, and `turnContract.ts`
  - `runtime/`
    - workflow resolution, runtime trace, and shared execution contracts such as `resolveRuntimeAction.ts`, `runtimeContracts.ts`, and `runtimeTrace.ts`
  - `core/`
    - pure reusable policy modules such as novelty, planner normalization, draft policy, retrieval, and style-profile logic
  - `memory/`
    - retrieval, salience, summary, and turn-scoped memory modules
  - `agents/`
    - model-facing workers, prompt builders, and structured prompt contracts
  - `capabilities/ideation/`
    - ideation execution plus ideation-only reply and quick-reply helpers
  - `capabilities/planning/`
    - planning execution plus planner feedback, quick replies, and plan-presentation helpers
  - `capabilities/drafting/`
    - drafting execution, bundle generation, replanning-to-draft continuation, draft grounding, draft helpers, and the eventual slimmed-down draft workflow composition module
  - `capabilities/revision/`
    - revising execution plus revision-only helper logic
  - `capabilities/reply/`
    - reply execution, reply continuation planning, reply turn logic, and reply turn planning
  - `capabilities/analysis/`
    - analysis execution and analysis-only helpers
  - `workers/context/`
    - context and hydration fan-out helpers
  - `workers/retrieval/`
    - read-only retrieval fan-out helpers
  - `workers/candidates/`
    - candidate-generation fan-out helpers
  - `workers/validation/`
    - worker-plane validation fan-out helpers
  - `validators/draft/`, `validators/revision/`, and `validators/shared/`
    - deterministic validators and retry-constraint builders
- Current-file mapping rule:
  - when touching `apps/web/lib/agent-v2/runtime/*`, prefer extracting into one of the target folders above instead of growing `runtime/` into a new catch-all unless the file is still truly control-plane composition
  - when touching `apps/web/lib/onboarding/*`, prefer adding code in the landed domain folders above instead of re-growing the flat onboarding root

## API Architecture Track
- Keep `apps/web/app/api` route roots thin: route entry files should primarily handle auth, ownership, input normalization, runtime dispatch, persistence orchestration, and response assembly.
- Move route-local implementation into focused route-boundary helpers or route-private folders instead of growing large `route.ts` files.
- For complex route areas such as `apps/web/app/api/creator/v2/chat`, the long-term target is:
  - `route.ts`: entrypoint only
  - `_lib/normalization/turnNormalization.ts`: transport-to-runtime conversion only
  - `_lib/persistence/routePersistence.ts`: persistence boundary only
  - `_lib/response/routeResponse.ts`: response-envelope assembly only
  - `_lib/*` helpers or route-private folders for feature-local boundary logic that should not leak into `apps/web/lib`
- Route modules should not become an alternate home for workflow policy, validator policy, or capability logic that belongs in `apps/web/lib`.
- API migrations should follow the same rule as backend/lib migrations:
  - extract seams first
  - move files second
  - keep changes incremental and test-backed
- Concrete target map for `apps/web/app/api/creator/v2/chat`:
  - route root:
    - `route.ts`
    - `welcome/route.ts`
  - `_lib/normalization/`
    - `turnNormalization.ts` and normalization-only helpers
  - `_lib/request/`
    - idempotency, request assembly, and route-only request helpers such as `routeIdempotency.ts` and `routeLogic.ts` when the seam is truly API-boundary-only
  - `_lib/persistence/`
    - `routePersistence.ts` plus route-only persistence helpers
  - `_lib/response/`
    - `routeResponse.ts` plus success and error envelope helpers
  - `_lib/reply/`
    - `routeReplyFinalize.ts` and reply-only route-boundary wiring
  - `_tests/`
    - route-focused integration and boundary tests when root-level route test files stop scaling
- Current-file mapping rule:
  - new code in `apps/web/app/api/creator/v2/chat/route.ts` should stay limited to entrypoint control flow; feature-local route work should land in `_lib/*` instead of expanding the route file

## Documentation Rework
### `Artifact.md`
Rewrite it as the **program board** for the migration:
- front section: architecture principles, current hotspots, why the rework exists
- one explicit section for the design pattern:
  - sequential control plane
  - parallel worker plane
  - forbidden concurrency patterns
- shared terminology section for runtime contracts and normalized-turn fields
- phase board with status, acceptance gates, and blockers
- active risks section focused on structural risks, not symptom history
- short historical appendix only for already-landed behavior that must not regress

### `LIVE_AGENT.md`
Rewrite it as the **operator handoff** for engineers/agents:
- current transitional runtime flow and target control-plane ownership
- current runtime map and ownership boundaries
- explicit concurrency rules:
  - what may run in parallel
  - what must remain sequential
- workflow invariants
- capability inventory and capability contract pointers
- manual QA checklist
- "do not regress" rules
- debugging guidance:
  - where to inspect normalization
  - where to inspect runtime resolution and runtime traces
  - where to inspect validation failures
  - when legacy routing paths are still relevant migration debt

## Architecture Implementation Changes
### Phase 1: Lock the control plane
- Make the runtime resolver the only workflow authority.
- Collapse remaining route/controller/turn-plan/pipeline reclassification into one runtime decision path.
- Keep `turnNormalization` as the only place that converts transport input into runtime-ready turn context.
- Expand runtime trace to always record:
  - normalized turn
  - runtime workflow
  - resolution source
  - reply bypass reason
  - worker execution summary
  - validation results
- Persisted-state tracing now lands through route-boundary helpers:
  - `apps/web/lib/agent-v2/orchestrator/conversationManager.ts` now returns raw response payloads plus the in-memory `routingTrace`, and only `manageConversationTurn()` re-serializes that trace when diagnostics explicitly request it
  - `apps/web/app/api/creator/v2/chat/_lib/persistence/routePersistence.ts` now returns a `RuntimePersistenceTracePatch` containing persistence-phase worker executions plus `persistedStateChanges`
  - persistence workers are standardized as:
    - `persist_assistant_message`
    - `update_conversation_memory`
    - `update_chat_thread`
    - `create_draft_candidate`
  - `apps/web/app/api/creator/v2/chat/route.ts` now merges that persistence patch after sequential writes complete and only exposes the full trace through `buildChatSuccessResponse()` when diagnostics are enabled
  - `apps/web/app/api/creator/v2/chat/_lib/reply/routeReplyFinalize.ts` now reuses the same persistence patch merge when an upstream runtime trace already exists
- Remaining follow-on:
  - direct reply-preflight turns still do not synthesize a fake end-to-end runtime trace, so reply-path trace unification remains migration debt
  - current code still shapes the orchestrator response before persistence/thread updates, so response-before-persistence ordering remains migration debt even though trace coverage now spans those writes

### Phase 2: Thin the client and route
- Landed during migration:
  - `apps/web/app/api/creator/v2/chat/route.ts` now owns final response-envelope finalization for the main chat path.
  - post-orchestrator response mapping and persistence prep live in route-boundary helpers instead of being fully hand-assembled inline in the route.
  - sequential assistant-message persistence, memory/thread updates, and draft-candidate writes now run through a dedicated route-boundary helper in `apps/web/app/api/creator/v2/chat/_lib/persistence/routePersistence.ts`.
  - reply-turn response assembly, product-event planning, and final success-response packaging now flow through `apps/web/app/api/creator/v2/chat/_lib/response/routeResponse.ts` instead of being assembled inline in `route.ts`.
  - `apps/web/app/chat/page.tsx` now delegates turn-resolution and transport payload construction to `apps/web/app/chat/_features/transport/chatTransport.ts` instead of building the chat request inline.
- `apps/web/app/chat/page.tsx` now delegates chat result parsing, assistant-message assembly, draft-editor follow-up selection, reply outcome planning, and thread remap planning through `apps/web/app/chat/_features/reply/chatReplyState.ts`.
- `apps/web/app/chat/page.tsx` now delegates page-local client seams through dedicated helpers/modules:
  - workspace/session/composer lifecycle:
    - `apps/web/app/chat/_features/workspace/chatWorkspaceState.ts`
    - `apps/web/app/chat/_features/composer/chatComposerState.ts`
    - `apps/web/app/chat/_features/workspace/chatWorkspaceLoadState.ts`
  - draft editor/session/persistence/preview/action/history:
    - `apps/web/app/chat/_features/draft-editor/chatDraftEditorState.ts`
    - `apps/web/app/chat/_features/draft-editor/chatDraftSessionState.ts`
    - `apps/web/app/chat/_features/draft-editor/chatDraftPersistenceState.ts`
    - `apps/web/app/chat/_features/draft-editor/chatDraftPreviewState.ts`
    - `apps/web/app/chat/_features/draft-editor/chatDraftActionState.ts`
    - `apps/web/app/chat/_features/thread-history/chatThreadHistoryState.ts`
  - presentational preview surface:
    - `apps/web/app/chat/_features/draft-editor/chatDraftPreviewCard.tsx`
- The current client-thinning pass also includes UI-practice cleanup without changing transport/runtime ownership:
  - `apps/web/app/chat/_features/thread-history/ChatMessageRow.tsx`
  - `apps/web/app/chat/_features/draft-editor/DraftEditorDock.tsx`
  - `apps/web/components/ui/dialog.tsx`
  - `apps/web/app/pricing/_components/BillingCadenceToggle.tsx`
  - `apps/web/app/chat/_dialogs/ObservedMetricsModal.tsx`
  - `apps/web/app/login/_components/LoginForm.tsx`
- Route-local folder convention is now part of the frontend target state:
  - `apps/web/app/chat/_features/*`
  - `apps/web/app/chat/_dialogs/*`
  - `apps/web/app/chat/_components/*`
  - `apps/web/app/pricing/_components/*`
  - `apps/web/app/login/_components/*`
- Frontend test stack is now part of Phase 2 instead of deferred architecture debt:
  - `pnpm run test:ui`
  - `pnpm run test:e2e`
- For frontend work in this slice, agents should explicitly use:
  - `vercel-react-best-practices`
  - `vercel-composition-patterns`
  - `web-design-guidelines`
- Residual client debt in `page.tsx` is now mostly async orchestration and large presentation surfaces rather than duplicated state math; that is accepted migration debt after the Phase 2 boundary cleanup.
- `apps/web/app/chat/page.tsx` has now been reduced to roughly 5.7k lines by pushing thread-history, source-materials, preferences, growth-guide, and analysis seams into route-private features; follow-on frontend work should extend those feature seams instead of re-growing the route root.
- Current frontend verification note: chat-page-specific extraction regressions are fixed, and remaining full TypeScript failures sit outside `apps/web/app/chat/page.tsx`.
- Guardrail: keep semantic interaction, accessibility, and extracted UI primitives moving outward from `page.tsx`; do not re-inline them during visual tweaks.
- Composer guardrail: keep `/chat` composer interactivity and submit gating separate. Empty input may disable send, but it must not disable the textarea or hero quick-action chips, and the dock composer must stay hidden until the hero exit transition completes.
- Reduce the chat route to:
  - auth
  - workspace/thread ownership
  - normalization
  - runtime dispatch
  - persistence
  - response envelope
- Keep workflow signals in structured transport and eliminate hidden prompt-based routing if found.
- Route-structure follow-on for this phase:
  - use focused route-boundary helpers or route-private folders when a route starts mixing entrypoint logic with feature-local implementation
  - do not let `route.ts` become a catch-all for reply planning, persistence patching, validation policy, or product-event shaping when those seams can be isolated cleanly

### Phase 3: Split capability execution
- Shared executor contract is partially landed already in `apps/web/lib/agent-v2/runtime/runtimeContracts.ts`; the remaining work is moving capability execution onto it cleanly.
- Landed during migration:
  - ideation now runs through `apps/web/lib/agent-v2/orchestrator/ideationExecutor.ts` using `CapabilityExecutionRequest` / `CapabilityExecutionResult`, with `draftPipeline.ts` applying the returned memory patch and worker trace metadata.
  - initial plan generation and plan-presentation seeding now run through `apps/web/lib/agent-v2/orchestrator/planningExecutor.ts`, with `draftPipeline.ts` consuming the returned plan payload, memory patch, and worker trace metadata before any draft handoff.
  - initial single-draft delivery now runs through `apps/web/lib/agent-v2/orchestrator/draftingExecutor.ts`, with `draftPipeline.ts` consuming the returned response seed, memory patch, and worker trace metadata for plan approval, rough auto-draft, and plan-to-draft fallback paths.
  - multi-draft bundle generation now runs through `apps/web/lib/agent-v2/orchestrator/draftBundleExecutor.ts`, with `draftPipeline.ts` preserving the current plan-presentation fallback on hard bundle-generation failure while consuming returned response seeds, memory patches, and worker trace metadata.
  - targeted draft revision now runs through `apps/web/lib/agent-v2/orchestrator/revisingExecutor.ts`, with `draftPipeline.ts` consuming the returned response seed, memory patch, validation metadata, and worker trace metadata for edit/review turns.
  - edit/review replan-then-draft continuation now runs through `apps/web/lib/agent-v2/orchestrator/replanningExecutor.ts`, with `draftPipeline.ts` consuming the returned plan-failure responses, draft response seeds, memory patches, and worker trace metadata instead of keeping that fallback inline.
  - the `reply_to_post` workflow now runs through `apps/web/lib/agent-v2/orchestrator/replyingExecutor.ts`, with `draftPipeline.ts` consuming the returned response seed and memory patch instead of routing reply workflow turns straight through the generic coach handler.
  - the `analyze_post` workflow now runs through `apps/web/lib/agent-v2/orchestrator/analysisExecutor.ts`, with `draftPipeline.ts` consuming the returned response seed and memory patch instead of routing analysis workflow turns straight through the generic coach handler.
- Break `draftPipeline.ts` into capability executors:
  - named executor extraction is complete for ideation, planning, drafting, revising, replying, and analysis
- Migration debt inside Phase 3:
  - route-level reply continuation generation, reply parsing/artifact shaping, and reply turn planning now flow through `apps/web/lib/agent-v2/orchestrator/replyContinuationPlanner.ts`, `apps/web/lib/agent-v2/orchestrator/replyTurnLogic.ts`, and `apps/web/lib/agent-v2/orchestrator/replyTurnPlanner.ts`, while `apps/web/app/api/creator/v2/chat/_lib/reply/routeReplyFinalize.ts` owns the remaining route-boundary persistence/response work
  - reply and analysis currently use coach-style generation behind explicit executor seams rather than bespoke capability-specific generation logic
- Ban workflow reclassification inside executors.
- Keep and complete a shared executor contract:
  - `CapabilityExecutionRequest`
  - `CapabilityExecutionResult`
  - `RuntimeValidationResult`
  - `activeContextRefs` belongs here, not on the normalized turn
- Follow-on backend/lib structure target for this phase:
  - move workflow-specific execution helpers toward capability-sliced folders
  - keep `draftPipeline.ts` and any eventual successor as composition/orchestration, not as the home for validators, retry policy, or feature-local helper sprawl
  - prefer colocating capability tests with the capability slice they exercise

### Phase 4: Formalize the parallel worker plane
- Allow parallelism only inside a chosen workflow for:
  - retrieval
  - source-material loading
  - style/profile loading
  - candidate generation
  - validation/scoring
- Landed first seam:
  - `apps/web/lib/agent-v2/orchestrator/contextLoadWorkers.ts` now owns the `initial_context_load` worker fan-out for style-rule extraction, core-fact extraction, and source-material asset loading
  - the helper returns merge-only worker outputs plus runtime worker-trace metadata, while `conversationManager.ts` remains the sequential owner for memory/style/artifact/thread writes
- Landed second seam:
  - `apps/web/lib/agent-v2/orchestrator/turnContextHydrationWorkers.ts` now owns the pre-routing `turn_context_hydration` fan-out for style-profile loading and anchor retrieval
  - `turnContextBuilder.ts` now returns those worker executions into the runtime path, and `routingPolicy.ts` becomes the first trace owner that records them before workflow resolution
- Landed third seam:
  - `apps/web/lib/agent-v2/orchestrator/historicalTextWorkers.ts` now owns the novelty-input `historical_text_load` fan-out for shipped posts and queued draft candidates
  - `draftPipeline.ts` now records that read-only retrieval seam inside the chosen workflow before drafting, draft-bundle generation, and replanning novelty checks
- Landed fourth seam:
  - `apps/web/lib/agent-v2/orchestrator/draftGuardValidationWorkers.ts` now owns the deterministic `draft_guard_validation_*` fan-out for concrete-scene drift and grounded-product drift checks
  - `draftPipeline.ts` now merges those validation-worker results into runtime trace before retry/clarification decisions, without changing the existing retry flow or sequential writes
- Landed fifth seam:
  - `apps/web/lib/agent-v2/orchestrator/draftBundleCandidateWorkers.ts` now owns the `draft_bundle_initial_candidates` fan-out for first-pass sibling option generation inside draft bundles
  - `generateDraftWithGroundingRetry()` now returns merge-only worker, validation, and trace-patch metadata so `draftBundleExecutor.ts` can parallelize only the safe initial candidate pass while keeping sibling novelty retries and all writes sequential
- Landed sixth seam:
  - `apps/web/lib/agent-v2/orchestrator/revisionValidationWorkers.ts` now owns the deterministic `revision_validation` merge seam for revision claim checking
  - `revisingExecutor.ts` now consumes that helper as the sequential merge owner; revision validation stays sequential for now because claim checking is the only shipped deterministic revision validator today
- Merge/failure rules standardized:
  - `apps/web/lib/agent-v2/orchestrator/workerPlane.ts` now centralizes worker execution building, validation status resolution, validation result building, and ordered execution-meta merging for the landed worker seams
  - landed worker helpers now emit trace metadata through that shared utility so Phase 4 merge behavior stays consistent without changing runtime ownership or client payloads
- Explicit no-double-write regression coverage landed:
  - `apps/web/app/api/creator/v2/chat/route.test.mjs` now pins the sequential persistence contract so conversation memory is written exactly once even when draft-candidate writes resolve out of order
  - this keeps Phase 4 worker-plane cleanup honest at the route boundary while safe parallel candidate writes remain isolated from memory/thread ownership
- Bundle sibling novelty retry boundary made explicit:
  - `apps/web/lib/agent-v2/orchestrator/draftBundleExecutor.ts` now records `retry_bundle_candidate_for_sibling_novelty` as a sequential execution step when a later bundle option must be regenerated against earlier accepted sibling drafts
  - this formalizes why the remaining novelty retry path stays outside the worker plane today: it depends on already-selected sibling outputs, so it remains sequential while initial candidate generation stays parallel
- Executor response contracts standardized:
  - `apps/web/lib/agent-v2/runtime/runtimeContracts.ts` now owns shared `RuntimeResponseSeed`, `CapabilityResponseOutput`, and `CapabilityPatchedResponseOutput` types for executor boundaries
  - drafting, draft-bundle, replanning, revising, planning, ideation, analysis, and replying executors now consume those shared types so merge-only response ownership stays consistent without changing runtime behavior or client payloads
- Reply finalization boundary thinned:
  - `apps/web/app/api/creator/v2/chat/_lib/reply/routeReplyFinalize.ts` now owns reply persistence, reply event dispatch, and final success-response assembly for handled reply turns
  - `apps/web/app/api/creator/v2/chat/route.ts` now imports reply turn state resolution and planning directly from the runtime-owned planner, which keeps route-only side effects out of reply planning without changing reply behavior or payloads
- Reply parse/planning moved under runtime ownership:
  - `apps/web/lib/agent-v2/orchestrator/replyTurnLogic.ts` now owns the pure reply parse/artifact helper logic, and `apps/web/lib/agent-v2/orchestrator/replyTurnPlanner.ts` now owns reply turn state resolution, planning, and memory snapshot shaping
  - `route.ts`, `routeReplyFinalize.ts`, `routeLogic.ts`, and `routeResponse.ts` now import reply planning and reply artifact types directly from the runtime-owned modules, so reply capability logic lives fully in the runtime layer
- Reply shim deletion completed:
  - `apps/web/app/api/creator/v2/chat/route.reply.ts` and `apps/web/app/api/creator/v2/chat/reply.logic.ts` have been removed now that route-internal consumers and focused tests import the runtime-owned reply modules directly
  - this removes the last reply-specific compatibility layer from the route boundary without changing client payloads or reply behavior
- Reply seam-audit regression landed:
  - `apps/web/app/api/creator/v2/chat/route.test.mjs` now pins the absence of `route.reply.ts` / `reply.logic.ts` and requires route-internal reply consumers to import the runtime-owned reply modules directly
  - this turns the last Phase 4 reply-boundary audit into an automated guardrail, so shim-based ownership drift cannot silently return

### Phase 5: Validation, retry, and backend/lib consolidation
- Goal:
  - make validation and retry the primary quality gate for draft/revision/reply flows
  - stop relying on cleanup heuristics as the main fix for malformed outputs
  - use the same phase to establish a scalable backend/lib folder strategy for agent runtime code
- Phase 5A landed:
  - backend-only delivery validation and single constrained retry for `plan_then_draft` and `revise_draft`
  - no changes under `apps/web/app/chat/` or `apps/web/app/chat/_features/`
  - deterministic delivery validators for truncation, prompt echo, artifact mismatch, and thread/post shape mismatch
  - validator outcomes recorded in runtime trace
  - safe non-artifact `coach_question` fallback when the second pass still fails delivery validation
- Phase 5A continuation landed:
  - `reply_to_post` and `analyze_post` now use the same backend-only delivery validation and single constrained retry pattern
  - shared conversational delivery validators now live under `apps/web/lib/agent-v2/validators/shared/`
  - shared reply/analyze validation worker adapters now live under `apps/web/lib/agent-v2/workers/validation/`
  - reply/analyze now fall back to safe non-artifact `coach_question` responses when the second pass still fails delivery validation
- Phase 5B structure follow-on:
  - extract delivery validation, revision validation, and workflow-local retry helpers out of large orchestrator entry files
  - introduce stable backend/lib and route-boundary folder conventions for new runtime work:
    - pure contracts do not import route code
    - validators stay pure and model-free
    - worker helpers stay read-only and merge-only
    - capability folders own their workflow-local helper modules and tests
    - infra adapters stay outside workflow policy modules
    - route entrypoints stay thin and defer feature-local boundary logic to dedicated helpers or route-private folders
  - start with `apps/web/lib/agent-v2` before applying similar patterns to other `apps/web/lib` domains
  - move order for this structure track:
    1. land new validators and validation workers directly in `validators/*` and `workers/validation/*`
    2. land new route-boundary helpers directly in `apps/web/app/api/creator/v2/chat/_lib/*`
    3. extract touched capability-local helpers out of `orchestrator/` into `capabilities/*`
    4. leave compatibility imports in place only as short-lived migration seams while tests are updated
    5. shrink `draftPipeline.ts` and `route.ts` only after their adjacent helpers have stable homes
- Acceptance gates:
  - new backend runtime work lands in predictable domain/slice folders instead of expanding `orchestrator/` as a catch-all
  - new route-boundary work lands in dedicated route helpers or route-private folders instead of expanding `route.ts` files as catch-alls
  - at least one Phase 5 validator slice lands without touching the chat UI
  - folder moves, when done, are incremental and test-backed rather than broad churn
- Guardrails now in force:
  - worker fan-out stays merge-only, and parallel workers cannot produce ambiguous state writes
  - memory, artifacts, reply context, and thread state remain sequential-only ownership paths
- Phase 4 implementation cleanup is complete.

### Phase 5: Replace patching with validation and retry
- Add deterministic validators for:
  - truncation
  - prompt echo
  - artifact mismatch
  - thread/post shape mismatch
  - unsupported factual claims
- If validation fails, do one constrained repair/retry inside the same workflow.
- Keep cleanup helpers only as a last-resort surface guard.
- Use the concrete folder map above when landing this work:
  - delivery validators go in `validators/draft/` or `validators/revision/`
  - worker-plane adapters go in `workers/validation/`
  - route-boundary glue goes in `apps/web/app/api/creator/v2/chat/_lib/*`

### Phase 6: Rollout and deletion
- Ship the new runtime shape behind a migration flag if needed.
- Migrate workflows in this order:
  1. ideation + draft
  2. revision
  3. reply + analyze
- Delete compatibility shims and duplicate routing once each workflow family is green under the new model.

## Important Interfaces and Types
- Keep and standardize the shared transport contract around:
  - `workspaceHandle`
  - `threadId`
  - `clientTurnId`
  - `turnSource`
  - `artifactContext`
  - literal `message`
- The normalized turn should remain the only transport-to-runtime boundary and currently carries:
  - transcript-facing and orchestration-facing message variants
  - `turnSource`
  - `artifactContext`
  - `resolvedWorkflow`
  - `planSeedSource`
  - `replyHandlingBypassedReason`
  - `shouldAllowReplyHandling`
- `planSeedMessage` belongs to route/orchestrator context after normalization; it is not a normalized-turn field.
- Shared capability execution contract is partially landed already:
  - `CapabilityExecutionRequest`
  - `CapabilityExecutionResult`
  - `RuntimeValidationResult`
  - `activeContextRefs`
- Persistence trace contract is now explicit:
  - `RuntimePersistedStateChanges`
  - `RuntimePersistenceTracePatch`
- Standardize runtime trace output so tests and logs can assert:
  - workflow selected
  - source of decision
  - parallel workers invoked
  - validation result
  - persisted state changes
- Transitional note:
  - persisted state changes are now recorded for main chat persistence and for reply finalization when a runtime trace already exists; direct reply-preflight trace synthesis is still deferred

## Test and Acceptance Plan
- Required migration scenarios:
  - `write a post` -> ideation -> pick direction -> draft
  - ideation pick -> revise -> thread conversion
  - pasted post -> reply workflow
  - pasted post without explicit reply ask -> analyze/reply/quote guidance instead of forced reply drafting
  - clarification answer after wrong assumption
  - topic switch after active draft or reply context
  - duplicate `clientTurnId`
  - multi-tab same-profile different-handle isolation
  - reply workflow not hijacking non-reply turns
  - no double-write behavior from worker fan-out
  - persistence workers append after workflow execution in diagnostics traces
  - persisted-state trace records assistant message id, thread mutation summary, memory mutation summary, and draft-candidate counts
- Required capability eval coverage:
  - ideation quality
  - shortform draft quality
  - thread quality
  - reply quality
  - keep this visible as required coverage even if it is not yet a standalone gate family
- Executable gates today:
  - `pnpm run test:v2-route`
  - `pnpm run test:v2-runtime`
  - `pnpm run test:v2-response-quality`
  - `pnpm run test:v2-regressions`
  - `pnpm run test:v3-runtime`
  - `pnpm run test:transcript-replay`
  - `pnpm build`

## Assumptions and Defaults
- The right long-term pattern for Xpo is **not** fully parallel multi-agent routing; it is sequential orchestration with selective parallel workers.
- The user-facing UX should remain one natural chat surface.
- Massive reworks are acceptable if they improve correctness, evaluability, and long-term maintainability.
- Existing gains around transcript cleanup, handle isolation, memory salience, grounding separation, and reply ownership remain required invariants during the rework.
- `Artifact.md` and `LIVE_AGENT.md` should stay aligned to this plan while still calling out current migration debt explicitly.
