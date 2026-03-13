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
- **Conversational cleanup continued:**
  - Constraint acknowledgments now live in `constraintAcknowledgment.ts` and only offer revisions when a draft is actually in play.
  - `responseShaper.ts` now strips short formulaic openers like `got it.` / `love that.` when they precede the substantive reply.
  - Shared plan-pitch assembly now lives in `apps/web/lib/agent-v2/core/planPitch.ts`, where workflow-y planner phrasing is sanitized before it reaches the user.
  - Planner outputs now normalize `pitchResponse`, and `buildPlanPitch` prefers the actual plan angle/objective over canned fallback copy when the planner returns low-signal text like `drafting it.`
  - Shared planner payload normalization now lives in `apps/web/lib/agent-v2/core/plannerNormalization.ts`: deduped `mustInclude` / `mustAvoid`, overlap removal between those lists, and cleaned thread post proof points with a hard 6-post cap to match the intended thread planner contract.
  - `promptBuilders.ts` now uses a clearer shared plan-requirements block plus stricter thread-beat guidance so planner prompts ask for fewer catch-all posts and fewer repeated proof points.

## 2. What Needs to Be Done (Future Plan)
1. **Broader P0 quality pass (next major workstream):**
   - **Where:** `chatResponderDeterministic.ts`, `responseShaper.ts`, `planner.ts`, `promptBuilders.ts`, and adjacent controller/orchestrator modules.
   - **Goal:** Continue reducing deterministic / scripted feel, keep tightening pre-draft planning language and thread-beat quality, and keep voice grounding separate from factual grounding.
2. **Continue de-hardcoding conversational fast paths:**
   - **Where:** `apps/web/lib/agent-v2/orchestrator/chatResponder.ts`, `chatResponderDeterministic.ts`, `responseShaper.ts`
   - **Goal:** Keep shrinking canned conversational behavior, especially around constraints and meta chat, without losing safety-critical fallbacks.

## 3. Important Information for the Next Agent
- **The Orchestrator is now Modular**: When adapting conversational flow, do not shove logic directly into `conversationManager.ts`. Look for the applicable policy file (`turnContextBuilder`, `routingPolicy`, `draftPipeline`, `memoryPolicy`).
- **Transcript Contract Is Cleaned Up**: Do not put structured assistant state back into `recentHistory`. The model should only read natural transcript turns there.
- **`contextPacket` Is Still Canonical**: Machine-readable assistant state should continue to live in persisted message data, not in the transcript string.
- **Thread Fallbacks Are Now Ordered and Conservative**: If you extend the splitter, preserve marker tokens in post content and keep the "at least two credible boundaries" rule so normal prose is not over-segmented.
- **Constraint Acknowledgments Are Now Isolated**: Constraint detection and acknowledgment live in `constraintAcknowledgment.ts`, which keeps the conversational fast path testable without pulling in the coach stack.
- **Visible Replies Are Slightly More Compressed Now**: `responseShaper.ts` removes certain low-information opener sentences before the user sees them. Preserve that behavior unless a concrete regression shows it is stripping meaningful content.
- **Plan Pitching Is Now Shared and Sanitized**: `core/planPitch.ts` is the shared layer for user-visible plan pitches. If planner copy gets workflow-y again, fix it there and in `planner.ts` / `promptBuilders.ts`, not with scattered one-off wrappers.
- Check `LIVE_AGENT.md` for broader alignment on voice, thread rules, and safety fallbacks.
