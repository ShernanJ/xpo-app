# Agent Runtime vNext Program Board

## Status
- Program: `Agent Runtime vNext`
- Design pattern: `Sequential Control Plane, Parallel Worker Plane`
- Migration style: staged strangler
- Last updated: 2026-03-14
- Current slice: backend/lib and API folder-structure cleanup is landed for the active migration surface, and backend-only validation/retry is now landed across draft, revision, reply, and analysis
- Current architecture tracks now focus on keeping new runtime work inside the landed domain folders so flat backend monoliths do not regrow

## Status language
- `target architecture` means the intended end state.
- `landed` means already true in code today.
- `migration debt` means transitional behavior that still exists and should be removed later.

## Why this rework exists
The app is now bottlenecked by infrastructure, not prompt tweaks.

Current hotspots:
- `apps/web/app/chat/page.tsx` is still a large client monolith that mixes transport, local workflow state, and presentation.
- `apps/web/app/api/creator/v2/chat/route.ts` is still too heavy as a route boundary.
- `apps/web/lib/agent-v2/orchestrator/draftPipeline.ts` still owns too many capabilities and too much continuation logic.

The program goal is to make the system feel like one natural ChatGPT-style assistant on the surface while being explicit, typed, and deterministic underneath.

## Frontend architecture track
- Route roots should be orchestration entrypoints, not flat dumping grounds for every helper, component, and test.
- Complex routes now target private folders for route-local implementation:
  - `_features`
  - `_dialogs`
  - `_components`
  - `_hooks`
  - `_lib`
- Shared interactive primitives belong in `apps/web/components/ui`.
- Frontend testing now has an explicit long-term split:
  - `node:test` for pure state modules
  - Vitest + React Testing Library for synchronous client components
  - Playwright for route behavior and accessibility-critical flows

## Backend/lib and API architecture track
- `apps/web/lib` should scale by domain and ownership boundary, not by one large shared helper layer.
- `apps/web/lib/agent-v2/orchestrator/` is transitional and should shrink over time into control-plane composition only.
- New runtime work should trend toward:
  - `contracts/`
  - `runtime/`
  - `core/`
  - capability-sliced execution folders
  - worker folders
  - validator folders
  - infra adapters kept outside workflow policy
- `apps/web/app/api` route roots should stay thin and delegate feature-local boundary work to route helpers or route-private folders.
- Route modules should not become a parallel home for runtime policy that belongs in `apps/web/lib`.
- Concrete target map now in force:
  - `apps/web/lib/agent-v2/contracts`, `runtime`, `core`, `memory`, and `agents` remain stable top-level homes
  - new workflow-local code should trend toward `capabilities/ideation`, `capabilities/planning`, `capabilities/drafting`, `capabilities/revision`, `capabilities/reply`, and `capabilities/analysis`
  - new fan-out helpers should trend toward `workers/context`, `workers/retrieval`, `workers/candidates`, and `workers/validation`
  - new deterministic validators should trend toward `validators/draft`, `validators/revision`, and `validators/shared`
  - `apps/web/app/api/creator/v2/chat` should trend toward thin route roots plus `_lib/normalization`, `_lib/request`, `_lib/persistence`, `_lib/response`, `_lib/reply`, and optional `_tests`
  - `apps/web/lib/onboarding` now has landed domain folders for `profile`, `analysis`, `strategy`, `pipeline`, `contracts`, `shared`, `store`, and `sources`
- Migration rule:
  - extract new seams into their target home when touched
  - avoid broad move-only churn
  - let `orchestrator/` and heavy `route.ts` files shrink incrementally behind tests

## Architecture principles
- One top-level runtime owner decides the workflow before any model call.
- One turn belongs to one workflow:
  - `answer_question`
  - `ideate`
  - `plan_then_draft`
  - `revise_draft`
  - `reply_to_post`
  - `analyze_post`
- The control plane stays sequential.
- Target control-plane order:
  - transport contract
  - turn normalization
  - runtime action resolution
  - workflow dispatch
  - persistence
  - response envelope
- Parallelism is allowed only inside a chosen workflow and only for read-only or side-effect-free workers.
- Memory, artifact persistence, reply context, and thread metadata mutate only through the sequential runtime path.
- Validation and retry are the primary quality strategy.
- Cleanup helpers remain last-resort output guards only.

## Design pattern
### Sequential control plane
- Transport contract
- Turn normalization
- Runtime action resolution
- Workflow dispatch
- Persistence
- Response envelope

### Parallel worker plane
- Retrieval
- Style/profile loading
- Source-material loading
- Candidate generation
- Validation/scoring

### Forbidden concurrency patterns
- Multiple routers classifying the same turn in parallel
- Parallel writes to memory, artifacts, reply context, or thread state
- Prompt-level workflow switching inside capability executors
- Client-side hidden prompting as the main workflow signal
- Cleanup heuristics used as the primary fix for routing or generation defects

## Shared contracts in play
- Transport contract currently standardizes:
  - `workspaceHandle`
  - `threadId`
  - `clientTurnId`
  - `turnSource`
  - `artifactContext`
  - literal `message`
- Normalized turn currently carries:
  - transcript-facing and orchestration-facing message variants
  - `turnSource`
  - `artifactContext`
  - `resolvedWorkflow`
  - `planSeedSource`
  - `replyHandlingBypassedReason`
  - `shouldAllowReplyHandling`
- `planSeedMessage` is route/orchestrator context after normalization, not a normalized-turn field.
- Shared capability contract types already landed in `apps/web/lib/agent-v2/runtime/runtimeContracts.ts`:
  - `CapabilityExecutionRequest`
  - `CapabilityExecutionResult`
  - `RuntimeValidationResult`
  - `activeContextRefs` belongs here, not on the normalized turn

## Current invariants
- `recentHistory` stays transcript-only.
- Structured UI actions must travel as `turnSource + artifactContext`.
- Explicit `workspaceHandle` is authoritative for creator/chat scope.
- Reply parsing only runs on literal `free_text` turns.
- Planner, writer, critic, reviser, and reply generation are capability workers, not peer routers.
- Voice grounding and factual grounding stay separated.
- Multi-handle isolation remains required behavior.

## Transitional notes
- `apps/web/app/chat/page.tsx` no longer hand-builds the main chat transport payload inline and now delegates chat result parsing/state planning through `apps/web/app/chat/_features/transport/chatTransport.ts` and `apps/web/app/chat/_features/reply/chatReplyState.ts`.
- The main chat page has been thinned further by extracting page-local client seams into dedicated helpers:
  - workspace/session/composer:
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
  - preview presentation:
    - `apps/web/app/chat/_features/draft-editor/chatDraftPreviewCard.tsx`
- The latest frontend hygiene pass also started normalizing large UI surfaces around explicit composition and accessible primitives:
  - `apps/web/app/chat/_features/thread-history/ChatMessageRow.tsx`
  - `apps/web/app/chat/_features/draft-editor/DraftEditorDock.tsx`
  - `apps/web/components/ui/dialog.tsx`
  - `apps/web/app/pricing/_components/BillingCadenceToggle.tsx`
- That pass kept product behavior stable while fixing workspace-scoped client callbacks, semantic draft-preview interactions, dialog accessibility, and login/pricing control semantics.
- Frontend follow-on work in this slice should keep using the installed skills:
  - `vercel-react-best-practices`
  - `vercel-composition-patterns`
  - `web-design-guidelines`
- Route-local file organization is now part of the architecture story, not just cleanup:
  - `apps/web/app/chat` keeps only route entry files at the root
  - feature code lives under `apps/web/app/chat/_features/*`
  - route-scoped dialogs live under `apps/web/app/chat/_dialogs/*`
  - route-scoped presentational components live under `apps/web/app/chat/_components/*`
- `apps/web/app/chat/page.tsx` is now materially thinner, down to roughly 5.7k lines after moving thread-history, source-materials, preferences, growth-guide, and analysis state/presentation behind route-private feature seams.
- `apps/web/app/chat/page.tsx` still owns too much async orchestration to be the long-term ideal client boundary, but the highest-ROI duplicated state/decision seams from this pass are now extracted and covered by focused client tests.
- As of 2026-03-14, chat-page-specific TypeScript regressions from the extraction pass are resolved; remaining full `pnpm exec tsc --noEmit` failures are outside `apps/web/app/chat/page.tsx` and currently sit in unrelated tests and onboarding/shared modules.
- Follow-up composer regressions from the route thinning pass are also fixed now:
  - the hero textarea and quick-action chips stay interactive when the draft is empty
  - the hero-to-dock composer transition no longer shows two inputs during the handoff
- `apps/web/app/api/creator/v2/chat/route.ts` is still heavy and still owns more request assembly, persistence assembly, and thread mutation than the target architecture wants.
- Current code still finalizes/shapes the orchestrator response before route persistence and thread updates.
- Sequential assistant-message persistence, thread updates, and draft-candidate writes now flow through `apps/web/app/api/creator/v2/chat/_lib/persistence/routePersistence.ts`.
- Reply-turn response assembly, product-event planning, and final success-response packaging now flow through `apps/web/app/api/creator/v2/chat/_lib/response/routeResponse.ts`, but the route still owns too much request assembly and reply control flow.
- Reply preflight parsing/default resolution and reply artifact shaping now live in `apps/web/lib/agent-v2/orchestrator/replyTurnLogic.ts` and `apps/web/lib/agent-v2/orchestrator/replyTurnPlanner.ts`, while `apps/web/app/api/creator/v2/chat/_lib/reply/routeReplyFinalize.ts` owns handled-reply persistence/finalization.
- `apps/web/lib/agent-v2/orchestrator/conversationManager.ts` now keeps `routingTrace` in-memory until diagnostics explicitly request serialization, so route-boundary persistence can append to the same trace object before any external response includes it.
- `apps/web/app/api/creator/v2/chat/_lib/persistence/routePersistence.ts` now emits `RuntimePersistenceTracePatch` with standardized persistence workers plus `persistedStateChanges` for assistant message, thread, memory, and draft-candidate writes.
- `apps/web/app/api/creator/v2/chat/route.ts` now merges that persistence patch after sequential writes complete, and `apps/web/app/api/creator/v2/chat/_lib/reply/routeReplyFinalize.ts` reuses the same patch format when an upstream runtime trace exists.
- Direct reply-preflight turns still do not synthesize a fake end-to-end runtime trace; that remains accepted migration debt until reply entry shares the common runtime path.
- `pipeline_continuation` remains migration debt to remove, not a desired steady-state source of workflow authority.

## Phase board
### Phase 0: Program reset
- Rewrite `Artifact.md` and `LIVE_AGENT.md` into migration docs instead of patch logs.
- Status: complete.

### Phase 1: Lock the control plane
- Make turn normalization the only transport-to-runtime boundary.
- Make runtime resolution the only workflow authority.
- Standardize runtime trace output:
  - normalized turn
  - runtime workflow
  - resolution source
  - reply bypass reason
  - worker execution summary
  - validation results
- Landed during the persisted-state tracing slice:
  - `apps/web/lib/agent-v2/orchestrator/conversationManager.ts` now returns raw response payloads plus in-memory `routingTrace` instead of eagerly serializing that trace on the raw envelope
  - `apps/web/lib/agent-v2/runtime/runtimeContracts.ts` and `apps/web/lib/agent-v2/runtime/runtimeTrace.ts` now standardize `RuntimePersistedStateChanges`, `RuntimePersistenceTracePatch`, and patch-merge helpers for persistence workers
  - `apps/web/app/api/creator/v2/chat/_lib/persistence/routePersistence.ts` now returns persistence worker executions for `persist_assistant_message`, `update_conversation_memory`, `update_chat_thread`, and `create_draft_candidate`
  - `apps/web/app/api/creator/v2/chat/route.ts` now merges that persistence patch before the final success response is built and only exposes full `routingTrace` when diagnostics explicitly request it
  - `apps/web/app/api/creator/v2/chat/_lib/reply/routeReplyFinalize.ts` now consumes the same persistence trace patch when a runtime trace is already available
- Remaining target-state follow-on:
  - unify reply-path tracing without fabricating end-to-end runtime resolution for direct reply-preflight turns
  - move response shaping after persistence/thread updates to match the target control-plane order
- Exit criteria for this slice:
  - diagnostics traces show persistence-phase worker entries after workflow execution
  - `persistedStateChanges` reports assistant message id, thread mutation summary, memory mutation summary, and draft-candidate attempted/created/skipped counts
- Status: in progress, with the main chat path landed, reply/analyze validation landed, and reply-path unification still open.
- Landed:
  - `apps/web/lib/agent-v2/contracts/chatTransport.ts`
  - `apps/web/lib/agent-v2/runtime/resolveRuntimeAction.ts`
  - `apps/web/lib/agent-v2/runtime/runtimeContracts.ts`
  - `apps/web/lib/agent-v2/runtime/runtimeTrace.ts`
  - `apps/web/lib/agent-v2/orchestrator/draftPipeline.ts` now dispatches from runtime workflow first and tags remaining legacy local overrides as `pipeline_continuation` in the runtime trace instead of silently reclassifying turns

### Phase 2: Thin the client and route
- Landed:
  - main chat turn-resolution and transport payload construction now flow through `apps/web/app/chat/_features/transport/chatTransport.ts`
  - main chat result parsing, assistant-message assembly, draft-editor follow-up selection, reply outcome planning, and thread remap planning now flow through `apps/web/app/chat/_features/reply/chatReplyState.ts`
  - workspace/session/composer client seams now flow through dedicated client helpers:
    - `apps/web/app/chat/_features/workspace/chatWorkspaceState.ts`
    - `apps/web/app/chat/_features/composer/chatComposerState.ts`
    - `apps/web/app/chat/_features/workspace/chatWorkspaceLoadState.ts`
  - draft editor/session/persistence/preview/action/history client seams now flow through dedicated client helpers:
    - `apps/web/app/chat/_features/draft-editor/chatDraftEditorState.ts`
    - `apps/web/app/chat/_features/draft-editor/chatDraftSessionState.ts`
    - `apps/web/app/chat/_features/draft-editor/chatDraftPersistenceState.ts`
    - `apps/web/app/chat/_features/draft-editor/chatDraftPreviewState.ts`
    - `apps/web/app/chat/_features/draft-editor/chatDraftActionState.ts`
    - `apps/web/app/chat/_features/thread-history/chatThreadHistoryState.ts`
  - inline draft preview presentation now flows through `apps/web/app/chat/_features/draft-editor/chatDraftPreviewCard.tsx`
  - main chat turns now finalize the raw orchestrator envelope in `apps/web/app/api/creator/v2/chat/route.ts`
  - post-orchestrator response mapping and persistence prep moved into route-boundary helpers
  - sequential assistant-message persistence, memory/thread updates, and draft-candidate writes now run through `apps/web/app/api/creator/v2/chat/_lib/persistence/routePersistence.ts`
  - reply-turn response assembly, product-event planning, and final success-response packaging now run through `apps/web/app/api/creator/v2/chat/_lib/response/routeResponse.ts`
- Move transport/request construction out of `apps/web/app/chat/page.tsx` into a dedicated chat transport layer plus workspace store.
- Reduce `apps/web/app/api/creator/v2/chat/route.ts` to auth, ownership checks, normalization, runtime dispatch, persistence, and response envelope assembly.
- Keep workflow signals in structured transport and eliminate hidden prompt-based routing if found.
- Status: complete with accepted migration debt in page-local workspace/session/composer state and reply-control flow.
- Route-structure follow-on:
  - continue shrinking heavy route entrypoints through route-boundary helpers and route-private folders
  - keep workflow policy in `apps/web/lib` while route modules own only API-boundary concerns

### Phase 3: Split capability execution
- Shared capability contract types are already landed in `apps/web/lib/agent-v2/runtime/runtimeContracts.ts`:
  - `CapabilityExecutionRequest`
  - `CapabilityExecutionResult`
  - `RuntimeValidationResult`
- Landed:
  - ideation now executes through `apps/web/lib/agent-v2/orchestrator/ideationExecutor.ts`
  - `apps/web/lib/agent-v2/orchestrator/draftPipeline.ts` now consumes that executor through the shared capability contract and merges returned worker metadata at the pipeline boundary
  - initial planning now executes through `apps/web/lib/agent-v2/orchestrator/planningExecutor.ts`
  - `apps/web/lib/agent-v2/orchestrator/draftPipeline.ts` now consumes that executor through the shared capability contract and keeps only draft handoff / continuation logic around it
  - initial single-draft execution now runs through `apps/web/lib/agent-v2/orchestrator/draftingExecutor.ts`
  - `apps/web/lib/agent-v2/orchestrator/draftPipeline.ts` now consumes that executor for plan approval, rough auto-draft, and plan-to-draft fallback delivery paths
  - multi-draft bundle generation now executes through `apps/web/lib/agent-v2/orchestrator/draftBundleExecutor.ts`
  - `apps/web/lib/agent-v2/orchestrator/draftPipeline.ts` now consumes that executor through the shared capability contract, while preserving the existing fallback from hard bundle-generation errors back to plan presentation
  - targeted revision now executes through `apps/web/lib/agent-v2/orchestrator/revisingExecutor.ts`
  - `apps/web/lib/agent-v2/orchestrator/draftPipeline.ts` now consumes that executor for edit/review delivery and merges returned validation metadata at the pipeline boundary
  - edit/review replan-then-draft continuation now executes through `apps/web/lib/agent-v2/orchestrator/replanningExecutor.ts`
  - `apps/web/lib/agent-v2/orchestrator/draftPipeline.ts` now consumes that executor through the shared capability contract instead of keeping planner-failure handling and fallback draft delivery inline in the revision/edit flow
  - the `reply_to_post` workflow now executes through `apps/web/lib/agent-v2/orchestrator/replyingExecutor.ts`
  - `apps/web/lib/agent-v2/orchestrator/draftPipeline.ts` now consumes that executor for reply workflow turns instead of falling straight through the generic coach handler
  - the `analyze_post` workflow now executes through `apps/web/lib/agent-v2/orchestrator/analysisExecutor.ts`
  - `apps/web/lib/agent-v2/orchestrator/draftPipeline.ts` now consumes that executor for analysis workflow turns instead of falling straight through the generic coach handler
- Remaining work:
  - adopt the shared capability contract cleanly across those executors
  - ban workflow reclassification inside executors
  - keep `apps/web/lib/agent-v2/orchestrator/replyContinuationPlanner.ts`, `apps/web/lib/agent-v2/orchestrator/replyTurnLogic.ts`, and `apps/web/lib/agent-v2/orchestrator/replyTurnPlanner.ts` as the runtime-owned reply capability boundary while `apps/web/app/api/creator/v2/chat/_lib/reply/routeReplyFinalize.ts` remains the route-boundary finalization helper
- Status: complete with accepted migration debt.

### Phase 4: Formalize the parallel worker plane
- Allow worker fan-out only for retrieval, source-material loading, style/profile loading, candidate generation, and validation/scoring.
- Landed:
  - `apps/web/lib/agent-v2/orchestrator/contextLoadWorkers.ts` now owns the `initial_context_load` fan-out for style-rule extraction, core-fact extraction, and source-material asset loading
  - `apps/web/lib/agent-v2/orchestrator/conversationManager.ts` now consumes that helper as a merge-only worker seam and keeps all memory/style/artifact/thread writes in the sequential path
  - `apps/web/lib/agent-v2/orchestrator/turnContextHydrationWorkers.ts` now owns the pre-routing `turn_context_hydration` fan-out for style-profile loading and anchor retrieval
  - `apps/web/lib/agent-v2/orchestrator/turnContextBuilder.ts` now returns that worker metadata into the runtime path, and `apps/web/lib/agent-v2/orchestrator/routingPolicy.ts` records it before workflow resolution
  - `apps/web/lib/agent-v2/orchestrator/historicalTextWorkers.ts` now owns the `historical_text_load` fan-out for shipped posts and queued draft candidates used by novelty scoring
  - `apps/web/lib/agent-v2/orchestrator/draftPipeline.ts` now records that retrieval seam inside the chosen workflow before drafting, draft bundles, and replanning novelty checks
  - `apps/web/lib/agent-v2/orchestrator/draftGuardValidationWorkers.ts` now owns the deterministic `draft_guard_validation_*` fan-out for concrete-scene drift and grounded-product drift checks
  - `apps/web/lib/agent-v2/orchestrator/draftPipeline.ts` now merges that validation seam into runtime trace before retry and clarification decisions, while keeping the retry/write path sequential
  - `apps/web/lib/agent-v2/orchestrator/draftBundleCandidateWorkers.ts` now owns the `draft_bundle_initial_candidates` fan-out for first-pass sibling option generation
  - `apps/web/lib/agent-v2/orchestrator/draftPipeline.ts` now returns merge-only drafting trace metadata so `apps/web/lib/agent-v2/orchestrator/draftBundleExecutor.ts` can parallelize only the safe initial candidate pass while keeping novelty retries and write ownership sequential
  - `apps/web/lib/agent-v2/orchestrator/revisionValidationWorkers.ts` now owns the deterministic `revision_validation` merge seam for revision claim checking
  - `apps/web/lib/agent-v2/orchestrator/revisingExecutor.ts` now consumes that validation seam while keeping clarification, response shaping, and memory writes in the same sequential owner path
  - `apps/web/lib/agent-v2/orchestrator/workerPlane.ts` now standardizes worker execution building, validation status resolution, validation result building, and ordered execution-meta merging across the landed worker seams
  - `apps/web/app/api/creator/v2/chat/route.test.mjs` now pins explicit no-double-write coverage so sequential memory persistence remains single-write even when draft-candidate writes finish out of order
  - `apps/web/lib/agent-v2/orchestrator/draftBundleExecutor.ts` now records explicit sequential sibling-novelty retry trace entries so the remaining bundle retry path is formalized as a dependent control-plane step instead of implicit worker fan-out
  - `apps/web/lib/agent-v2/runtime/runtimeContracts.ts` now standardizes executor response and response-seed contracts, and the main executor seams now consume those shared types instead of local one-off response output shapes
  - `apps/web/app/api/creator/v2/chat/_lib/reply/routeReplyFinalize.ts` now owns reply persistence/event/response finalization, while `route.ts`, `routeLogic.ts`, and `routeResponse.ts` import reply planning and reply artifact types directly from the runtime-owned modules
  - `apps/web/lib/agent-v2/orchestrator/replyTurnLogic.ts` and `apps/web/lib/agent-v2/orchestrator/replyTurnPlanner.ts` now own reply parsing and reply-turn planning in the runtime layer, and the transitional `apps/web/app/api/creator/v2/chat/reply.logic.ts` / `apps/web/app/api/creator/v2/chat/route.reply.ts` shims have been removed
  - `apps/web/app/api/creator/v2/chat/route.test.mjs` now pins the reply seam audit so those shim files stay absent and route-internal reply consumers keep importing the runtime-owned reply modules directly
- Guardrails now in force:
  - worker fan-out stays merge-only, and parallel workers cannot produce ambiguous state writes
  - memory, artifacts, reply context, and thread state remain sequential-only ownership paths
- Status: complete.

### Phase 5: Validation and retry
- Add deterministic validators for truncation, prompt echo, artifact mismatch, thread/post shape mismatch, and unsupported factual claims.
- Retry once inside the same workflow before any surface cleanup.
- Use this phase to place new validation work directly in the target structure:
  - `validators/*` for deterministic validators and retry constraints
  - `workers/validation/*` for worker-plane adapters
  - `apps/web/app/api/creator/v2/chat/_lib/*` for route-boundary glue
- Landed:
  - draft/revision delivery validation and retry
  - reply/analyze delivery validation and retry
  - backend/lib and API structure cleanup for the active migration surface
- Active move order:
  1. keep all new work in the landed target folders
  2. continue deleting compatibility shims once imports are fully migrated
  3. keep reply-path trace unification explicit migration debt until direct reply-preflight shares the common runtime path
- Status: in progress, with validator coverage landed across draft/revision/reply/analyze.

### Phase 6: Rollout and deletion
- Ship the new runtime shape behind a migration flag if needed.
- Migrate workflow families in order:
  1. ideation + draft
  2. revision
  3. reply + analyze
- Delete compatibility shims and duplicate routing only when each family is green under vNext.
- Status: not started.

## Executable gates today
- `pnpm run test:v2-route`
- `pnpm run test:v2-orchestrator`
- `pnpm run test:v2-response-quality`
- `pnpm run test:v2-regressions`
- `pnpm run test:v3-orchestrator`
- `pnpm run test:transcript-replay`
- `pnpm build`

## Required migration scenarios
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

## Required capability eval coverage
- Ideation quality
- Shortform draft quality
- Thread quality
- Reply quality
- Keep this visible as required coverage even if it is not yet a standalone gate family

## Active blockers and risks
- `apps/web/app/chat/page.tsx` still owns too much async request orchestration and some large presentational/editor surfaces.
- `apps/web/app/api/creator/v2/chat/route.ts` still owns too much workflow and persistence assembly.
- `apps/web/lib/agent-v2/orchestrator/draftPipeline.ts` still mixes generation, continuation, grounding, revision, and salvage logic.
- Reply turns can now reuse the persistence trace patch, but direct reply-preflight turns still lack unified runtime trace ownership.
- Output cleanup helpers still exist because validator + retry is incomplete.

## Recent chat-client paydown
- Highest-ROI page-local state seams were extracted from `apps/web/app/chat/page.tsx` and pinned with focused tests.
- Shared UI primitives now own more of the client presentation contract:
  - chat message row rendering in `apps/web/app/chat/_features/thread-history/ChatMessageRow.tsx`
  - draft-editor dock layout variants in `apps/web/app/chat/_features/draft-editor/DraftEditorDock.tsx`
  - dialog accessibility/focus behavior in `apps/web/components/ui/dialog.tsx`
  - pricing cadence semantics in `apps/web/app/pricing/_components/BillingCadenceToggle.tsx`
- Frontend enforcement is now partly automated:
  - `pnpm run test:ui`
  - `pnpm run test:e2e`
- The remaining step from the most recent local pass is reassessment, not a required architectural follow-on.
- If the next agent continues thinning the client, the best remaining candidates are:
  - additional presentational extraction from the draft editor surface
  - any remaining async orchestration in `requestAssistantReply` only if it still materially reduces page complexity without changing transport or route ownership

## Do not regress
- Do not move assistant machine state back into transcript history.
- Do not reintroduce session-global handle scoping for account-specific context.
- Do not let reply parsing inspect structured draft or ideation turns.
- Do not let multiple control-plane owners classify the same turn.
- Do not add more cleanup heuristics when the defect belongs in runtime ownership, validator logic, or executor boundaries.

## Historical appendix
- Transcript cleanup, handle isolation, voice-vs-factual grounding separation, memory salience, thread quality work, and initial turn normalization landed before the vNext program board existed.
- Those behaviors are baseline requirements during this migration.
