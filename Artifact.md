# Agent Plan and Artifact Hand-off

## Phase: Transcript Contract Cleanup & Thread Resilience
**Current Status:** Completed.

## 1. What Has Been Done (Current Plan Executed)
- **Transcript contract stabilized in `apps/web/app/api/creator/v2/chat/route.logic.ts`:**
  - `recentHistory` is now explicitly transcript-only and stays limited to natural `user:` / `assistant:` turns.
  - Dead `assistant_context` / `assistant_plan` / `assistant_draft` / `assistant_grounding` / `assistant_reply` / `assistant_angles` history assembly code was removed.
  - `activeDraft` resolution still comes from structured state such as `contextPacket`, draft bundles, draft versions, and draft artifacts.
- **Route tests realigned to the new contract:**
  - `apps/web/app/api/creator/v2/chat/route.test.mjs` now checks transcript continuity, exclusion behavior, and `activeDraft` carryover instead of expecting `assistant_*` markers in model history.
- **Thread artifact parsing hardened in `apps/web/lib/onboarding/draftArtifacts.ts`:**
  - Fallback order is now: explicit `---` delimiters, strong marker lines (`1/5`, `1.`, `2)`, `Post 2:`, `Tweet 2:`), blank-line paragraph grouping, then sentence/word chunking.
  - Marker-based splitting preserves numbering tokens in each post and only activates when at least two credible boundaries are present.
  - Numbered thread detection now recognizes the same marker families used by the fallback splitter.
- **Regression coverage expanded:**
  - `apps/web/lib/onboarding/draftArtifacts.test.mjs` now covers numbered threads without delimiters, single-newline marker threads, `Post/Tweet` labels, and oversized one-block fallbacks capped to six posts.
- **Verification completed:**
  - Green: `test:v2-route`, `draftArtifacts.test.mjs`, `test:v2-response-quality`, `test:v2-regressions`, `test:v2-orchestrator`, `liveAssistantEval.test.mjs`, `test:v3-orchestrator`.
- **Per-handle backend isolation landed for multi-account Xpo profiles:**
  - Shared workspace-handle helpers now live in `apps/web/lib/workspaceHandle.ts` and `apps/web/lib/workspaceHandle.server.ts`.
  - Handle-scoped creator routes now resolve the effective workspace handle from the explicit request contract instead of treating `session.user.activeXHandle` as backend authority.
  - `apps/web/app/api/creator/v2/chat/route.ts` now creates/loads threads against the requested workspace handle, validates thread ownership with `ChatThread.xHandle`, and only reads onboarding/profile context for that same handle.
  - `apps/web/app/chat/page.tsx` now treats the workspace handle as tab state via `?xHandle=...`, sends `X-Xpo-Handle` on creator/chat requests, and preserves that handle across chat/thread navigation.
  - `ReplyOpportunity` persistence is now isolated by `userId + xHandle + tweetId`, with the migration in `apps/web/prisma/migrations/20260313170000_reply_opportunity_handle_isolation/migration.sql`.
  - Direct regression coverage now exists in `apps/web/lib/workspaceHandle.test.ts`.
- **Memory/constraint salience step 1 landed:**
  - Shared salience policy now lives in `apps/web/lib/agent-v2/memory/memorySalience.ts`.
  - `memoryStore.ts` now applies salience normalization both when persisting conversation memory and when building snapshots for downstream orchestration.
  - `memoryPolicy.ts` now uses the same salience rules when persistence falls back, so runtime memory shape stays aligned with the persisted shape.
  - The salience layer now keeps hard grounding constraints sticky, trims noisy/transient residue, caps ideation-angle carryover, normalizes rolling summaries, and clamps long-session counters like `concreteAnswerCount`.
  - Direct regression coverage now exists in `apps/web/lib/agent-v2/memory/memorySalience.test.ts`.
- **Memory/constraint salience step 2 landed:**
  - Turn-scoped memory freshness now lives in `apps/web/lib/agent-v2/memory/turnScopedMemory.ts`.
  - `turnContextBuilder.ts` now scopes persisted memory per turn before routing/planning/drafting consume it, so stale topic summaries, old refinement instructions, lingering ideation angles, and outdated active-draft state stop dominating when the user clearly switches topics.
  - Strong local continuation cues like active-draft edit requests still keep the current draft/plan context intact.
  - Direct regression coverage now exists in `apps/web/lib/agent-v2/memory/turnScopedMemory.test.ts`.
- **Conversational cleanup continued:**
  - Constraint acknowledgments now live in `constraintAcknowledgment.ts` and only offer revisions when a draft is actually in play.
  - `responseShaper.ts` now strips short formulaic openers like `got it.` / `love that.` when they precede the substantive reply.
  - Shared plan-pitch assembly now lives in `apps/web/lib/agent-v2/core/planPitch.ts`, where workflow-y planner phrasing is sanitized before it reaches the user.
  - Planner outputs now normalize `pitchResponse`, and `buildPlanPitch` prefers the actual plan angle/objective over canned fallback copy when the planner returns low-signal text like `drafting it.`
  - Shared planner payload normalization now lives in `apps/web/lib/agent-v2/core/plannerNormalization.ts`: deduped `mustInclude` / `mustAvoid`, overlap removal between those lists, and cleaned thread post proof points with a hard 6-post cap to match the intended thread planner contract.
  - Planner guidance now pushes hooks toward real tension / surprise / contradiction from the request instead of generic "thoughts on" framing, and it explicitly forbids meta writing advice from leaking into `mustInclude` / `proofPoints`.
  - Planner normalization now strips low-signal thread proof points like `be specific`, `make it clear`, or objective-duplicates so thread beats keep concrete evidence instead of meta filler.
  - `promptBuilders.ts` now uses a clearer shared plan-requirements block plus stricter thread-beat guidance so planner prompts ask for fewer catch-all posts and fewer repeated proof points.
  - The writer handoff is now stricter for thread plans: `promptBuilders.ts` tells the writer to preserve beat order, keep post count aligned with the plan when possible, keep proof points in their assigned beat, and carry transition hints into the actual phrasing between posts.
  - Shared grounding-packet prompt assembly now lives in `apps/web/lib/agent-v2/agents/groundingPromptBlock.ts`, which removes duplicated factual-authority / voice-context instructions from planner, reviser, and critic prompt strings.
  - Shared X-platform prompt rules now live in `apps/web/lib/agent-v2/agents/xPostPromptRules.ts`, which centralizes thread-framing guidance plus X-specific markdown / verification-tone / CTA hygiene rules across drafting, revision, and critique.
  - Shared JSON/output-contract prompt assembly now lives in `apps/web/lib/agent-v2/agents/jsonPromptContracts.ts`, which centralizes parse-critical response schemas across planner, writer, reviser, and critic prompts.
  - Thread planning now has a stronger default cadence contract: `plannerNormalization.ts` repairs duplicate/missing thread roles into a cleaner arc, dedupes proof points across posts, and upgrades low-signal transition hints so the writer gets more distinct beats.
  - Thread writer/critic guidance is stricter now: the writer prompt explicitly tells each role to earn its slot, forbids close posts from just paraphrasing the payoff, and the critic now rejects flat middle beats plus payoff-as-close endings.
  - Final thread output now has a runtime cleanup pass in `apps/web/lib/agent-v2/core/finalDraftPolicy.ts`: obviously samey adjacent posts can be collapsed before delivery, which helps remove repeated middle beats and close posts that only restate the payoff.
  - `draftPipeline.ts` import/type drift was cleaned up after the modular plan-pitch/planner work: the file now imports from the correct modular sources, uses typed pipeline args instead of `any`, and is lint-clean again.
  - `apps/web/lib/agent-v2/agents/promptContracts.test.mjs` now snapshots both the stronger thread-beat writer requirements and the shared grounding/platform prompt contracts so future prompt edits do not quietly drift by surface refactors.
  - `apps/web/lib/agent-v2/core/finalDraftPolicy.test.mjs` now covers repeated-payoff closes and obviously samey adjacent middle posts so the final output cleanup stays locked in.
  - `apps/web/lib/agent-v2/agents/llm.ts` now retries once when OpenAI-proxied reasoning models return reasoning with empty message content, which reduces false "failed to write draft" errors on otherwise valid turns.

## 2. What Needs to Be Done (Future Plan)
1. **Broader P0 quality pass (next major workstream):**
   - **Where:** `chatResponderDeterministic.ts`, `responseShaper.ts`, `planner.ts`, `promptBuilders.ts`, and adjacent controller/orchestrator modules.
   - **Goal:** Continue reducing deterministic / scripted feel, keep tightening pre-draft planning language and thread-beat quality, and keep voice grounding separate from factual grounding.
   - **Current subfocus:** The first writer-handoff hardening landed; the next step is improving planner substance itself so hook choice, proof selection, and thread beat sharpness improve before the writer executes the plan.
2. **Continue de-hardcoding conversational fast paths:**
   - **Where:** `apps/web/lib/agent-v2/orchestrator/chatResponder.ts`, `chatResponderDeterministic.ts`, `responseShaper.ts`
   - **Goal:** Keep shrinking canned conversational behavior, especially around constraints and meta chat, without losing safety-critical fallbacks.

## 2.5 Recommended Remaining Phases
1. **Planner/Writer quality pass (3 steps)**
   - tighten planner instructions
   - improve planner-to-writer handoff
   - verify with response/orchestrator suites
   - Status: completed. Planner normalization, planner-side hook/proof sharpening, writer-handoff hardening, and validation are all green.
2. **Voice vs factual grounding separation (4 steps)**
   - audit current grounding paths
   - separate style anchors from factual/evidence anchors
   - update prompt usage and guardrails
   - verify hallucination regressions stay closed
   - Status: completed. `GroundingPacket` now exposes an explicit `factualAuthority` channel, legacy `contextAnchors` split into factual carryover vs `voiceContextHints`, and downstream retrieval/effective-context helpers carry those lanes separately with regression coverage staying green.
3. **Prompt layering simplification (3 steps)**
   - inventory duplicated/conflicting instruction blocks
   - consolidate shared rules/helpers
   - rerun quality/regression coverage
   - Status: completed. Shared grounding-packet prompt assembly lives in `groundingPromptBlock.ts`, shared X-platform prompt rules live in `xPostPromptRules.ts`, shared JSON/output contracts live in `jsonPromptContracts.ts`, and the prompt contract plus response/orchestrator suites are green.
4. **Thread-first quality maturation (4 steps)**
   - refine thread planning quality
   - refine writer execution of thread beats
   - refine critic checks for thread coherence
   - rerun thread-focused regressions/evals
   - Status: completed. Planner-side normalization now repairs weak thread arcs before writing, writer/critic prompts enforce distinct middle beats plus real closes, `finalDraftPolicy.ts` removes obviously samey adjacent posts at delivery time, and the thread-focused regression sweep is green end to end.
5. **Memory/constraint salience follow-through (3 steps)**
   - decide what should persist vs decay
   - implement salience/capping/summarization policy
   - test longer-session behavior
   - Status: in progress. Shared salience policy now exists in `memorySalience.ts`, and turn-scoped freshness now lives in `turnScopedMemory.ts`; the last step should be the broader long-session validation pass and any small follow-up tuning it exposes.
6. **Architecture follow-through (2-3 steps)**
   - identify remaining overloaded boundaries
   - move lingering logic into focused modules
   - verify behavior stayed stable

## 3. Important Information for the Next Agent
- **The Orchestrator is now Modular**: When adapting conversational flow, do not shove logic directly into `conversationManager.ts`. Look for the applicable policy file (`turnContextBuilder`, `routingPolicy`, `draftPipeline`, `memoryPolicy`).
- **Transcript Contract Is Cleaned Up**: Do not put structured assistant state back into `recentHistory`. The model should only read natural transcript turns there.
- **`contextPacket` Is Still Canonical**: Machine-readable assistant state should continue to live in persisted message data, not in the transcript string.
- **Thread Fallbacks Are Now Ordered and Conservative**: If you extend the splitter, preserve marker tokens in post content and keep the "at least two credible boundaries" rule so normal prose is not over-segmented.
- **Constraint Acknowledgments Are Now Isolated**: Constraint detection and acknowledgment live in `constraintAcknowledgment.ts`, which keeps the conversational fast path testable without pulling in the coach stack.
- **Visible Replies Are Slightly More Compressed Now**: `responseShaper.ts` removes certain low-information opener sentences before the user sees them. Preserve that behavior unless a concrete regression shows it is stripping meaningful content.
- **Plan Pitching Is Now Shared and Sanitized**: `core/planPitch.ts` is the shared layer for user-visible plan pitches. If planner copy gets workflow-y again, fix it there and in `planner.ts` / `promptBuilders.ts`, not with scattered one-off wrappers.
- **Planner Payload Cleanup Is Also Shared**: `core/plannerNormalization.ts` is the right place to dedupe or sanitize planner output structure before it leaks into downstream orchestration.
- **`draftPipeline.ts` Is Stable Again**: If new errors appear there, prefer fixing imports/types at the module boundary instead of re-pulling broad helpers back out of `conversationManager.ts`.
- **Grounding Now Has Separate Truth vs Voice Context Lanes**: `groundingPacket.ts` now exposes `factualAuthority` plus `voiceContextHints`. Use `factualAuthority` for reusable truth/evidence. Use `voiceContextHints` for territory/framing guidance only.
- **Workspace Handle Is Now Explicit**: For handle-scoped creator/chat APIs, the request workspace handle is authoritative. The chat UI now persists it in `?xHandle=...` and server routes resolve it from `X-Xpo-Handle` / request input. `session.user.activeXHandle` should only be treated as a last-used default for opening a fresh workspace.
- **Thread Access Must Stay Handle-Scoped**: `ChatThread.xHandle` is now the ownership boundary for creator chat threads. Use `resolveOwnedThreadForWorkspace(...)` instead of hand-rolling thread lookup logic, and keep null-handle legacy threads quarantined instead of silently reassigning them.
- **Reply Opportunity Learning Is Handle-Scoped Too**: `ReplyOpportunity` records are now keyed by `userId + xHandle + tweetId`. Do not reintroduce user-level fallback lookups that can blend learning across handles inside the same Xpo profile.
- **Grounding Prompt Copy Is Now Shared**: If you need to change how factual authority, voice-context hints, unknowns, or source-material detail lines are described to agents, update `apps/web/lib/agent-v2/agents/groundingPromptBlock.ts` instead of duplicating copy across planner/reviser/critic strings.
- **X Platform Prompt Rules Are Now Shared**: If you need to change thread-framing wording or X-specific markdown / CTA / verification-tone rules, update `apps/web/lib/agent-v2/agents/xPostPromptRules.ts` instead of drifting separate copies in writer, reviser, or critic.
- **JSON Output Contracts Are Now Shared**: If you need to change parse-critical response schemas, update `apps/web/lib/agent-v2/agents/jsonPromptContracts.ts` instead of editing separate inline JSON blocks in planner, writer, reviser, or critic prompts.
- **Thread Plan Cadence Now Self-Repairs**: `apps/web/lib/agent-v2/core/plannerNormalization.ts` is now responsible for correcting weak role order, repeated proof beats, and low-signal transitions in thread plans before they reach the writer.
- **Final Thread Output Also Self-Cleans**: `apps/web/lib/agent-v2/core/finalDraftPolicy.ts` now does a last-pass cleanup for obviously samey adjacent thread posts, so repeated payoff-as-close endings can be removed even if generation slips.
- **Thread-first Quality Phase Is Done**: Planner, writer, critic, and final-policy layers now reinforce the same thread arc, so the next major focus should shift to memory/constraint salience instead of more thread plumbing.
- **Memory Salience Is Now Shared**: `apps/web/lib/agent-v2/memory/memorySalience.ts` is now the shared place to decide which constraints, summaries, and ideation residue stay sticky versus decay. If long-session memory gets bloated again, fix the policy there before widening persistence rules elsewhere.
- **Persistence and Runtime Memory Now Share the Same Shape**: `memoryStore.ts` and `memoryPolicy.ts` both apply the same salience rules, so follow-up work should preserve that parity instead of letting persisted memory and runtime fallbacks drift apart.
- **Turn Context Now Applies Freshness Gating**: `apps/web/lib/agent-v2/memory/turnScopedMemory.ts` decides whether the current turn is continuing the active draft/topic or starting a new lane. Keep that freshness gate focused on topic-bound residue; do not let it drop correction locks or stable user preferences.
- Check `LIVE_AGENT.md` for broader alignment on voice, thread rules, and safety fallbacks.
