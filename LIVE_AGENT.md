# Live Agent vNext Operator Handoff

## Mission
Xpo should behave like a strong ChatGPT-style growth assistant for X: natural conversation on the surface, deterministic workflow ownership underneath.

## Official runtime pattern
- Control plane: sequential
- Worker plane: parallel only inside a chosen workflow

If a change violates that rule, it is probably the wrong change.

## Runtime map
User turn  
→ shared transport contract  
→ turn normalization  
→ runtime action resolution  
→ chosen workflow executor  
→ validation / retry  
→ response envelope  
→ persistence

## Current ownership boundaries
### Transport
- [apps/web/lib/agent-v2/contracts/chatTransport.ts](/Users/shernanjavier/Projects/stanley-x-mvp/apps/web/lib/agent-v2/contracts/chatTransport.ts)
- Owns:
  - `workspaceHandle`
  - `threadId`
  - `clientTurnId`
  - `turnSource`
  - `artifactContext`
  - literal `message`

### Turn normalization
- [apps/web/app/api/creator/v2/chat/turnNormalization.ts](/Users/shernanjavier/Projects/stanley-x-mvp/apps/web/app/api/creator/v2/chat/turnNormalization.ts)
- Only place allowed to convert transport input into runtime-ready turn context.
- Owns:
  - transcript-facing message
  - orchestration message
  - explicit intent normalization
  - reply eligibility
  - compatibility shims for `selectedAngle` and `selectedDraftContext`

### Runtime action resolution
- [apps/web/lib/agent-v2/runtime/resolveRuntimeAction.ts](/Users/shernanjavier/Projects/stanley-x-mvp/apps/web/lib/agent-v2/runtime/resolveRuntimeAction.ts)
- First authoritative workflow resolver.
- Runtime contract lives in:
  - [apps/web/lib/agent-v2/runtime/runtimeContracts.ts](/Users/shernanjavier/Projects/stanley-x-mvp/apps/web/lib/agent-v2/runtime/runtimeContracts.ts)
  - [apps/web/lib/agent-v2/runtime/runtimeTrace.ts](/Users/shernanjavier/Projects/stanley-x-mvp/apps/web/lib/agent-v2/runtime/runtimeTrace.ts)

### Route boundary
- [apps/web/app/api/creator/v2/chat/route.ts](/Users/shernanjavier/Projects/stanley-x-mvp/apps/web/app/api/creator/v2/chat/route.ts)
- Intended final ownership:
  - auth
  - workspace/thread ownership
  - turn normalization
  - runtime dispatch
  - persistence
  - response envelope
- Anything beyond that is migration debt.

### Capability execution
- [apps/web/lib/agent-v2/orchestrator/draftPipeline.ts](/Users/shernanjavier/Projects/stanley-x-mvp/apps/web/lib/agent-v2/orchestrator/draftPipeline.ts)
- Still transitional.
- Long-term target is separate executors for:
  - ideation
  - planning
  - drafting
  - revising
  - replying
  - analysis

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
- parallel writes to memory or thread state
- executors re-classifying the workflow they were handed
- client-side hidden prompts deciding workflow
- cleanup regexes standing in for validator + retry

## Workflow invariants
- `recentHistory` is transcript-only.
- Structured UI actions must use `turnSource + artifactContext`.
- Reply parsing only runs on literal `free_text` turns.
- Explicit handle scope is authoritative.
- `contextPacket` remains machine-readable assistant state, not transcript content.
- Planner, writer, critic, reviser, and reply generation are workers, not routers.
- Voice grounding and factual grounding stay separate.

## Capability inventory
- Ideation:
  - [apps/web/lib/agent-v2/agents/ideator.ts](/Users/shernanjavier/Projects/stanley-x-mvp/apps/web/lib/agent-v2/agents/ideator.ts)
- Planning:
  - [apps/web/lib/agent-v2/agents/planner.ts](/Users/shernanjavier/Projects/stanley-x-mvp/apps/web/lib/agent-v2/agents/planner.ts)
- Drafting:
  - [apps/web/lib/agent-v2/agents/writer.ts](/Users/shernanjavier/Projects/stanley-x-mvp/apps/web/lib/agent-v2/agents/writer.ts)
- Revising:
  - [apps/web/lib/agent-v2/agents/reviser.ts](/Users/shernanjavier/Projects/stanley-x-mvp/apps/web/lib/agent-v2/agents/reviser.ts)
- Critique:
  - [apps/web/lib/agent-v2/agents/critic.ts](/Users/shernanjavier/Projects/stanley-x-mvp/apps/web/lib/agent-v2/agents/critic.ts)
- Reply / analysis helpers:
  - [apps/web/app/api/creator/v2/chat/reply.logic.ts](/Users/shernanjavier/Projects/stanley-x-mvp/apps/web/app/api/creator/v2/chat/reply.logic.ts)
  - [apps/web/lib/agent-v2/orchestrator/draftPipeline.ts](/Users/shernanjavier/Projects/stanley-x-mvp/apps/web/lib/agent-v2/orchestrator/draftPipeline.ts)

## Debugging guide
### Routing and runtime traces
- Check normalized turn diagnostics in:
  - [apps/web/app/api/creator/v2/chat/turnNormalization.ts](/Users/shernanjavier/Projects/stanley-x-mvp/apps/web/app/api/creator/v2/chat/turnNormalization.ts)
- Check runtime resolution and trace shape in:
  - [apps/web/lib/agent-v2/orchestrator/routingPolicy.ts](/Users/shernanjavier/Projects/stanley-x-mvp/apps/web/lib/agent-v2/orchestrator/routingPolicy.ts)
  - [apps/web/lib/agent-v2/orchestrator/conversationManager.ts](/Users/shernanjavier/Projects/stanley-x-mvp/apps/web/lib/agent-v2/orchestrator/conversationManager.ts)

### Validation failures
- Check deterministic validation hooks in:
  - [apps/web/lib/agent-v2/orchestrator/draftPipeline.ts](/Users/shernanjavier/Projects/stanley-x-mvp/apps/web/lib/agent-v2/orchestrator/draftPipeline.ts)
  - [apps/web/lib/agent-v2/orchestrator/claimChecker.ts](/Users/shernanjavier/Projects/stanley-x-mvp/apps/web/lib/agent-v2/orchestrator/claimChecker.ts)
  - [apps/web/lib/agent-v2/agents/critic.ts](/Users/shernanjavier/Projects/stanley-x-mvp/apps/web/lib/agent-v2/agents/critic.ts)

### Where worker fan-out already exists
- Initial context hydration fan-out currently happens in:
  - [apps/web/lib/agent-v2/orchestrator/conversationManager.ts](/Users/shernanjavier/Projects/stanley-x-mvp/apps/web/lib/agent-v2/orchestrator/conversationManager.ts)
- Worker summaries are standardized by:
  - [apps/web/lib/agent-v2/runtime/runtimeTrace.ts](/Users/shernanjavier/Projects/stanley-x-mvp/apps/web/lib/agent-v2/runtime/runtimeTrace.ts)

## Do not regress
- Do not put structured assistant state back into transcript history.
- Do not let reply context survive non-reply workflows.
- Do not let handle-scoped context fall back across handles.
- Do not route vague fresh asks through stale topic summaries.
- Do not add more patch cleanup when the upstream issue belongs in workflow ownership or validator logic.

## Test commands
- `node --test --experimental-strip-types --experimental-specifier-resolution=node app/api/creator/v2/chat/route.test.mjs`
- `node --test --experimental-strip-types --experimental-specifier-resolution=node app/api/creator/v2/chat/turnNormalization.test.mjs`
- `node --test --experimental-strip-types --experimental-specifier-resolution=node lib/agent-v2/contracts/chatTransport.test.ts`
- `node --test --experimental-strip-types --experimental-specifier-resolution=node lib/agent-v2/runtime/resolveRuntimeAction.test.mjs`
- `node --test --experimental-strip-types --experimental-specifier-resolution=node lib/agent-v2/runtime/runtimeContracts.test.ts`
- `pnpm run test:v2-orchestrator`
- `pnpm run test:v2-response-quality`
- `pnpm run test:v3-orchestrator`
- `pnpm build`

## Manual QA checklist
### Ideation to draft
1. Type `write a post`
2. pick one ideation direction
3. confirm direct draft, not reply workflow

### Draft revision
1. revise with `Shorter`
2. click `Turn into Thread`
3. confirm it stays in draft revision flow

### Reply isolation
1. paste a real X post
2. ask for a reply
3. then type `write a post`
4. confirm reply state does not hijack drafting

### Clarification continuity
1. correct a wrong assumption in a draft
2. answer the follow-up clarification
3. confirm the assistant continues instead of going silent

### Multi-handle isolation
1. open two attached handles in two tabs
2. draft on handle A
3. switch the other tab to handle B
4. confirm handle A does not inherit handle B context

## Next structural targets
- Thin [apps/web/app/chat/page.tsx](/Users/shernanjavier/Projects/stanley-x-mvp/apps/web/app/chat/page.tsx)
- Thin [apps/web/app/api/creator/v2/chat/route.ts](/Users/shernanjavier/Projects/stanley-x-mvp/apps/web/app/api/creator/v2/chat/route.ts)
- Split [apps/web/lib/agent-v2/orchestrator/draftPipeline.ts](/Users/shernanjavier/Projects/stanley-x-mvp/apps/web/lib/agent-v2/orchestrator/draftPipeline.ts)
