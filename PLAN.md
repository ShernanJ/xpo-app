# Agent-v2 Reliability, Cost, and Execution Hardening

Last updated: 2026-03-18

## Summary
- Replace the old migration plan with the current hardening roadmap for `apps/web/lib/agent-v2` and `apps/web/app/api/creator/v2/chat`.
- Treat these as baseline, already-landed behavior:
  - deterministic structured-turn routing
  - durable `ChatTurnControl` state
  - coarse progress streaming
  - hard two-attempt draft and revision breakers
- Focus the roadmap on the real reliability and scale gaps:
  - tiered model routing
  - resilient structured-output parsing
  - workflow-scoped prompt context
  - queued execution as the primary production path

## Baseline Landed
- Structured UI turns and continuity turns are now resolved deterministically through turn normalization and runtime action resolution.
- Short continuation approvals now bypass the controller and resolve as `source: "structured_turn"`.
- Legacy `agents/classifier.ts` is removed.
- Shared model-tier routing and structured-output validation now live in `apps/web/lib/agent-v2/agents/llm.ts`.
- Main agent roles are tiered:
  - `control`: controller, planner feedback
  - `extraction`: fact/style/anti-pattern extraction, draft inspection, thread title, inline profile analysis
  - `planning`: planner, ideator, coach, welcome
  - `writing`: writer, critic, reviser
- Workflow-scoped prompt context now carries:
  - rolling summary
  - approved plan
  - current artifact summary
  - source-material references
  - latest relevant turns
  - fact and voice hints
- Stale ideation menu lines are compacted out once a plan or draft is in play.
- Safe progress-stage ids are now flattened to:
  - `queued`
  - `understand_request`
  - `gather_context`
  - `plan_response`
  - `generate_output`
  - `validate_output`
  - `persist_response`
- Queued execution mode is now supported behind `CHAT_TURN_EXECUTION_MODE`.
- The chat route can now return `202` accepted with `{ accepted: true, executionMode: "queued", activeTurn }`.
- Lightweight turn-status reads now use a progress-only select path.
- Active-turn polling keeps the existing `3000ms` visible-tab baseline, slows hidden tabs to `10000ms`, and adds jitter.
- Reply, analysis, revision, and drafting traces now expose standardized attempt metadata:
  - `attemptCount`
  - `maxAttempts: 2`
  - `fallbackReason`

## Open Gaps
- Production default is still not flipped to queued mode.
- Queue-lifecycle coverage is still lighter than the target state for claim/recovery/cancellation edge cases.
- The progress contract is standardized, but the route still emits only coarse checkpoints rather than deep workflow-native stage updates.
- Validation and retry metadata are standardized, but downstream analytics and dashboards do not yet consume that shape.
- The route remains heavier than the target architecture even after queued-mode support.

## Implementation Phases
### Phase 1: Control Plane Hardening
- Keep `turnNormalization` plus `resolveRuntimeAction` as the only workflow authority.
- Keep deterministic structured-turn ownership ahead of any control-model call.
- Acceptance:
  - structured UI turns never hit controller reclassification
  - short plan approvals stay `source: "structured_turn"`

### Phase 2: Model Cost and Structured Output
- Keep all control and extraction paths off the writing-tier model by default.
- Use the shared structured-output helper for schema validation, fence stripping, repair retry, and optional defaults.
- Acceptance:
  - control and extraction tasks no longer default to the writing-tier model
  - malformed or fenced JSON no longer crashes the path silently

### Phase 3: Prompt Context Discipline
- Keep planner, writer, ideator, coach, and revision prompts on workflow-scoped context packets rather than raw transcript history.
- Preserve approved plan and source refs across ideation-to-draft transitions.
- Acceptance:
  - stale ideation menus do not leak into later drafting prompts
  - effective context includes approved plan and source-material refs when present

### Phase 4: Durable Execution Rollout
- Keep `inline` mode for local/dev/test and emergency fallback.
- Verify `queued` mode end to end with the existing Prisma lease worker.
- Flip production default to queued only after queue lifecycle and polling coverage are sufficient.
- Acceptance:
  - route returns immediately in queued mode
  - worker can claim, execute, finalize, and recover the turn without request-bound execution

## Rollout Order
1. Keep `CHAT_TURN_EXECUTION_MODE=inline` locally while validating queue behavior.
2. Run the Prisma worker continuously in staging.
3. Verify queued turns, polling, thread reattachment, and cancellation behavior.
4. Flip staging to `CHAT_TURN_EXECUTION_MODE=queued`.
5. Flip production to queued only after staging stays stable.

## Polling Contract
- Poll only while a turn is non-terminal.
- Do not poll while an inline stream is attached.
- Default visible-tab polling: `3000ms`.
- Hidden-tab polling: `10000ms`.
- Add small jitter to avoid synchronized bursts.
- Stop immediately on `completed`, `failed`, or `cancelled`, then refresh thread history once.

## Acceptance Gates
- Structured UI turns never hit controller-based reclassification.
- Control and extraction tasks stop using the writing-tier model by default.
- Draft, revision, reply, and analysis never exceed two internal attempts.
- Prompt context is workflow-scoped instead of raw-history-driven.
- Queued mode can complete turns without holding the request open.
- Polling never runs faster than the documented contract.
