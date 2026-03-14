# Live Agent vNext Operator Handoff

## Mission
Xpo should behave like a strong ChatGPT-style growth assistant for X: natural conversation on the surface, deterministic workflow ownership underneath.

## Status language
- `target architecture` means the intended end state.
- `landed` means already true in code today.
- `migration debt` means transitional behavior that still exists and should be removed later.

## Official runtime pattern
- Control plane: sequential
- Worker plane: parallel only inside a chosen workflow

If a change violates that rule, it is probably the wrong change.

## Top-level workflow set
- `answer_question`
- `ideate`
- `plan_then_draft`
- `revise_draft`
- `reply_to_post`
- `analyze_post`

## Current transitional runtime flow
User turn
-> shared transport contract
-> turn normalization
-> runtime action resolution
-> chosen workflow executor
-> validation / retry
-> response shaping
-> route persistence / thread updates
-> API response

## Target control-plane ownership
- Transport contract
- Turn normalization
- Runtime action resolution
- Workflow dispatch
- Persistence
- Response envelope

## Transitional notes
- Current code still shapes the orchestrator response before route persistence and thread updates.
- `pipeline_continuation` in runtime traces is migration debt, not a steady-state owner.
- Runtime trace now carries persisted-state changes for route-boundary persistence on the main chat path, and reply finalization can reuse that same persistence trace patch when an upstream runtime trace already exists.
- Direct reply-preflight turns still do not synthesize a fake end-to-end runtime trace; that is intentional migration debt until reply entry shares the common runtime path.
- Backend structure cleanup for the active migration surface is now landed:
  - chat API route-boundary helpers live under `apps/web/app/api/creator/v2/chat/_lib/*`
  - workflow execution has real homes under `apps/web/lib/agent-v2/capabilities/*`
  - onboarding has real domain folders under `apps/web/lib/onboarding/{profile,analysis,strategy,pipeline,contracts,shared,store,sources}`
- Compatibility cleanup status:
  - chat route shim files are deleted; real route-boundary implementations now live only under `apps/web/app/api/creator/v2/chat/_lib/*`
  - onboarding root shims for `growthStrategy`, `agentContext`, `generationContract`, and `store` should be treated as migration seams only and deleted once their last consumers are migrated
- Phase 5 validation status:
  - draft, revision, reply, and analysis now all use deterministic delivery validation plus one constrained retry before safe fallback
  - shared conversational delivery validators live in `apps/web/lib/agent-v2/validators/shared/`
  - shared reply/analyze validation worker adapters live in `apps/web/lib/agent-v2/workers/validation/`
- As of 2026-03-14, the latest chat-client thinning pass focused on `apps/web/app/chat/page.tsx` and extracted the highest-ROI page-local state seams plus the inline draft preview card surface. The remaining follow-on from that pass is optional reassessment, not a required migration blocker.
- That same pass has now extracted route-private thread-history, source-materials, preferences, growth-guide, and analysis state/presentation seams, and `apps/web/app/chat/page.tsx` is down to roughly 5.7k lines instead of acting as a single giant mixed client surface.
- Chat-page-specific TypeScript regressions from that extraction are fixed; any remaining `pnpm exec tsc --noEmit` failures are currently outside `apps/web/app/chat/page.tsx`.
- As of 2026-03-14, the chat/pricing/login UI is also in an active frontend hygiene pass to follow better React composition, accessibility, and Vercel-style rendering practices without changing transport or backend behavior.
- The latest UI pass landed:
  - workspace-scoped feedback/source-material callback fixes in `apps/web/app/chat/page.tsx`
  - message-row extraction in `apps/web/app/chat/_features/thread-history/ChatMessageRow.tsx`
  - explicit draft-editor dock variants in `apps/web/app/chat/_features/draft-editor/DraftEditorDock.tsx`
  - semantic draft preview interaction cleanup in `apps/web/app/chat/_features/draft-editor/chatDraftPreviewCard.tsx`
  - a shared accessible dialog primitive in `apps/web/components/ui/dialog.tsx`, now used by `apps/web/app/chat/_dialogs/ObservedMetricsModal.tsx`
  - a semantic billing cadence control in `apps/web/app/pricing/_components/BillingCadenceToggle.tsx`
  - login label/focus cleanup in `apps/web/app/login/_components/LoginForm.tsx`
- When touching frontend code in this slice, explicitly use the installed skills:
  - `vercel-react-best-practices` for React/Next performance and state patterns
  - `vercel-composition-patterns` for component extraction and variant cleanup
  - `web-design-guidelines` for accessibility and interaction semantics

## Frontend operating model
- Keep route roots thin. In complex routes, only keep route entry files like `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, and route handlers at the route root.
- For `apps/web/app/chat`, do not add new feature-local state machines, modal bodies, or view-state selectors back into `page.tsx`; extend the existing route-private `_features/*` seams instead.
- Route-local implementation belongs in private folders:
  - `_features`
  - `_dialogs`
  - `_components`
  - `_hooks`
  - `_lib`
- Keep tests with the feature they cover unless the test is Playwright route coverage.
- Shared UI primitives belong in `apps/web/components/ui`.
- Frontend verification is now layered:
  - `pnpm run test:ui`
  - `pnpm run test:e2e`
  - keep `node:test` for pure state modules

## Backend/lib and API operating model
- Keep `apps/web/lib` domain-first and avoid adding broad catch-all helpers at the root of a domain.
- Inside `apps/web/lib/agent-v2`, prefer stable ownership boundaries:
  - `contracts/` for transport and shared external contracts
  - `runtime/` for workflow resolution, trace, and shared executor contracts
  - `core/` for pure policy and business logic
  - capability-sliced execution folders, worker folders, and validator folders as the long-term target for new runtime seams
  - `agents/` for model-facing prompt and generation workers
- Treat `apps/web/lib/agent-v2/orchestrator/` as transitional. It is still the migration home for many seams, but new work should not expand it casually when a more specific long-term folder is clear.
- Keep `apps/web/app/api` route roots thin:
  - `route.ts` is the entrypoint
  - route-boundary helpers own persistence, response assembly, and feature-local API wiring
  - workflow policy and validator policy belong in `apps/web/lib`, not in route modules
- When a route grows beyond an entrypoint, prefer focused route helpers or route-private folders over a larger flat route directory.

## Target folder map
### `apps/web/lib/agent-v2`
- `contracts/`: transport and externally shared contracts
- `runtime/`: workflow resolution, runtime trace, and shared executor contracts
- `core/`: pure reusable policy and business logic
- `memory/`: memory retrieval and salience/summary logic
- `agents/`: model-facing workers and prompt contracts
- `capabilities/ideation/`: ideation-only execution and helpers
- `capabilities/planning/`: planning-only execution and helpers
- `capabilities/drafting/`: drafting, bundle generation, and draft workflow composition
- `capabilities/revision/`: revising execution and revision-only helpers
- `capabilities/reply/`: reply execution, reply planning, and reply artifact logic
- `capabilities/analysis/`: analysis execution and analysis-only helpers
- `workers/context/`, `workers/retrieval/`, `workers/candidates/`, `workers/validation/`: read-only worker-plane helpers grouped by job
- `validators/draft/`, `validators/revision/`, `validators/shared/`: deterministic validators and retry-constraint builders
- `orchestrator/`: transitional control-plane composition only

### `apps/web/app/api/creator/v2/chat`
- route root:
  - `route.ts`
  - `welcome/route.ts`
- `_lib/normalization/`: turn normalization and request-to-runtime conversion
- `_lib/request/`: idempotency and route-only request helpers
- `_lib/persistence/`: route-boundary persistence helpers
- `_lib/response/`: response-envelope helpers
- `_lib/reply/`: reply finalization and reply-only route-boundary wiring
- `_tests/`: route-boundary integration coverage if root-level test files become noisy

### `apps/web/lib/onboarding`
- `profile/`: profile shaping, preview, hydration, and profile-conversion audit
- `analysis/`: post analysis, performance model, content insights, and evaluation
- `strategy/`: agent context, growth strategy, overrides, coach reply, and context enrichment
- `pipeline/`: onboarding run, backfill, and regression entrypoints
- `contracts/`: onboarding types, validation, generation contract, and draft validator
- `shared/`: draft artifacts and reusable mock data
- `store/`: onboarding run, scrape capture, and backfill-job persistence
- `sources/`: scrape/X ingestion and onboarding source resolution

## Current ownership boundaries
### Transport
- `apps/web/lib/agent-v2/contracts/chatTransport.ts`
- Landed:
  - `workspaceHandle`
  - `threadId`
  - `clientTurnId`
  - `turnSource`
  - `artifactContext`
  - literal `message`

### Turn normalization
- `apps/web/app/api/creator/v2/chat/_lib/normalization/turnNormalization.ts`
- Only place allowed to convert transport input into runtime-ready turn context.
- Landed responsibilities:
  - transcript-facing message
  - orchestration message
  - explicit intent normalization
  - `resolvedWorkflow`
  - `planSeedSource`
  - `replyHandlingBypassedReason`
  - `shouldAllowReplyHandling`
  - compatibility shims for `selectedAngle` and `selectedDraftContext`

### Runtime action resolution
- `apps/web/lib/agent-v2/runtime/resolveRuntimeAction.ts`
- First authoritative workflow resolver after normalization.
- Runtime contract and trace helpers live in:
  - `apps/web/lib/agent-v2/runtime/runtimeContracts.ts`
  - `apps/web/lib/agent-v2/runtime/runtimeTrace.ts`
- Current persistence trace contract adds:
  - `RuntimePersistedStateChanges`
  - `RuntimePersistenceTracePatch`
- If runtime trace source becomes `pipeline_continuation`, treat that as migration debt to remove, not the desired steady state.

### Route boundary
- `apps/web/app/api/creator/v2/chat/route.ts`
- Current reality:
  - still heavy
  - now owns final response-envelope finalization for the main chat path
  - now delegates sequential assistant-message persistence, memory/thread updates, and draft-candidate writes through `apps/web/app/api/creator/v2/chat/_lib/persistence/routePersistence.ts`
  - now delegates reply-turn response assembly, product-event planning, and final success-response packaging through `apps/web/app/api/creator/v2/chat/_lib/response/routeResponse.ts`
  - now merges `RuntimePersistenceTracePatch` into the in-memory `routingTrace` after route-boundary writes complete
  - still coordinates response shaping before persistence/thread updates
  - still carries more request assembly and reply-workflow control flow than the target architecture wants
- Target architecture ownership:
  - auth
  - workspace/thread ownership
  - turn normalization
  - runtime dispatch
  - persistence
  - response envelope
- Anything beyond that is migration debt.
- Route-structure guardrail:
  - keep route entrypoints readable and thin
  - add route-boundary helpers or route-private folders before adding more feature logic to `route.ts`
  - do not move capability logic out of `apps/web/lib` just because the route currently calls it

### Client boundary
- `apps/web/app/chat/page.tsx`
- Current reality:
  - main chat turn-resolution and transport payload construction now delegate through `apps/web/app/chat/_features/transport/chatTransport.ts`
  - main chat result parsing, assistant-message assembly, reply outcome planning, draft-editor follow-up selection, and thread remap planning now delegate through `apps/web/app/chat/_features/reply/chatReplyState.ts`
  - page-local client seams now delegate through dedicated helpers/modules:
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
    - inline preview presentation:
      - `apps/web/app/chat/_features/draft-editor/chatDraftPreviewCard.tsx`
    - UI primitives and presentational extraction:
      - `apps/web/app/chat/_features/thread-history/ChatMessageRow.tsx`
      - `apps/web/app/chat/_features/draft-editor/DraftEditorDock.tsx`
      - `apps/web/components/ui/dialog.tsx`
      - `apps/web/app/pricing/_components/BillingCadenceToggle.tsx`
  - the page is thin enough for the Phase 2 boundary cleanup, but not yet a fully ideal transport/view boundary
- Target architecture ownership:
  - view state
  - workspace selection state
  - transport helper calls
  - optimistic UI state only
- Anything beyond that is migration debt.

### Capability execution
- `apps/web/lib/agent-v2/orchestrator/draftPipeline.ts`
- Still transitional.
- Landed so far:
  - ideation now has a real capability home under `apps/web/lib/agent-v2/capabilities/ideation/`
  - initial planning now has a real capability home under `apps/web/lib/agent-v2/capabilities/planning/`
  - initial single-draft delivery now has a real capability home under `apps/web/lib/agent-v2/capabilities/drafting/`
  - targeted revision now has a real capability home under `apps/web/lib/agent-v2/capabilities/revision/`
  - the `reply_to_post` workflow now has a real capability home under `apps/web/lib/agent-v2/capabilities/reply/`
  - the `analyze_post` workflow now has a real capability home under `apps/web/lib/agent-v2/capabilities/analysis/`
- Remaining target executors:
  - none; named executor extraction is complete
- Adjacent migration debt outside `apps/web/lib/agent-v2/orchestrator/draftPipeline.ts`:
  - reply continuation generation, reply parsing/artifact shaping, and reply turn planning now live in `apps/web/lib/agent-v2/orchestrator/replyContinuationPlanner.ts`, `apps/web/lib/agent-v2/orchestrator/replyTurnLogic.ts`, and `apps/web/lib/agent-v2/orchestrator/replyTurnPlanner.ts`, while `apps/web/app/api/creator/v2/chat/_lib/reply/routeReplyFinalize.ts` owns reply finalization
  - reply and analysis still use coach-style generation behavior behind explicit executor seams

### Next backend slice
- Reply/analyze validation and retry is landed.
- The next backend-only product lane is deleting remaining safe compatibility shims and closing reply-path trace unification debt without re-growing flat roots or route entrypoints.
- Put new work in:
  - `apps/web/lib/agent-v2/capabilities/reply/`
  - `apps/web/lib/agent-v2/capabilities/analysis/`
  - `apps/web/lib/agent-v2/workers/validation/`
  - `apps/web/lib/agent-v2/validators/shared/`
  - route-private helpers only when the work is truly API-boundary wiring
- Do not put new feature logic back into:
  - `apps/web/lib/agent-v2/orchestrator/`
  - `apps/web/app/api/creator/v2/chat/route.ts`
  - the flat onboarding root

## Capability contract
- Shared capability types already landed in `apps/web/lib/agent-v2/runtime/runtimeContracts.ts`:
  - `CapabilityExecutionRequest`
  - `CapabilityExecutionResult`
  - `RuntimeValidationResult`
- `activeContextRefs` belongs to capability execution context, not the normalized turn.
- Named executor extraction is landed for ideation, planning, drafting, draft bundles, revising, replanning continuation, replying, and analysis; remaining migration debt is primarily adjacent route-level reply handling and coach-style reply/analysis internals.

## Concurrency rules
### Allowed in parallel
- retrieval
- style/profile loading
- source-material loading
- candidate generation
- validation/scoring

### Must remain sequential
- workflow resolution
- active draft/reply context mutation
- thread memory updates
- artifact persistence
- product-event logging
- final response envelope assembly

### Forbidden patterns
- multiple routers or heuristics classifying the same turn independently
- parallel writes to memory, artifacts, reply context, or thread state
- executors re-classifying the workflow they were handed
- client-side hidden prompts deciding workflow
- cleanup regexes standing in for validator + retry

## Folder-structure guardrails
- Do not grow `apps/web/lib/agent-v2/orchestrator/` as a permanent catch-all.
- Do not grow `apps/web/app/api/.../route.ts` as a permanent catch-all.
- New validator work should prefer validator-specific modules.
- New worker fan-out should prefer worker-specific modules.
- New capability-local helpers should live with the capability they support.
- Route-only persistence and response wiring should stay at the route boundary and not drift into shared runtime folders.
- When touching existing `orchestrator/*` or route-boundary helpers, move the touched seam toward the target folder map instead of creating another transitional bucket.

## Workflow invariants
- `recentHistory` is transcript-only.
- Structured UI actions must use `turnSource + artifactContext`.
- Reply parsing only runs on literal `free_text` turns.
- Explicit handle scope is authoritative.
- `planSeedMessage` lives in route/orchestrator context after normalization, not in transcript history.
- `contextPacket` remains machine-readable assistant state, not transcript content.
- Planner, writer, critic, reviser, and reply generation are workers, not routers.
- Voice grounding and factual grounding stay separate.
- Multi-handle isolation remains required behavior.

## Capability inventory
- Ideation:
  - `apps/web/lib/agent-v2/agents/ideator.ts`
- Planning:
  - `apps/web/lib/agent-v2/agents/planner.ts`
- Drafting:
  - `apps/web/lib/agent-v2/agents/writer.ts`
- Revising:
  - `apps/web/lib/agent-v2/agents/reviser.ts`
- Critique:
  - `apps/web/lib/agent-v2/agents/critic.ts`
- Reply / analysis helpers:
  - `apps/web/lib/agent-v2/orchestrator/replyTurnLogic.ts`
  - `apps/web/lib/agent-v2/orchestrator/replyTurnPlanner.ts`
  - `apps/web/lib/agent-v2/orchestrator/draftPipeline.ts`

## Debugging guide
### Routing and runtime traces
- Check normalized turn diagnostics first in `apps/web/app/api/creator/v2/chat/_lib/normalization/turnNormalization.ts`.
- Check runtime workflow resolution first in `apps/web/lib/agent-v2/runtime/resolveRuntimeAction.ts`.
- Check runtime contract and worker-summary shape first in:
  - `apps/web/lib/agent-v2/runtime/runtimeContracts.ts`
  - `apps/web/lib/agent-v2/runtime/runtimeTrace.ts`
- Check route-boundary persistence trace generation in:
  - `apps/web/app/api/creator/v2/chat/_lib/persistence/routePersistence.ts`
- Check where the persistence trace patch is merged in:
  - `apps/web/app/api/creator/v2/chat/route.ts`
  - `apps/web/app/api/creator/v2/chat/_lib/reply/routeReplyFinalize.ts`
- Only then inspect legacy routing paths in:
  - `apps/web/lib/agent-v2/orchestrator/routingPolicy.ts`
  - `apps/web/lib/agent-v2/orchestrator/conversationManager.ts`
- Treat those legacy routing paths as migration debt paths, not equal peers to the target runtime owner.

### Persistence workers that should appear
- `persist_assistant_message`
- `update_conversation_memory`
- `update_chat_thread`
- `create_draft_candidate`
- Candidate writes stay `mode: "parallel"` and share the `chat_route_persistence_draft_candidates` group id.

### Chat client thinning
- If you are debugging client-only chat behavior first inspect:
  - `apps/web/app/chat/_features/transport/chatTransport.ts`
  - `apps/web/app/chat/_features/reply/chatReplyState.ts`
  - `apps/web/app/chat/_features/workspace/chatWorkspaceState.ts`
  - `apps/web/app/chat/_features/composer/chatComposerState.ts`
  - `apps/web/app/chat/_features/draft-editor/chatDraftEditorState.ts`
  - `apps/web/app/chat/_features/draft-editor/chatDraftSessionState.ts`
  - `apps/web/app/chat/_features/draft-editor/chatDraftPersistenceState.ts`
  - `apps/web/app/chat/_features/draft-editor/chatDraftPreviewState.ts`
  - `apps/web/app/chat/_features/draft-editor/chatDraftActionState.ts`
  - `apps/web/app/chat/_features/thread-history/chatThreadHistoryState.ts`
  - `apps/web/app/chat/_features/workspace/chatWorkspaceLoadState.ts`
  - `apps/web/app/chat/_features/draft-editor/chatDraftPreviewCard.tsx`
- Reach for `apps/web/app/chat/page.tsx` after those helpers, because many of the highest-risk state transitions have been centralized already.

### Validation failures
- Check deterministic validation hooks in:
  - `apps/web/lib/agent-v2/orchestrator/draftPipeline.ts`
  - `apps/web/lib/agent-v2/orchestrator/claimChecker.ts`
  - `apps/web/lib/agent-v2/agents/critic.ts`

### Where worker fan-out already exists
- Initial context hydration fan-out now flows through:
  - `apps/web/lib/agent-v2/orchestrator/contextLoadWorkers.ts`
- The sequential merge/write owner remains:
  - `apps/web/lib/agent-v2/orchestrator/conversationManager.ts`
- Pre-routing style/profile + anchor hydration now flows through:
  - `apps/web/lib/agent-v2/orchestrator/turnContextHydrationWorkers.ts`
- The pre-routing merge/trace handoff remains:
  - `apps/web/lib/agent-v2/orchestrator/turnContextBuilder.ts`
  - `apps/web/lib/agent-v2/orchestrator/routingPolicy.ts`
- Novelty-input retrieval fan-out now flows through:
  - `apps/web/lib/agent-v2/orchestrator/historicalTextWorkers.ts`
- The in-workflow merge/trace handoff remains:
  - `apps/web/lib/agent-v2/orchestrator/draftPipeline.ts`
- Deterministic draft-guard validation fan-out now flows through:
  - `apps/web/lib/agent-v2/orchestrator/draftGuardValidationWorkers.ts`
- The retry/clarification merge owner remains:
  - `apps/web/lib/agent-v2/orchestrator/draftPipeline.ts`
- Initial draft-bundle candidate fan-out now flows through:
  - `apps/web/lib/agent-v2/orchestrator/draftBundleCandidateWorkers.ts`
- The sibling novelty retry/write owner remains:
  - `apps/web/lib/agent-v2/orchestrator/draftBundleExecutor.ts`
  - `apps/web/lib/agent-v2/orchestrator/draftPipeline.ts`
- Revision validation now flows through:
  - `apps/web/lib/agent-v2/orchestrator/revisionValidationWorkers.ts`
- The revision merge/write owner remains:
  - `apps/web/lib/agent-v2/orchestrator/revisingExecutor.ts`
- Worker-plane metadata rules are now standardized by:
  - `apps/web/lib/agent-v2/orchestrator/workerPlane.ts`
- Worker summaries are standardized by:
  - `apps/web/lib/agent-v2/runtime/runtimeTrace.ts`

## Do not regress
- Do not put structured assistant state back into transcript history.
- Do not let reply context survive non-reply workflows.
- Do not let handle-scoped context fall back across handles.
- Do not route vague fresh asks through stale topic summaries.
- Do not add more patch cleanup when the upstream issue belongs in workflow ownership or validator logic.
- Do not move extracted page-local state seams back into `apps/web/app/chat/page.tsx`.
- Do not change chat transport payload shape or route/orchestrator behavior as part of client-only page-thinning work.
- Do not collapse extracted UI primitives or semantic interaction fixes back into `apps/web/app/chat/page.tsx` just to move faster on visuals.
- Do use `vercel-react-best-practices`, `vercel-composition-patterns`, and `web-design-guidelines` when making frontend changes in `apps/web/app/chat`, `apps/web/app/pricing`, `apps/web/app/login`, or shared UI primitives.

## Test commands
### Gate families
- `pnpm run test:v2-route`
- `pnpm run test:v2-orchestrator`
- `pnpm run test:v2-response-quality`
- `pnpm run test:v2-regressions`
- `pnpm run test:v3-orchestrator`
- `pnpm run test:transcript-replay`
- `pnpm build`

### Targeted runtime checks
- `node --test --experimental-strip-types --experimental-specifier-resolution=node app/api/creator/v2/chat/turnNormalization.test.mjs`
- `node --test --experimental-strip-types --experimental-specifier-resolution=node lib/agent-v2/contracts/chatTransport.test.ts`
- `node --test --experimental-strip-types --experimental-specifier-resolution=node lib/agent-v2/runtime/resolveRuntimeAction.test.mjs`
- `node --test --experimental-strip-types --experimental-specifier-resolution=node lib/agent-v2/runtime/runtimeContracts.test.ts`

### Targeted chat-client checks
- `node --test --experimental-strip-types --experimental-specifier-resolution=node app/chat/_features/reply/chatReplyState.test.ts`
- `node --test --experimental-strip-types --experimental-specifier-resolution=node app/chat/_features/workspace/chatWorkspaceState.test.ts`
- `node --test --experimental-strip-types --experimental-specifier-resolution=node app/chat/_features/composer/chatComposerState.test.ts`
- `node --test --experimental-strip-types --experimental-specifier-resolution=node app/chat/_features/draft-editor/chatDraftEditorState.test.ts`
- `node --test --experimental-strip-types --experimental-specifier-resolution=node app/chat/_features/draft-editor/chatDraftSessionState.test.ts`
- `node --test --experimental-strip-types --experimental-specifier-resolution=node app/chat/_features/draft-editor/chatDraftPersistenceState.test.ts`
- `node --test --experimental-strip-types --experimental-specifier-resolution=node app/chat/_features/draft-editor/chatDraftPreviewState.test.ts`
- `node --test --experimental-strip-types --experimental-specifier-resolution=node app/chat/_features/draft-editor/chatDraftActionState.test.ts`
- `node --test --experimental-strip-types --experimental-specifier-resolution=node app/chat/_features/thread-history/chatThreadHistoryState.test.ts`
- `node --test --experimental-strip-types --experimental-specifier-resolution=node app/chat/_features/workspace/chatWorkspaceLoadState.test.ts`
- `pnpm run test:ui`
- `pnpm run test:e2e:list`

## Manual QA checklist
### Ideation to draft
1. Type `write a post`
2. pick one ideation direction
3. confirm direct draft, not reply workflow

### Draft revision
1. revise with `Shorter`
2. click `Turn into Thread`
3. confirm it stays in draft revision flow

### Pasted post without reply ask
1. paste a real X post
2. ask for diagnosis, analysis, or angle help without asking for a reply
3. confirm the assistant does not jump straight into reply drafting

### Reply isolation
1. paste a real X post
2. ask for a reply
3. then type `write a post`
4. confirm reply state does not hijack drafting

### Clarification continuity
1. correct a wrong assumption in a draft
2. answer the follow-up clarification
3. confirm the assistant continues instead of going silent

### Topic switch after active context
1. create an active draft or reply context
2. ask for a completely different topic or post
3. confirm stale context does not hijack the new workflow

### Multi-handle isolation
1. open two attached handles in two tabs
2. draft on handle A
3. switch the other tab to handle B
4. confirm handle A does not inherit handle B context

## Required automated scenarios
- duplicate `clientTurnId`
- multi-tab same-profile different-handle isolation
- reply workflow not hijacking non-reply turns
- no double-write behavior from worker fan-out
- reply route shim files stay absent while route-internal consumers import runtime-owned reply modules directly
- keep ideation, shortform draft, thread, and reply eval coverage visible even when not promoted to standalone gate families

## Next structural targets
- Phase 4 worker-plane cleanup is complete; use the explicit sibling-novelty retry trace, the route no-double-write regression, the reply seam-audit regression, and the new persistence-trace regressions as guardrails against ownership drift
- Do not reintroduce route-local reply shims or let reply capability logic drift back out of `apps/web/lib/agent-v2/orchestrator/`
- Revisit residual route/client migration debt only when it blocks later runtime rollout, reply-path trace unification, Phase 5 validation work, or broader Phase 6 deletion work
