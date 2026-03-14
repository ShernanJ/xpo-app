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
  - targeted draft revision now runs through `apps/web/lib/agent-v2/orchestrator/revisingExecutor.ts`, with `draftPipeline.ts` consuming the returned response seed, memory patch, validation metadata, and worker trace metadata for edit/review turns.
  - the `reply_to_post` workflow now runs through `apps/web/lib/agent-v2/orchestrator/replyingExecutor.ts`, with `draftPipeline.ts` consuming the returned response seed and memory patch instead of routing reply workflow turns straight through the generic coach handler.
  - the `analyze_post` workflow now runs through `apps/web/lib/agent-v2/orchestrator/analysisExecutor.ts`, with `draftPipeline.ts` consuming the returned response seed and memory patch instead of routing analysis workflow turns straight through the generic coach handler.
- Break `draftPipeline.ts` into capability executors:
  - named executor extraction is complete for ideation, planning, drafting, revising, replying, and analysis
- Migration debt inside Phase 3:
  - multi-draft bundle generation still lives inline in `apps/web/lib/agent-v2/orchestrator/draftPipeline.ts`
  - plan-to-draft fallback and replanning branches inside revision/edit flows are still inline in `apps/web/lib/agent-v2/orchestrator/draftPipeline.ts`
  - route-level reply artifact generation and continuation still live outside `apps/web/lib/agent-v2/orchestrator/draftPipeline.ts`
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
