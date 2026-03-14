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
- Target-state follow-on: extend runtime trace far enough to assert persisted state changes too.

### Phase 2: Thin the client and route
- Landed during migration:
  - `apps/web/app/api/creator/v2/chat/route.ts` now owns final response-envelope finalization for the main chat path.
  - post-orchestrator response mapping and persistence prep live in route-boundary helpers instead of being fully hand-assembled inline in the route.
  - sequential assistant-message persistence, memory/thread updates, and draft-candidate writes now run through a dedicated route-boundary helper in `apps/web/app/api/creator/v2/chat/route.persistence.ts`.
  - reply-turn response assembly, product-event planning, and final success-response packaging now flow through `apps/web/app/api/creator/v2/chat/route.response.ts` instead of being assembled inline in `route.ts`.
  - `apps/web/app/chat/page.tsx` now delegates turn-resolution and transport payload construction to `apps/web/app/chat/chatTransport.ts` instead of building the chat request inline.
- `apps/web/app/chat/page.tsx` now delegates chat result parsing, assistant-message assembly, draft-editor follow-up selection, and thread remap planning through `apps/web/app/chat/chatReplyState.ts`.
- Residual workspace/session/composer state in `page.tsx` is accepted migration debt after the Phase 2 boundary cleanup.
- Reduce the chat route to:
  - auth
  - workspace/thread ownership
  - normalization
  - runtime dispatch
  - persistence
  - response envelope
- Keep workflow signals in structured transport and eliminate hidden prompt-based routing if found.

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
  - route-level reply continuation generation now flows through `apps/web/lib/agent-v2/orchestrator/replyContinuationPlanner.ts`, while `apps/web/app/api/creator/v2/chat/route.reply.ts` remains the route-boundary wrapper for reply preflight parsing/default resolution, parse prompts, reply artifact shaping, and handled-reply persistence/finalization
  - reply and analysis currently use coach-style generation behind explicit executor seams rather than bespoke capability-specific generation logic
- Ban workflow reclassification inside executors.
- Keep and complete a shared executor contract:
  - `CapabilityExecutionRequest`
  - `CapabilityExecutionResult`
  - `RuntimeValidationResult`
  - `activeContextRefs` belongs here, not on the normalized turn

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
  - `apps/web/app/api/creator/v2/chat/route.replyFinalize.ts` now owns reply persistence, reply event dispatch, and final success-response assembly for handled reply turns
  - `apps/web/app/api/creator/v2/chat/route.reply.ts` now stays limited to reply turn state resolution, planning, and memory snapshot shaping, which keeps route-only side effects out of the reply planning helper without changing reply behavior or payloads
- Reply parse/planning moved under runtime ownership:
  - `apps/web/lib/agent-v2/orchestrator/replyTurnLogic.ts` now owns the pure reply parse/artifact helper logic, and `apps/web/lib/agent-v2/orchestrator/replyTurnPlanner.ts` now owns reply turn state resolution, planning, and memory snapshot shaping
  - `apps/web/app/api/creator/v2/chat/reply.logic.ts` and `apps/web/app/api/creator/v2/chat/route.reply.ts` now remain as thin route-facing re-export shims so the route surface stays stable while reply capability logic lives in the runtime layer
- Add merge rules so parallel workers cannot produce ambiguous state writes.
- Prohibit parallel writes to memory, artifacts, reply context, or thread state.

### Phase 5: Replace patching with validation and retry
- Add deterministic validators for:
  - truncation
  - prompt echo
  - artifact mismatch
  - thread/post shape mismatch
  - unsupported factual claims
- If validation fails, do one constrained repair/retry inside the same workflow.
- Keep cleanup helpers only as a last-resort surface guard.

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
- Standardize runtime trace output so tests and logs can assert:
  - workflow selected
  - source of decision
  - parallel workers invoked
  - validation result
  - persisted state changes
- Transitional note:
  - persisted state changes are not yet recorded in the runtime trace today

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
- Required capability eval coverage:
  - ideation quality
  - shortform draft quality
  - thread quality
  - reply quality
  - keep this visible as required coverage even if it is not yet a standalone gate family
- Executable gates today:
  - `pnpm run test:v2-route`
  - `pnpm run test:v2-orchestrator`
  - `pnpm run test:v2-response-quality`
  - `pnpm run test:v2-regressions`
  - `pnpm run test:v3-orchestrator`
  - `pnpm run test:transcript-replay`
  - `pnpm build`

## Assumptions and Defaults
- The right long-term pattern for Xpo is **not** fully parallel multi-agent routing; it is sequential orchestration with selective parallel workers.
- The user-facing UX should remain one natural chat surface.
- Massive reworks are acceptable if they improve correctness, evaluability, and long-term maintainability.
- Existing gains around transcript cleanup, handle isolation, memory salience, grounding separation, and reply ownership remain required invariants during the rework.
- `Artifact.md` and `LIVE_AGENT.md` should stay aligned to this plan while still calling out current migration debt explicitly.
