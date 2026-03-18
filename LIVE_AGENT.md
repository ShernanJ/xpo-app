# Live Agent Operator Handoff

Last updated: 2026-03-18

## Mission
Keep `agent-v2` feeling like one natural assistant on the surface while staying deterministic, durable, and cost-aware underneath.

## Landed Now
- Deterministic routing owns structured UI turns and short artifact continuations.
- The legacy classifier path is removed.
- Shared model tiers and structured-output repair live in `apps/web/lib/agent-v2/agents/llm.ts`.
- Workflow-scoped prompt context is active for planning, ideation, drafting, coaching, and revision.
- Safe progress stages are flattened and sanitized.
- Queued execution is implemented behind `CHAT_TURN_EXECUTION_MODE`.
- The Prisma lease worker remains the only durable execution backend.
- Turn-status polling is visibility-aware and jittered.
- Draft, revision, reply, and analysis traces expose two-attempt metadata.

## Partial Or Transitional
- `inline` execution is still the safe local/dev/test default.
- Production has not yet been formally flipped to queued-by-default.
- Route-level progress remains intentionally coarse.
- The chat route is still heavier than the target thin-entrypoint shape.

## Execution Modes
- `CHAT_TURN_EXECUTION_MODE=inline`
  - request-bound execution
  - NDJSON stream path
  - preferred for local/dev/test
- `CHAT_TURN_EXECUTION_MODE=queued`
  - route authenticates, normalizes, persists the user turn, enqueues the turn, and returns `202`
  - worker claims and finishes the turn out of band
  - preferred production target after rollout verification

## Model Tiers
- `AGENT_V2_MODEL_CONTROL`
- `AGENT_V2_MODEL_EXTRACTION`
- `AGENT_V2_MODEL_PLANNING`
- `AGENT_V2_MODEL_WRITING`
- `GROQ_MODEL`
  - shared fallback when a tier env is unset

## Progress Contract
- Allowlisted step ids:
  - `queued`
  - `understand_request`
  - `gather_context`
  - `plan_response`
  - `generate_output`
  - `validate_output`
  - `persist_response`
- Only sanitized labels and explanations may be shown to the user.
- Do not expose chain-of-thought or raw prompt text through progress fields.

## Polling Contract
- Poll active turns only while status is:
  - `queued`
  - `running`
  - `cancel_requested`
- Visible tab: `3000ms` baseline.
- Hidden tab: `10000ms`.
- Add jitter.
- Stop polling on:
  - `completed`
  - `failed`
  - `cancelled`
- Refresh thread history once after terminal state.

## Worker Runbook
- Start background processing with `apps/web/scripts/process-background-jobs.mjs`.
- The chat worker claims turns through `ChatTurnControl` lease ownership.
- The worker resumes the stored request body and forces execution through the existing chat route handler.
- If queued turns stall:
  - inspect `ChatTurnControl.status`
  - inspect `leaseOwner`, `leaseExpiresAt`, and `heartbeatAt`
  - verify the worker loop is running

## Do Not Regress
- Do not reintroduce a second top-level router or classifier.
- Do not let structured UI actions fall back to the controller.
- Do not push raw transcript history straight into planner, writer, ideator, coach, or reviser prompts.
- Do not lower active-turn polling below `2500ms` without a query-budget review.
- Do not add a second durable queue backend beside the Prisma lease worker.
- Do not allow more than two internal attempts in drafting, revision, reply, or analysis.

## Fast Debug Map
- Turn normalization:
  - `apps/web/app/api/creator/v2/chat/_lib/normalization/turnNormalization.ts`
- Runtime action resolution:
  - `apps/web/lib/agent-v2/runtime/resolveRuntimeAction.ts`
- Workflow-scoped context:
  - `apps/web/lib/agent-v2/memory/contextRetriever.ts`
- Queued turn control:
  - `apps/web/app/api/creator/v2/chat/_lib/control/routeTurnControl.ts`
- Worker execution:
  - `apps/web/app/api/creator/v2/chat/_lib/worker/chatTurnWorker.ts`
- Client polling:
  - `apps/web/app/chat/_features/thread-history/useThreadHistoryHydration.ts`
- LLM tiering and structured output:
  - `apps/web/lib/agent-v2/agents/llm.ts`
