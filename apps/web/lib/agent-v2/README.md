# `lib/agent-v2`

This folder is the heart of the AI product. It is not a single prompt or a single agent. It is a layered runtime that takes a chat turn, chooses exactly one workflow owner, runs the needed support workers, executes the selected capability, validates the result, and returns structured output to the route layer.

## Read This First

If you want the shortest path to understanding the runtime, read in this order:

1. `contracts/chatTransport.ts`
2. `contracts/turnContract.ts`
3. `runtime/turnContextBuilder.ts`
4. `runtime/routingPolicy.ts`
5. `runtime/resolveRuntimeAction.ts`
6. `runtime/draftPipeline.ts`
7. the relevant folder under `capabilities/`

If you are debugging a live `/api/creator/v2/chat` turn, also read:

1. `app/api/creator/v2/chat/_lib/normalization/turnNormalization.ts`
2. `app/api/creator/v2/chat/_lib/request/routePreflight.ts`
3. `app/api/creator/v2/chat/_lib/persistence/routePersistence.ts`

## Mental Model

Think of `agent-v2` as seven layers:

1. `contracts/`: request and response semantics
2. `runtime/`: turn assembly, workflow choice, tracing, response packaging
3. `workers/`: parallel read-only support work
4. `capabilities/`: workflow-specific execution owners
5. `agents/`: model-facing generators and extractors
6. `responses/`: deterministic response shaping and repair
7. `memory/`, `grounding/`, and `core/`: durable state, factual constraints, and reusable policy

The most important rule is:

- one turn gets one top-level workflow owner
- parallelism is for support work, not for competing workflow selection

## What This Folder Owns

- turn-level AI orchestration for chat
- workflow resolution for answers, ideation, planning/drafting, revision, replies, and analysis
- structured routing traces and worker/validation traces
- conversation memory state and scoped-memory behavior
- grounding against source materials, creator hints, and anti-fabrication rules
- deterministic response shaping before route persistence

It does not own:

- auth
- billing policy
- onboarding capture itself
- route-level request parsing/persistence boundaries

## Folder Guide

### `contracts/`

Defines the runtime contracts shared between client, route, and orchestration code.

Read this when:

- you want to know what the client can explicitly signal
- you need to understand `turnSource`, `artifactContext`, memory shape, or output shape

### `runtime/`

This is the control plane.

Key responsibilities:

- build `TurnContext`
- resolve routing policy
- choose exactly one `AgentRuntimeWorkflow`
- maintain `RoutingTrace`
- centralize worker and validation metadata
- package the final response envelope

Start here if you need the high-level lifecycle of a turn.

### `capabilities/`

These folders are the workflow owners after routing is complete.

Current workflow map:

- `ideation/`: ideas menu generation
- `planning/`: clarification, plan mode, pending-plan flows
- `drafting/`: first-draft generation, bundles, grounded retry
- `revision/`: edit/review flows and semantic repair
- `reply/`: reply workflows and reply state
- `analysis/`: post-analysis workflows

Start here if you already know which product behavior is wrong.

### `agents/`

Model-facing specialist modules.

Examples:

- `controller.ts`
- `planner.ts`
- `writer.ts`
- `critic.ts`
- `reviser.ts`
- `coach.ts`
- `styleExtractor.ts`
- `factExtractor.ts`
- `antiPatternExtractor.ts`
- `llm.ts`

Important:

- these are workers used by the runtime
- they are not peer routers that should all decide a turn independently

### `workers/`

Read-only support fan-out that can run in parallel.

Examples:

- style profile and anchor hydration
- source-material loading
- historical post and draft loading
- validation workers

Use this folder when you need to understand how the runtime gathers extra context without changing ownership of the turn.

### `memory/`

Persistent conversation state for the AI runtime.

This is not just transcript storage. It tracks:

- conversation state
- active constraints
- pending plan
- active draft refs
- clarification state
- reply state
- preferred surface mode

If the app feels like it "forgot" or "stayed stuck" in the wrong mode, read here.

### `grounding/`

Controls what the assistant is allowed to say and what context it can use.

Examples:

- source materials
- creator profile hints
- no-fabrication constraints
- draft and plan grounding rules
- preference grounding

If the assistant is making unsupported claims or missing obvious user facts, start here.

### `responses/`

Deterministic response shaping after capability execution.

Examples:

- quick replies
- correction repair
- draft reply packaging
- feedback memory notices

Use this folder when the raw capability output seems fine but the final message shown to the user feels wrong.

### `core/`

Reusable deterministic policy and business logic.

Examples:

- style profile generation
- retrieval
- novelty policy
- preference constraints
- voice target selection

### `runtime/`

This folder is the control plane and execution spine.

Current reality:

- workflow selection, dispatch, tracing, and response packaging all live here
- the old `orchestrator/` folder has been dissolved; deletion guards now live in runtime ownership tests

Practical advice:

- for workflow choice, start in `runtime/`
- for capability dispatch and execution branching, read `runtime/draftPipeline.ts`

## Turn Lifecycle

The internal lifecycle is:

1. receive `OrchestratorInput`
2. build `TurnContext`
3. load or create memory
4. scope memory to the current turn
5. hydrate style profile and retrieval anchors
6. resolve routing policy
7. resolve exactly one workflow
8. run `runtime/draftPipeline.ts`
9. fan out to extra workers as needed
10. delegate to the chosen capability
11. merge worker and validation trace metadata
12. update memory through runtime policy
13. return raw response plus routing trace to the route layer

## Fast Debug Map

If the wrong workflow was chosen:

- `runtime/routingPolicy.ts`
- `runtime/resolveRuntimeAction.ts`
- route normalization in `app/api/creator/v2/chat/_lib/normalization/turnNormalization.ts`

If the workflow is right but the output quality is bad:

- relevant `capabilities/*`
- `agents/*`
- `workers/validation/*`
- `grounding/*`

If the runtime forgot prior context:

- `memory/memoryStore.ts`
- `memory/turnScopedMemory.ts`
- `memory/contextRetriever.ts`
- `runtime/memoryPolicy.ts`

If the final response shape looks off:

- `responses/*`
- `runtime/responseEnvelope.ts`
- `runtime/responseShaper.ts`

If reply flows are confusing:

- `capabilities/reply/*`
- route-side reply helpers in `app/api/creator/v2/chat/_lib/reply/*`

## Current Hotspot Watchlist

The folder split is landed, but a few files still carry enough breadth that they should be watched before they become the next migration problem.

- `runtime/draftPipeline.ts`
  - still the biggest shared execution spine in the control plane
  - acceptable as the runtime dispatch hub, but it should not absorb new workflow-local heuristics or response copy
- `grounding/sourceMaterials.ts`
  - owns a lot of source-material selection, filtering, shaping, and persistence-adjacent logic
  - good candidate for a future split if source-material behavior keeps growing
- `capabilities/reply/replyContinuationPlanner.ts`
  - large reply-specific state and continuity logic
  - should stay reply-local, but may eventually deserve smaller reply-state and prompt-planning helpers
- `responses/correctionRepair.ts`, `responses/draftReply.ts`, and `responses/clarificationDraftChips.ts`
  - these are now in the correct domain, but they are large enough to drift into catch-all response logic if left unchecked
- `welcomeMessage.ts`
  - still sits at the top level instead of in a clearer product-facing home
  - worth relocating if that surface changes again

Test files can also look large without being ownership problems. In particular:

- `runtime/conversationManager.test.mjs`
- `responseQuality.test.mjs`

These are intentionally broad guard suites and are not architectural hotspots in the same way as the runtime source files above.

## Recommended Next Cleanup Order

If we keep refining `agent-v2`, the highest-signal follow-on order is:

1. keep `runtime/draftPipeline.ts` narrow and split only when a new shared control-plane seam becomes obvious
2. split `grounding/sourceMaterials.ts` if source-material policies or serialization rules grow further
3. split large reply or response helpers only inside their current domains, not by creating new top-level buckets
4. keep `workers/` read-only and resist moving workflow policy back into runtime helpers
5. treat any new top-level `agent-v2/*.ts` file as suspicious unless it is clearly a stable entrypoint

## Important Types

These types explain the architecture faster than reading prompts:

- `OrchestratorInput`
- `TurnContext`
- `RoutingTrace`
- `AgentRuntimeWorkflow`
- `CapabilityExecutionRequest`
- `CapabilityExecutionResult`
- `RuntimeWorkerExecution`
- `RuntimeValidationResult`

## For Humans And Agents

When editing here:

- keep the control plane sequential
- keep workers read-only when parallel
- keep capability ownership explicit
- avoid adding new "magic" routing through prompt text alone
- prefer adding behavior in the correct layer instead of growing `draftPipeline.ts` or scattering logic across unrelated folders
