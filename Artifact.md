# Agent Runtime vNext Program Board

## Status
- Program: `Agent Runtime vNext`
- Design pattern: `Sequential Control Plane, Parallel Worker Plane`
- Migration style: staged strangler
- Last updated: 2026-03-13
- Current slice: Phase 1 control-plane hardening in progress

## Why this rework exists
The app is now bottlenecked by infrastructure, not prompt tweaks.

Current hotspots:
- [apps/web/app/chat/page.tsx](/Users/shernanjavier/Projects/stanley-x-mvp/apps/web/app/chat/page.tsx) is still a large client monolith that mixes transport, local workflow state, and presentation.
- [apps/web/app/api/creator/v2/chat/route.ts](/Users/shernanjavier/Projects/stanley-x-mvp/apps/web/app/api/creator/v2/chat/route.ts) is still too heavy as a route boundary.
- [apps/web/lib/agent-v2/orchestrator/draftPipeline.ts](/Users/shernanjavier/Projects/stanley-x-mvp/apps/web/lib/agent-v2/orchestrator/draftPipeline.ts) still owns too many capabilities and too much continuation logic.

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

## Current invariants
- `recentHistory` stays transcript-only.
- Structured UI actions must travel as `turnSource + artifactContext`.
- Explicit `workspaceHandle` is authoritative for creator/chat scope.
- Reply parsing only runs on literal `free_text` turns.
- Planner, writer, critic, reviser, and reply generation are capability workers, not peer routers.
- Voice grounding and factual grounding stay separated.
- Multi-handle isolation remains required behavior.

## Phase board
### Phase 0: Program reset
- Rewrite [Artifact.md](/Users/shernanjavier/Projects/stanley-x-mvp/Artifact.md) and [LIVE_AGENT.md](/Users/shernanjavier/Projects/stanley-x-mvp/LIVE_AGENT.md) into migration docs instead of patch logs.
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
- Status: in progress.
- Landed:
  - [apps/web/lib/agent-v2/contracts/chatTransport.ts](/Users/shernanjavier/Projects/stanley-x-mvp/apps/web/lib/agent-v2/contracts/chatTransport.ts)
  - [apps/web/lib/agent-v2/runtime/resolveRuntimeAction.ts](/Users/shernanjavier/Projects/stanley-x-mvp/apps/web/lib/agent-v2/runtime/resolveRuntimeAction.ts)
  - [apps/web/lib/agent-v2/runtime/runtimeContracts.ts](/Users/shernanjavier/Projects/stanley-x-mvp/apps/web/lib/agent-v2/runtime/runtimeContracts.ts)
  - [apps/web/lib/agent-v2/runtime/runtimeTrace.ts](/Users/shernanjavier/Projects/stanley-x-mvp/apps/web/lib/agent-v2/runtime/runtimeTrace.ts)

### Phase 2: Thin the client and route
- Move transport/request construction out of [page.tsx](/Users/shernanjavier/Projects/stanley-x-mvp/apps/web/app/chat/page.tsx) into a dedicated chat transport layer plus workspace store.
- Reduce [route.ts](/Users/shernanjavier/Projects/stanley-x-mvp/apps/web/app/api/creator/v2/chat/route.ts) to auth, ownership checks, normalization, runtime dispatch, persistence, and response envelope assembly.
- Status: not started.

### Phase 3: Split capability execution
- Break [draftPipeline.ts](/Users/shernanjavier/Projects/stanley-x-mvp/apps/web/lib/agent-v2/orchestrator/draftPipeline.ts) into capability executors:
  - ideation
  - planning
  - drafting
  - revising
  - replying
  - analysis
- Ban workflow reclassification inside executors.
- Status: not started.

### Phase 4: Formalize the parallel worker plane
- Allow worker fan-out only for retrieval, source-material loading, style/profile loading, candidate generation, and validation/scoring.
- Add merge rules for worker outputs.
- Prohibit ambiguous side effects from worker fan-out.
- Status: not started.

### Phase 5: Validation and retry
- Add deterministic validators for truncation, prompt echo, artifact mismatch, thread/post shape mismatch, and unsupported factual claims.
- Retry once inside the same workflow before any surface cleanup.
- Status: not started.

### Phase 6: Rollout and deletion
- Migrate workflow families in order:
  1. ideation + draft
  2. revision
  3. reply + analyze
- Delete compatibility shims and duplicate routing only when each family is green under vNext.
- Status: not started.

## Acceptance gates
- `node --test --experimental-strip-types --experimental-specifier-resolution=node app/api/creator/v2/chat/route.test.mjs`
- `node --test --experimental-strip-types --experimental-specifier-resolution=node app/api/creator/v2/chat/turnNormalization.test.mjs`
- `node --test --experimental-strip-types --experimental-specifier-resolution=node lib/agent-v2/contracts/chatTransport.test.ts`
- `node --test --experimental-strip-types --experimental-specifier-resolution=node lib/agent-v2/runtime/resolveRuntimeAction.test.mjs`
- `node --test --experimental-strip-types --experimental-specifier-resolution=node lib/agent-v2/runtime/runtimeContracts.test.ts`
- `pnpm run test:v2-orchestrator`
- `pnpm run test:v2-response-quality`
- `pnpm run test:v3-orchestrator`
- `pnpm build`

## Active blockers and risks
- [page.tsx](/Users/shernanjavier/Projects/stanley-x-mvp/apps/web/app/chat/page.tsx) still owns too much request and workspace logic.
- [route.ts](/Users/shernanjavier/Projects/stanley-x-mvp/apps/web/app/api/creator/v2/chat/route.ts) still owns too much workflow and persistence assembly.
- [draftPipeline.ts](/Users/shernanjavier/Projects/stanley-x-mvp/apps/web/lib/agent-v2/orchestrator/draftPipeline.ts) still mixes generation, continuation, grounding, revision, and salvage logic.
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
