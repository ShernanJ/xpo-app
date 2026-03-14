# Agent Runtime vNext Program Board

## Status
- Program: `Agent Runtime vNext`
- Design pattern: `Sequential Control Plane, Parallel Worker Plane`
- Migration style: staged strangler
- Last updated: 2026-03-13
- Current slice: Phase 4 worker-plane cleanup in progress

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
- `apps/web/app/chat/page.tsx` no longer hand-builds the main chat transport payload inline and now delegates chat result parsing/state planning through `apps/web/app/chat/chatTransport.ts` and `apps/web/app/chat/chatReplyState.ts`, but it still owns too much workspace/session/composer state to be the long-term ideal client boundary.
- `apps/web/app/api/creator/v2/chat/route.ts` is still heavy and still owns more request assembly, persistence assembly, and thread mutation than the target architecture wants.
- Current code still finalizes/shapes the orchestrator response before route persistence and thread updates.
- Sequential assistant-message persistence, thread updates, and draft-candidate writes now flow through `apps/web/app/api/creator/v2/chat/route.persistence.ts`.
- Reply-turn response assembly, product-event planning, and final success-response packaging now flow through `apps/web/app/api/creator/v2/chat/route.response.ts`, but the route still owns too much request assembly and reply control flow.
- Reply preflight parsing/default resolution and handled-reply persistence/finalization now flow through `apps/web/app/api/creator/v2/chat/route.reply.ts`, but that wrapper still owns parse-only prompts and reply artifact shaping outside the runtime capability boundary.
- Runtime trace currently records normalized turn, runtime resolution, worker summary, and validations, but not persisted state changes yet.
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
- Remaining target-state follow-on:
  - extend runtime trace to cover persisted state changes too
- Status: in progress.
- Landed:
  - `apps/web/lib/agent-v2/contracts/chatTransport.ts`
  - `apps/web/lib/agent-v2/runtime/resolveRuntimeAction.ts`
  - `apps/web/lib/agent-v2/runtime/runtimeContracts.ts`
  - `apps/web/lib/agent-v2/runtime/runtimeTrace.ts`
  - `apps/web/lib/agent-v2/orchestrator/draftPipeline.ts` now dispatches from runtime workflow first and tags remaining legacy local overrides as `pipeline_continuation` in the runtime trace instead of silently reclassifying turns

### Phase 2: Thin the client and route
- Landed:
  - main chat turn-resolution and transport payload construction now flow through `apps/web/app/chat/chatTransport.ts`
  - main chat result parsing, assistant-message assembly, draft-editor follow-up selection, and thread remap planning now flow through `apps/web/app/chat/chatReplyState.ts`
  - main chat turns now finalize the raw orchestrator envelope in `apps/web/app/api/creator/v2/chat/route.ts`
  - post-orchestrator response mapping and persistence prep moved into route-boundary helpers
  - sequential assistant-message persistence, memory/thread updates, and draft-candidate writes now run through `apps/web/app/api/creator/v2/chat/route.persistence.ts`
  - reply-turn response assembly, product-event planning, and final success-response packaging now run through `apps/web/app/api/creator/v2/chat/route.response.ts`
- Move transport/request construction out of `apps/web/app/chat/page.tsx` into a dedicated chat transport layer plus workspace store.
- Reduce `apps/web/app/api/creator/v2/chat/route.ts` to auth, ownership checks, normalization, runtime dispatch, persistence, and response envelope assembly.
- Keep workflow signals in structured transport and eliminate hidden prompt-based routing if found.
- Status: complete with accepted migration debt in page-local workspace/session/composer state and reply-control flow.

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
  - reply continuation generation now lives in `apps/web/lib/agent-v2/orchestrator/replyContinuationPlanner.ts`, while `apps/web/app/api/creator/v2/chat/route.reply.ts` still owns the route-boundary preflight parse/default wrapper, parse prompts, reply artifact shaping, and handled-reply persistence/finalization and must be reconciled fully with the runtime capability boundary
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
- Add merge rules for worker outputs.
- Prohibit ambiguous side effects from worker fan-out.
- Status: in progress.

### Phase 5: Validation and retry
- Add deterministic validators for truncation, prompt echo, artifact mismatch, thread/post shape mismatch, and unsupported factual claims.
- Retry once inside the same workflow before any surface cleanup.
- Status: not started.

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
- `apps/web/app/chat/page.tsx` still owns too much request and workspace logic.
- `apps/web/app/api/creator/v2/chat/route.ts` still owns too much workflow and persistence assembly.
- `apps/web/lib/agent-v2/orchestrator/draftPipeline.ts` still mixes generation, continuation, grounding, revision, and salvage logic.
- Output cleanup helpers still exist because validator + retry is incomplete.

## Do not regress
- Do not move assistant machine state back into transcript history.
- Do not reintroduce session-global handle scoping for account-specific context.
- Do not let reply parsing inspect structured draft or ideation turns.
- Do not let multiple control-plane owners classify the same turn.
- Do not add more cleanup heuristics when the defect belongs in runtime ownership, validator logic, or executor boundaries.

## Historical appendix
- Transcript cleanup, handle isolation, voice-vs-factual grounding separation, memory salience, thread quality work, and initial turn normalization landed before the vNext program board existed.
- Those behaviors are baseline requirements during this migration.
