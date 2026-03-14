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
- Runtime trace currently standardizes normalized turn, runtime resolution, worker summary, and validations, but not persisted state changes yet.

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
- `apps/web/app/api/creator/v2/chat/turnNormalization.ts`
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
- If runtime trace source becomes `pipeline_continuation`, treat that as migration debt to remove, not the desired steady state.

### Route boundary
- `apps/web/app/api/creator/v2/chat/route.ts`
- Current reality:
  - still heavy
  - now owns final response-envelope finalization for the main chat path
  - now delegates sequential assistant-message persistence, memory/thread updates, and draft-candidate writes through `apps/web/app/api/creator/v2/chat/route.persistence.ts`
  - still coordinates response shaping before persistence/thread updates
  - still carries more request assembly, reply-branch assembly, billing, and event wiring than the target architecture wants
- Target architecture ownership:
  - auth
  - workspace/thread ownership
  - turn normalization
  - runtime dispatch
  - persistence
  - response envelope
- Anything beyond that is migration debt.

### Capability execution
- `apps/web/lib/agent-v2/orchestrator/draftPipeline.ts`
- Still transitional.
- Long-term target is separate executors for:
  - ideation
  - planning
  - drafting
  - revising
  - replying
  - analysis

## Capability contract
- Shared capability types already landed in `apps/web/lib/agent-v2/runtime/runtimeContracts.ts`:
  - `CapabilityExecutionRequest`
  - `CapabilityExecutionResult`
  - `RuntimeValidationResult`
- `activeContextRefs` belongs to capability execution context, not the normalized turn.
- Executor extraction remains migration debt until ideation, planning, drafting, revising, replying, and analysis run through dedicated executors cleanly.

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
  - `apps/web/app/api/creator/v2/chat/reply.logic.ts`
  - `apps/web/lib/agent-v2/orchestrator/draftPipeline.ts`

## Debugging guide
### Routing and runtime traces
- Check normalized turn diagnostics first in `apps/web/app/api/creator/v2/chat/turnNormalization.ts`.
- Check runtime workflow resolution first in `apps/web/lib/agent-v2/runtime/resolveRuntimeAction.ts`.
- Check runtime contract and worker-summary shape first in:
  - `apps/web/lib/agent-v2/runtime/runtimeContracts.ts`
  - `apps/web/lib/agent-v2/runtime/runtimeTrace.ts`
- Only then inspect legacy routing paths in:
  - `apps/web/lib/agent-v2/orchestrator/routingPolicy.ts`
  - `apps/web/lib/agent-v2/orchestrator/conversationManager.ts`
- Treat those legacy routing paths as migration debt paths, not equal peers to the target runtime owner.

### Validation failures
- Check deterministic validation hooks in:
  - `apps/web/lib/agent-v2/orchestrator/draftPipeline.ts`
  - `apps/web/lib/agent-v2/orchestrator/claimChecker.ts`
  - `apps/web/lib/agent-v2/agents/critic.ts`

### Where worker fan-out already exists
- Initial context hydration fan-out currently happens in:
  - `apps/web/lib/agent-v2/orchestrator/conversationManager.ts`
- Worker summaries are standardized by:
  - `apps/web/lib/agent-v2/runtime/runtimeTrace.ts`

## Do not regress
- Do not put structured assistant state back into transcript history.
- Do not let reply context survive non-reply workflows.
- Do not let handle-scoped context fall back across handles.
- Do not route vague fresh asks through stale topic summaries.
- Do not add more patch cleanup when the upstream issue belongs in workflow ownership or validator logic.

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
- keep ideation, shortform draft, thread, and reply eval coverage visible even when not promoted to standalone gate families

## Next structural targets
- Thin `apps/web/app/chat/page.tsx`
- Continue thinning `apps/web/app/api/creator/v2/chat/route.ts`
- Split `apps/web/lib/agent-v2/orchestrator/draftPipeline.ts`
