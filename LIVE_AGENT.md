# Live Agent

**Project:** Xpo  
**Purpose:** Shared working memory + handoff doc for coding agents  
**Last updated:** 2026-03-13  
**Status:** Active  
**Owner:** Shernan Javier

---

## 1. Product mission

Xpo is an AI writing and growth assistant for **X** that helps users create content in their own voice.

The product is not just supposed to output text. It should feel like a **smart, natural assistant** that:
- understands the user’s goals
- chooses the right content format
- drafts with strong structure
- sounds like the user without sounding fake
- avoids hallucinated personal facts, stories, or claims
- improves trust, not just surface-level polish

### Main output types
1. **Single post**
   - One standalone X post

2. **Multi-post set**
   - Multiple generated posts that are unrelated to each other

3. **Thread**
   - Multiple connected posts that work together as one coherent thread

### What “good” output looks like
Good output should feel:
- natural
- specific
- grounded
- strategically sharp
- easy to publish with minimal edits
- consistent with the user’s actual voice and worldview
- native to X rather than generic AI writing

### What “bad” output looks like
Bad output tends to feel:
- hardcoded
- robotic
- templated
- framework-y
- over-explained
- generic
- fake-personal
- like a workflow engine wearing an AI costume

---

## 2. Current quality priorities

These are the current highest-priority product goals.

### P0
- make the **chat agent feel less hardcoded**
- improve **thread drafting quality**
- improve **planning before drafting**
- reduce **robotic / deterministic response feel**
- reduce **hallucinated autobiographical claims**
- improve **voice grounding without flattening specificity**

### P1
- improve single-post quality
- improve multi-post variation quality
- reduce prompt conflicts / over-constraint
- separate conversation handling from drafting pipeline concerns
- improve architecture readability for future agents

### P2
- improve debugability
- reduce prompt spaghetti
- create better evaluation loops for output quality
- make future refactors safer and easier

---

## 2.5 Current implementation status

This section tracks what has already landed so future agents do not accidentally undo it.

### Landed on 2026-03-13
- `recentHistory` is now a clean transcript-only string in `apps/web/app/api/creator/v2/chat/route.logic.ts`.
- Structured assistant state still lives in persisted `contextPacket` message data and should stay there.
- Route tests were updated to enforce transcript continuity plus `activeDraft` carryover without relying on `assistant_*` markers in history.
- `apps/web/lib/onboarding/draftArtifacts.ts` now uses deterministic thread segmentation fallbacks in this order:
  1. explicit `---`
  2. strong post markers like `1/5`, `1.`, `2)`, `Post 2:`, `Tweet 2:`
  3. blank-line paragraph grouping
  4. sentence/word chunking
- Thread framing inference now recognizes the same numbered marker families used by the fallback splitter.
- Constraint acknowledgments are isolated in `constraintAcknowledgment.ts` and only offer draft revision when an active draft appears to be in play.
- `responseShaper.ts` now strips short formulaic opener sentences like `love that.` and `got it.` when they only front-load the real reply.
- Shared plan-pitch assembly now lives in `apps/web/lib/agent-v2/core/planPitch.ts`.
- Planner `pitchResponse` text is now normalized before storage/use, and user-visible plan pitches prefer the real plan angle/objective over low-signal stubs like `drafting it.`
- Shared planner payload normalization now lives in `apps/web/lib/agent-v2/core/plannerNormalization.ts`: deduped include/avoid lists, overlap removal, and thread post cleanup capped to 6 posts.
- Planner requirements now push hook choice toward real tension/surprise/contradiction from the request and explicitly reject meta writing advice as `mustInclude` or thread proof.
- Planner normalization now strips low-signal/meta proof points and objective-duplicates from thread post plans before the writer sees them.
- `promptBuilders.ts` now uses a shared requirements block for planning plus sharper thread-beat instructions around per-post proof and transitions.
- The writer handoff for thread plans is now more binding: the writer prompt preserves beat order, keeps post count aligned with the planned beats when possible, keeps proof points in their assigned post, and uses transition hints as real bridges between posts.
- `GroundingPacket` now exposes an explicit `factualAuthority` lane, and prompts/claim checking use that as the reusable truth layer instead of implicitly reconstructing evidence from mixed sources.
- Legacy `contextAnchors` are now split inside grounding into factual carryover vs `voiceContextHints`, so style/context memory can guide territory without automatically becoming fact support.
- Retrieval/effective-context helpers now consume factual context and voice-context hints separately, so the orchestrator no longer flattens those lanes back into one generic "known facts" bucket.
- Shared grounding-packet prompt assembly now lives in `apps/web/lib/agent-v2/agents/groundingPromptBlock.ts`, and planner/reviser/critic now share one factual-authority / voice-context contract instead of carrying drift-prone inline copies.
- Shared X-platform prompt rules now live in `apps/web/lib/agent-v2/agents/xPostPromptRules.ts`, and writer/reviser/critic now share one thread-framing / markdown / verification-tone / CTA hygiene contract instead of drifting separate inline copies.
- Shared JSON/output-contract prompt assembly now lives in `apps/web/lib/agent-v2/agents/jsonPromptContracts.ts`, and planner/writer/reviser/critic now share one parse-critical response-schema contract instead of drifting inline JSON blocks.
- Thread planning now has stronger default cadence repair in `plannerNormalization.ts`: duplicate/missing thread roles get normalized into a cleaner arc, repeated proof points are deduped across posts, and low-signal transition hints get upgraded before the writer sees the plan.
- Thread writer/critic guidance is stricter too: the writer prompt now forces each role to earn a distinct slot, and the critic explicitly rejects flat middle beats plus closes that only paraphrase the payoff.
- `finalDraftPolicy.ts` now adds a last-pass thread cleanup that can collapse obviously samey adjacent posts before delivery, which helps remove repeated middle beats and close posts that only restate the payoff.
- `draftPipeline.ts` was repaired after the modular plan helper changes: imports now point at the right modules, typed pipeline args replaced local `any`s, and the file is lint-clean again.
- `promptContracts.test.mjs` now snapshots the stronger thread-beat writer requirements plus the shared grounding/platform prompt contracts so future prompt edits do not silently flatten the planner/writer handoff or reintroduce prompt-copy drift.
- `finalDraftPolicy.test.mjs` now covers repeated-payoff closes and obviously samey adjacent middle posts so the runtime cleanup stays pinned down.
- `llm.ts` now retries once when OpenAI-proxied reasoning models return empty content with only reasoning text, which reduces false draft-generation failures.
- Multi-handle workspace isolation is now explicit for creator/chat flows: the workspace handle is passed per request, persisted in the chat URL as `?xHandle=...`, and no longer inferred from `session.user.activeXHandle` on the backend.
- Shared handle helpers now live in `apps/web/lib/workspaceHandle.ts` and `apps/web/lib/workspaceHandle.server.ts`.
- Handle-scoped creator routes now validate both profile-handle access and thread ownership through `ChatThread.xHandle`, which quarantines legacy null-handle threads instead of silently reusing them.
- `ReplyOpportunity` persistence is now isolated by `userId + xHandle + tweetId`, and the schema migration for that lives in `apps/web/prisma/migrations/20260313170000_reply_opportunity_handle_isolation/migration.sql`.
- Direct regression coverage now exists in `apps/web/lib/workspaceHandle.test.ts`.
- Shared memory salience policy now lives in `apps/web/lib/agent-v2/memory/memorySalience.ts`.
- `memoryStore.ts` now applies that salience policy when persisting conversation memory and when building snapshots, so long-session memory stays compact before it reaches downstream orchestration.
- `memoryPolicy.ts` now uses the same salience policy for optimistic fallback memory, keeping runtime memory shape aligned with persisted memory shape.
- The salience layer now keeps hard grounding constraints sticky, trims noisy/transient residue, caps ideation-angle carryover, normalizes rolling summaries, and clamps `concreteAnswerCount`.
- Direct regression coverage now exists in `apps/web/lib/agent-v2/memory/memorySalience.test.ts`.
- Turn-scoped memory freshness now lives in `apps/web/lib/agent-v2/memory/turnScopedMemory.ts`.
- `turnContextBuilder.ts` now scopes persisted memory per turn before routing/planning/drafting consume it, which drops stale topic summaries, old refinement instructions, lingering ideation angles, and outdated active-draft state when the user clearly switches topics.
- The freshness gate preserves local continuation cues for active draft/plan follow-ups, so short revision requests like `make it shorter` do not lose the draft context they still depend on.
- Direct regression coverage now exists in `apps/web/lib/agent-v2/memory/turnScopedMemory.test.ts`.
- `conversationManager.ts` no longer keeps its own duplicate copies of the draft-pipeline helper cluster; shared topic-seed, clarification, draft-preference, and thread-framing logic now comes from `apps/web/lib/agent-v2/orchestrator/draftPipelineHelpers.ts`.
- `ConversationalDiagnosticContext` now explicitly types the optional `includeRoutingTrace` flag, which removes the `any` escape hatch from `conversationManager.ts`.
- Shared response-envelope finalization now lives in `apps/web/lib/agent-v2/orchestrator/responseEnvelope.ts`.
- `conversationManager.ts`, `draftPipelineHelpers.ts`, and the fast-reply path in `routingPolicy.ts` now reuse the same response shaping / `responseShapePlan` assembly instead of carrying separate copies.
- `apps/web/app/api/creator/v2/chat/route.ts` now has a defensive response-shape fallback, so partial orchestrator responses no longer crash the route on `responseShapePlan.shouldAskFollowUp`.
- `conversationManager.ts` now re-exports `ConversationServices` and consumes the shared `createDefaultConversationServices()` implementation from `draftPipelineHelpers.ts` instead of keeping a second service contract / factory block.
- The unused local `applyMemoryPatch` copy is gone, and the remaining direct anti-pattern/source-material helpers in `conversationManager.ts` are now explicit, which lets `pnpm build` verify the slimmer boundary end to end.
- Fallback draft handoff copy in `apps/web/app/api/creator/v2/chat/route.logic.ts` is now output-shape aware, so thread rewrites use thread-native handoff text instead of generic post wording.
- Direct regression coverage for that thread-native handoff copy now lives in `apps/web/app/api/creator/v2/chat/route.test.mjs`, with `pnpm build` and `test:v2-orchestrator` green after the change.
- Open-ended asks like `write a post about anything` no longer fast-start into grounded drafting, and bare draft requests now stay off the direct draft path even when saved context exists.
- `apps/web/lib/agent-v2/agents/draftCompletion.ts` now trims common abrupt dangling endings before delivery, and direct regression coverage lives in `apps/web/lib/agent-v2/agents/critic.test.mjs`.
- That abrupt-ending cleanup now also trims short broken clause tails after commas or dashes, so fragments like `algorithms shift, noise r` get clipped before the user sees them.
- Standalone posts now also strip thread-style lead labels like `thread:` / `post 1:` / `tweet 1:` before delivery, so shortform drafts cannot look like serialized threads when the writer leaks thread framing into the opener.
- A plain `write a post` or `write a thread` without a concrete direction now routes into generated ideation directions instead of auto-drafting from saved context, so the UI gets numbered idea options plus chips instead of a random low-context draft.
- `draftPipeline.ts` now builds loose ideation prompts in the user's lane for those generic asks and avoids storing generic request text like `write a post` as the topic summary.
- `ideationReply.ts` now makes the visible lead explicit (`here are a few post directions.` / `here are a few thread directions.`), which makes the numbered ideas easier to scan on the actual app surface.
- That intercept now runs before the router’s `hasEnoughContextToAct` shortcut, so stale topic summaries or pending-plan state cannot silently force a draft when the user starts a fresh vague ask.
- `conversationManagerLogic.ts` now explicitly matches the exact phrase `write a post` as a bare draft request, which was the missing real-app phrase that kept earlier ideation guards from firing.

### Verification snapshot
- Green: `test:v2-route`
- Green: `draftArtifacts.test.mjs`
- Green: `responseShaper.test.mjs`
- Green: `planPitch.test.mjs`
- Green: `plannerNormalization.test.mjs`
- Green: `workspaceHandle.test.ts`
- Green: `replyOpportunities.test.ts`
- Green: `memorySalience.test.ts`
- Green: `turnScopedMemory.test.ts`
- Green: `responseEnvelope.test.mjs`
- Green: `eslint lib/agent-v2/orchestrator/draftPipeline.ts`
- Green: `eslint lib/agent-v2/memory/memorySalience.ts lib/agent-v2/memory/memorySalience.test.ts lib/agent-v2/memory/memoryStore.ts lib/agent-v2/orchestrator/memoryPolicy.ts`
- Green: `eslint lib/agent-v2/memory/turnScopedMemory.ts lib/agent-v2/memory/turnScopedMemory.test.ts lib/agent-v2/orchestrator/turnContextBuilder.ts`
- Green: `test:v2-response-quality`
- Green: `test:v2-regressions`
- Green: `test:v2-orchestrator`
- Green: `chatResponder.test.mjs`
- Green: `liveAssistantEval.test.mjs`
- Green: `test:v3-orchestrator`
- Green: `pnpm build`

---

## 3. Codebase mental model

This is the current high-level model future agents should use before changing anything.

### High-level flow
User message  
→ frontend/API assembles request + history + draft context  
→ orchestrator routes the turn  
→ planning / coaching / drafting / revising / critique logic runs  
→ output is shaped / normalized  
→ response returned to UI

### Major subsystems

#### A. API / frontend request assembly
Responsible for:
- building recent history
- assembling prompt context
- passing active draft / previous plan / structured assistant state
- shaping what the model sees as “conversation”

**Why it matters:**  
Bad context assembly can make the assistant feel systemy, repetitive, or over-orchestrated before generation even starts.

**Current rule:**  
`recentHistory` should remain natural transcript only. Structured assistant state belongs in `contextPacket`, not in the transcript string.

**Workspace-handle rule:**  
For creator/chat APIs, the explicit workspace handle is authoritative. `session.user.activeXHandle` is only the last-used default for opening a workspace, not the backend identity key for account-scoped context.

---

#### B. Orchestrator
Main home of turn-level decision logic.

**Primary file of concern:**  
- `apps/web/lib/agent-v2/orchestrator/conversationManager.ts`

Responsible for:
- conversation routing
- memory hydration
- constraints merging
- clarification behavior
- grounding packet usage
- plan / write / critic flow
- deciding whether to coach, draft, revise, or ask follow-up

**Why it matters:**  
This is currently one of the biggest leverage points and likely one of the biggest quality bottlenecks.

---

#### C. Agent modules
These appear to cover specialized sub-behaviors.

Important files:
- `apps/web/lib/agent-v2/agents/controller.ts`
- `apps/web/lib/agent-v2/agents/coach.ts`
- `apps/web/lib/agent-v2/agents/planner.ts`
- `apps/web/lib/agent-v2/agents/writer.ts`
- `apps/web/lib/agent-v2/agents/critic.ts`
- `apps/web/lib/agent-v2/agents/reviser.ts`
- `apps/web/lib/agent-v2/agents/promptBuilders.ts`
- `apps/web/lib/agent-v2/agents/promptHydrator.ts`
- `apps/web/lib/agent-v2/agents/llm.ts`

Likely responsibilities:
- classify turn intent
- produce conversational replies
- generate structured plans
- generate draft outputs
- critique or approve drafts
- revise drafts
- assemble system/prompt layers
- call the model

---

#### D. Grounding / memory / constraints
Important files:
- `apps/web/lib/agent-v2/orchestrator/groundingPacket.ts`
- `apps/web/lib/agent-v2/orchestrator/draftContextSlots.ts`
- `apps/web/lib/agent-v2/memory/memoryStore.ts`

Responsible for:
- factual safety
- determining what is known vs unknown
- memory persistence
- active constraints
- style / fact carryover

**Why it matters:**  
This is where trustworthiness and stiffness can fight each other.

---

#### E. Response shaping / deterministic behavior
Important files:
- `apps/web/lib/agent-v2/orchestrator/chatResponder.ts`
- `apps/web/lib/agent-v2/orchestrator/chatResponderDeterministic.ts`
- `apps/web/lib/agent-v2/orchestrator/responseShaper.ts`
- `apps/web/lib/agent-v2/orchestrator/feedbackMemoryNotice.ts`

Responsible for:
- canned replies
- deterministic conversational handling
- output cleanup / normalization
- memory acknowledgment phrasing

**Why it matters:**  
This is one of the most likely causes of the “hardcoded” feel.

---

#### F. Draft artifacts / thread formatting support
Important files:
- `apps/web/lib/onboarding/draftArtifacts.ts`

Responsible for:
- storing / parsing / shaping draft artifacts
- likely thread segmentation / draft handling support

**Current rule:**  
Thread parsing now has explicit fallback order and should stay conservative. Preserve numbering tokens inside posts, and avoid marker-based splitting unless at least two credible post boundaries are present.

---

## 4. Important files to inspect first

Future agents should read these before making meaningful changes.

| File | Why it matters |
|---|---|
| `apps/web/lib/agent-v2/orchestrator/conversationManager.ts` | Main orchestration hub; likely overloaded and quality-critical |
| `apps/web/lib/agent-v2/agents/promptBuilders.ts` | Major source of prompt behavior and likely over-constraint |
| `apps/web/app/api/creator/v2/chat/route.logic.ts` | Frontend/API context assembly; can inject rigidity before model generation |
| `apps/web/lib/agent-v2/orchestrator/chatResponderDeterministic.ts` | Strong suspect for robotic chat feel |
| `apps/web/lib/agent-v2/orchestrator/chatResponder.ts` | Entry point for conversational reply behavior |
| `apps/web/lib/agent-v2/orchestrator/responseShaper.ts` | Can flatten or normalize outputs too aggressively |
| `apps/web/lib/agent-v2/agents/planner.ts` | Important for pre-draft strategy and format planning |
| `apps/web/lib/agent-v2/agents/writer.ts` | Core drafting behavior |
| `apps/web/lib/agent-v2/agents/critic.ts` | Final gate on quality and compliance |
| `apps/web/lib/agent-v2/orchestrator/groundingPacket.ts` | Controls truthfulness / allowed claims / safe mode behavior |
| `apps/web/lib/agent-v2/orchestrator/draftContextSlots.ts` | Can push system into overly safe or generic behavior |
| `apps/web/lib/agent-v2/memory/memoryStore.ts` | Constraint accumulation and memory quality |
| `apps/web/lib/onboarding/draftArtifacts.ts` | Important for thread artifact parsing / segmentation |

---

## 5. Known issues

This section should be updated whenever a new meaningful issue is discovered.

### Issue 1
- **Issue:** Chat agent feels overly deterministic and hardcoded
- **Why it matters:** Users feel the product is scripted rather than intelligent
- **Likely files involved:** `chatResponderDeterministic.ts`, `chatResponder.ts`, `responseShaper.ts`, `conversationManager.ts`
- **Severity:** Critical
- **Status:** Confirmed

### Issue 2
- **Issue:** Thread generation is not treated as a first-class drafting format
- **Why it matters:** Threads can become chopped-up essays or disconnected posts
- **Likely files involved:** `planner.ts`, `writer.ts`, `critic.ts`, `promptBuilders.ts`, `conversationManager.ts`
- **Severity:** Critical
- **Status:** Partially mitigated (`draftArtifacts.ts` fallback parsing improved; broader planner/writer quality work still open)

### Issue 3
- **Issue:** Prompt stack may be too long, rigid, and constraint-heavy
- **Why it matters:** Can produce stiff, generic, or overly safe output
- **Likely files involved:** `promptBuilders.ts`, `promptHydrator.ts`, `writer.ts`, `critic.ts`
- **Severity:** Critical
- **Status:** Confirmed

### Issue 4
- **Issue:** Voice grounding and fact grounding are not cleanly separated
- **Why it matters:** Can either cause hallucinations or force bland generic drafts
- **Likely files involved:** `groundingPacket.ts`, `promptBuilders.ts`, `conversationManager.ts`
- **Severity:** Critical
- **Status:** Confirmed

### Issue 5
- **Issue:** `conversationManager.ts` appears to own too many responsibilities
- **Why it matters:** Hidden interactions make behavior brittle and hard to improve safely
- **Likely files involved:** `conversationManager.ts`
- **Severity:** Important
- **Status:** Completed (Refactored into policy modules)

### Issue 6
- **Issue:** Internal assistant context may be injected into transcript/history in ways that hurt naturalness
- **Why it matters:** Makes the model behave like it is reading a system log instead of a chat
- **Likely files involved:** `route.logic.ts`, `conversationManager.ts`
- **Severity:** Important
- **Status:** Completed (`recentHistory` is transcript-only; structured state stays in `contextPacket`)

### Issue 7
- **Issue:** Constraint and style accumulation may over-constrain future outputs
- **Why it matters:** Long sessions can become stiffer and less natural
- **Likely files involved:** `memoryStore.ts`, `conversationManager.ts`
- **Severity:** Important
- **Status:** Suspected / likely

### Issue 8
- **Issue:** Thread formatting may depend too heavily on delimiter compliance
- **Why it matters:** Broken thread artifacts degrade UX and final quality
- **Likely files involved:** `draftArtifacts.ts`, `writer.ts`, `conversationManager.ts`
- **Severity:** Important
- **Status:** Partially mitigated (`draftArtifacts.ts` fallback parsing improved; upstream writer/planner quality still open)

### Issue 9
- **Issue:** Output shaping may flatten tone too aggressively
- **Why it matters:** Even good drafts can come back feeling same-y
- **Likely files involved:** `responseShaper.ts`, `route.logic.ts`
- **Severity:** Important
- **Status:** Suspected / likely

### Issue 10
- **Issue:** Some direct deterministic-chat tests outside the main package scripts still assume older behavior
- **Why it matters:** Ad hoc test runs can still look broken even though the scripted regression suites are green
- **Likely files involved:** `chatResponder.test.mjs`, `chatResponderDeterministic.ts`
- **Severity:** Medium
- **Status:** Partially mitigated (`chatResponder.test.mjs` was realigned; broader direct-suite hygiene may still be needed elsewhere)

---

## 6. Workstreams

This is the live execution tracker.  
Every meaningful change should update this section.

### Backlog

#### WS-01 — Reduce hardcoded chat feel
- **Description:** Narrow deterministic responses and shift more conversational turns to model-driven behavior
- **Files touched:** `chatResponderDeterministic.ts`, `chatResponder.ts`, `constraintAcknowledgment.ts`, `conversationManager.ts`, `responseShaper.ts`
- **Owner/agent:** Unassigned
- **Status:** In progress
- **Notes:** Constraint acknowledgments, visible reply shaping, plan-pitch sanitization, and planner payload normalization have landed; the next high-leverage layer is still planner/prompt language and deeper plan-detail quality.

#### WS-02 — Make threads first-class
- **Description:** Add thread-specific planning, per-post roles, transitions, and thread-aware critique
- **Files touched:** `planner.ts`, `writer.ts`, `critic.ts`, `promptBuilders.ts`, `conversationManager.ts`
- **Owner/agent:** Unassigned
- **Status:** Backlog
- **Notes:** Likely requires moderate refactor, not just prompt tweaks.

#### WS-03 — Simplify prompt layering
- **Description:** Reduce conflicting / repetitive / overlong instructions
- **Files touched:** `promptBuilders.ts`, `promptHydrator.ts`, `writer.ts`, `critic.ts`
- **Owner/agent:** Unassigned
- **Status:** Backlog
- **Notes:** Must preserve trust constraints while improving naturalness.

#### WS-04 — Separate voice anchors from evidence anchors
- **Description:** Create explicit distinction between style learning and reusable grounded facts/examples
- **Files touched:** `groundingPacket.ts`, `promptBuilders.ts`, `conversationManager.ts`
- **Owner/agent:** Unassigned
- **Status:** Backlog
- **Notes:** Important for specificity without fake autobiography.

#### WS-05 — Reduce transcript pollution
- **Description:** Stop mixing internal assistant context into user-visible conversational history
- **Files touched:** `route.logic.ts`, `conversationManager.ts`
- **Owner/agent:** Unassigned
- **Status:** Completed
- **Notes:** `recentHistory` is now transcript-only and route tests were updated to enforce the contract.

#### WS-06 — Add memory/constraint salience policy
- **Description:** Cap, score, and summarize constraints instead of unbounded accumulation
- **Files touched:** `memorySalience.ts`, `turnScopedMemory.ts`, `memoryStore.ts`, `memoryPolicy.ts`, `turnContextBuilder.ts`
- **Owner/agent:** Unassigned
- **Status:** In progress
- **Notes:** Step 1 and 2 are landed: shared salience policy now normalizes persisted/fallback memory, and turn-scoped freshness now prevents stale topic residue from dominating new directions. Last step is the broader long-session validation sweep plus any small tuning it exposes.

#### WS-07 — Keep orchestrator plumbing aligned with the modular split
- **Description:** Keep direct tests, imports, and helper boundaries aligned with the current modular orchestrator surface
- **Files touched:** `chatResponder.test.mjs`, `chatResponderDeterministic.ts`, `chatResponder.ts`, `constraintAcknowledgment.ts`, `draftPipeline.ts`
- **Owner/agent:** Unassigned
- **Status:** In progress
- **Notes:** `chatResponder.test.mjs`, `test:v2-orchestrator`, and `draftPipeline.ts` lint are green now. `conversationManager.ts` also dropped its duplicated draft-pipeline helper cluster in favor of `draftPipelineHelpers.ts`; next cleanup should reduce the remaining warning-heavy import/service surface there.

---

### In Progress

#### WS-06 — Add memory/constraint salience policy
- **Description:** Shared salience policy now governs what gets saved, and turn-scoped freshness governs what actually stays live when a new turn begins.
- **Files touched:** `memorySalience.ts`, `turnScopedMemory.ts`, `memoryStore.ts`, `memoryPolicy.ts`, `turnContextBuilder.ts`
- **Owner/agent:** Unassigned
- **Status:** In progress
- **Notes:** Two of three steps are complete. The next step is the broader long-session validation pass to confirm the new salience/freshness split holds up end to end.

---

### Blocked

#### None currently
- Use this section if a workstream depends on API, model, product, or architecture clarification.

---

### Completed

#### WS-00 — Decouple conversationManager God File
- **Description:** Refactored the monolithic `conversationManager.ts` file into smaller policy modules (`turnContextBuilder.ts`, `routingPolicy.ts`, `draftPipeline.ts`, `memoryPolicy.ts`). This addresses Issue 5 and prepares for WS-05.
- **Files touched:** `conversationManager.ts`, `turnContextBuilder.ts`, `routingPolicy.ts`, `draftPipeline.ts`, `memoryPolicy.ts`
- **Owner/agent:** Antigravity
- **Status:** Completed
- **Date:** 2026-03-13

#### WS-01 — Reduce hardcoded chat feel
- **Description:** Gutted `chatResponderDeterministic.ts` from 605 to ~170 lines. Removed all greeting, small talk, capability question, meta-assistant, diagnostic, and performance handlers. Only safety-critical paths remain: missing draft edit, failure explanation, user knowledge.
- **Files touched:** `chatResponderDeterministic.ts`
- **Owner/agent:** Antigravity
- **Status:** Completed
- **Date:** 2026-03-13

#### WS-09 — Flatten voice shapers
- **Description:** Response shaping is now narrower and more selective: low-information formulaic openers are stripped, but substantive natural openings are preserved.
- **Files touched:** `responseShaper.ts`
- **Owner/agent:** Antigravity
- **Status:** Completed
- **Date:** 2026-03-13

#### WS-03a — Soften safe-framework mode
- **Description:** `addGroundingUnknowns` now only fires missing-detail unknowns for very short messages (< 40 chars). Safe-framework fallback language changed from generic frameworks to opinionated takes with honest hedging.
- **Files touched:** `groundingPacket.ts`, `promptBuilders.ts`
- **Owner/agent:** Antigravity
- **Status:** Completed
- **Date:** 2026-03-13

#### WS-06a — Initial constraint salience policy
- **Description:** Constraint accumulation now caps at 12 entries, prioritizing hard-grounding (Correction lock / Topic grounding) over generic constraints. Raw user messages only stored as constraints if they match explicit constraint patterns.
- **Files touched:** `conversationManager.ts`
- **Owner/agent:** Antigravity
- **Status:** Completed
- **Date:** 2026-03-13

#### WS-02 — Thread-first planning and critique
- **Description:** Added `ThreadPlanSchema` with per-post beat modeling (role/objective/proofPoints/transitionHint). 6 structural roles: hook, setup, proof, turn, payoff, close. Writer prompt now injects thread beat plans. Critic has 7 thread-specific quality checks (T1-T7).
- **Files touched:** `planner.ts`, `promptBuilders.ts`, `critic.ts`
- **Owner/agent:** Antigravity
- **Status:** Completed
- **Date:** 2026-03-13

#### WS-04 — Two-lane evidence policy
- **Description:** Changed the writer's historical post reference from blanket "voice-only" to a two-lane policy: voice anchors (always safe for style) + evidence anchors (selective fact reuse when confirmed in grounding packet).
- **Files touched:** `promptBuilders.ts`
- **Owner/agent:** Antigravity
- **Status:** Completed
- **Date:** 2026-03-13

#### Initial repo audit conclusions captured
- **Description:** Captured current known architecture, quality problems, and likely high-ROI workstreams
- **Files touched:** `Live Agent.md`
- **Owner/agent:** ChatGPT
- **Status:** Completed
- **Notes:** Starter handoff created based on current repo audit.

---

## 7. Decisions log

This section tracks architectural and product decisions.  
Do not skip updating this when making meaningful changes.

### Decision D-01
- **Decision:** Prioritize naturalness + thread quality over cosmetic refactors
- **Reason:** Product quality has degraded; visible wins matter more than surface cleanup
- **Date:** 2026-03-12
- **Impact:** Future work should optimize for output quality first
- **Follow-up needed:** Yes

### Decision D-02
- **Decision:** Treat thread drafting as a first-class format, not a formatting variation
- **Reason:** Threads likely need dedicated planning and validation
- **Date:** 2026-03-12
- **Impact:** Planning, writing, and critique layers should all reflect this
- **Follow-up needed:** Yes

### Decision D-03
- **Decision:** Avoid adding more hardcoded conversational behavior
- **Reason:** The product already feels too deterministic
- **Date:** 2026-03-12
- **Impact:** New logic should prefer policy + strategy over canned conversational templates
- **Follow-up needed:** Always

### Decision D-04
- **Decision:** Keep truth safeguards, but reduce blunt fallback into bland “framework mode”
- **Reason:** Trust matters, but excessive safety can destroy usefulness and voice
- **Date:** 2026-03-12
- **Impact:** Grounding logic should become more nuanced, not weaker
- **Follow-up needed:** Yes

### Decision D-05
- **Decision:** Two-lane evidence policy — allow selective fact reuse from historical posts when grounding confirms them
- **Reason:** Blanket "voice-only" policy was killing specificity and making all drafts generic
- **Date:** 2026-03-13
- **Impact:** Drafts can now reference user-confirmed facts for stronger, more specific posts
- **Follow-up needed:** Monitor for any increase in hallucinated claims

### Decision D-06
- **Decision:** Cap active constraints at 12, only store explicit constraint declarations
- **Reason:** Unbounded constraint accumulation was making long sessions progressively stiffer
- **Date:** 2026-03-13
- **Impact:** Sessions should stay flexible longer; hard-grounding entries (corrections, topic locks) are always preserved
- **Follow-up needed:** Yes. The newer salience layer now needs to refine which non-critical memory fields decay over longer sessions.

### Decision D-07
- **Decision:** Apply one shared salience policy to both persisted and fallback conversation memory
- **Reason:** Long-session behavior drifts if saved memory and runtime fallback memory are normalized differently
- **Date:** 2026-03-13
- **Impact:** Constraint priority, summary trimming, ideation carryover, and concrete-answer counts now stay aligned whether persistence succeeds or not
- **Follow-up needed:** Yes

### Decision D-08
- **Decision:** Apply a turn-scoped freshness gate before routing/planning consume saved memory
- **Reason:** Even well-normalized persisted memory can still dominate later turns if stale topic summaries and refinement residue stay fully live after the user switches directions
- **Date:** 2026-03-13
- **Impact:** New-topic turns can shed old topic-bound state without dropping hard correction locks or stable preferences, while local draft/plan follow-ups still preserve their context
- **Follow-up needed:** Yes

---

## 8. Good practices for future agents

Follow these rules unless there is a very strong documented reason not to.

### Product / behavior rules
- Do not over-hardcode conversational behavior.
- Do not make the agent feel like a scripted wizard.
- Do not treat threads as split-up single posts.
- Do not let trust safeguards turn everything into bland generic frameworks.
- Do not invent autobiographical facts, wins, metrics, stories, or opinions.
- Do not confuse “sounds like the user” with “pretends to know fake facts about the user.”

### Prompting rules
- Keep prompt layers minimal and non-conflicting.
- Avoid stacking new instructions on top of messy prompts without simplifying first.
- Prefer fewer sharper constraints over long walls of instructions.
- Separate voice/style instructions from fact/evidence permissions.
- Avoid prompt duplication across frontend and backend layers.

### Architecture rules
- Prefer clear policy modules over giant branching manager files.
- Separate:
  - conversation handling
  - routing / intent
  - planning
  - drafting
  - critique
  - revision
  - output shaping
- Do not casually add more logic to `conversationManager.ts` without asking whether it belongs elsewhere.
- Keep refactors incremental unless a larger change is clearly justified.

### Execution rules
- Make the smallest high-ROI fix first.
- Document any behavior-changing decision in this file.
- If you begin a workstream, move it into **In Progress** immediately.
- If you finish a workstream, move it into **Completed** and summarize what changed.
- If you abandon a workstream, explain why.
- Leave the next agent a clean starting point.

---

## 9. Validation checklist

Use this checklist after meaningful changes.

### Naturalness
- [ ] Does the chat feel less scripted?
- [ ] Does the assistant vary its conversational phrasing naturally?
- [ ] Does it stop sounding like a hardcoded workflow engine?

### Planning quality
- [ ] Does the system think before drafting?
- [ ] Does it choose the right format more reliably?
- [ ] Does it avoid jumping straight into weak drafts?

### Single-post quality
- [ ] Are single posts sharper and more specific?
- [ ] Do they sound more like the user?
- [ ] Do they avoid generic framework language?

### Multi-post set quality
- [ ] Are multiple posts meaningfully distinct from each other?
- [ ] Is there less template repetition across outputs?

### Thread quality
- [ ] Does the thread have clear per-post roles?
- [ ] Does the opening create curiosity?
- [ ] Do middle posts advance the idea instead of repeating it?
- [ ] Do transitions feel natural?
- [ ] Does the ending pay off properly?
- [ ] Does it avoid “chopped essay” behavior?

### Trust / grounding
- [ ] Are fake first-person claims reduced?
- [ ] Are user-specific details properly grounded?
- [ ] Is voice imitation preserved without fake biography?

### Architecture / maintainability
- [ ] Is the system easier to reason about?
- [ ] Did the change reduce coupling instead of adding more spaghetti?
- [ ] Is future work safer now than before?

---

## 10. Next agent start here

### Current priority
**Do architecture follow-through without undoing the planner/grounding/thread-quality and memory-salience gains.**

### Remaining phases
1. **Planner/writer quality pass (3 steps)**
   - tighten planner instructions
   - improve planner-to-writer handoff
   - validate with response/orchestrator tests
   - Status: complete. Planner normalization, planner-side hook/proof sharpening, writer-handoff hardening, and the validation sweep are green.
2. **Voice vs factual grounding separation (4 steps)**
   - audit grounding paths
   - split style anchors from factual/evidence anchors
   - update prompt usage and guardrails
   - verify hallucination regressions
   - Status: complete. `GroundingPacket.factualAuthority`, `voiceContextHints`, prompt/claim-check usage, and downstream retrieval/effective-context separation are all landed and regression-tested.
3. **Prompt layering simplification (3 steps)**
   - inventory duplicated/conflicting instruction blocks
   - consolidate shared rules/helpers
   - rerun quality/regression suites
   - Status: complete. Shared grounding-packet prompt assembly lives in `groundingPromptBlock.ts`, shared X-platform prompt rules live in `xPostPromptRules.ts`, shared JSON/output contracts live in `jsonPromptContracts.ts`, and validation is green.
4. **Thread-first quality maturation (4 steps)**
   - refine thread planning quality
   - refine writer execution of thread beats
   - refine critic checks for thread coherence
   - rerun thread-focused regressions/evals
   - Status: complete. Planner-side thread normalization repairs samey beat chains and weak transitions before they reach the writer, writer/critic prompts enforce distinct middle beats plus a real closing move, `finalDraftPolicy.ts` collapses obviously samey adjacent posts in the final output, and the thread-focused validation sweep is green.
5. **Memory/constraint salience follow-through (3 steps)**
   - decide what should persist vs decay
   - implement salience/capping/summarization policy
   - test longer-session behavior
   - Status: complete. `memorySalience.ts` normalizes persisted/fallback memory, `turnScopedMemory.ts` / `turnContextBuilder.ts` scope topic-bound memory per turn, and the long-session validation sweep is green.
6. **Architecture follow-through (2-3 steps)**
   - identify remaining overloaded boundaries
   - move lingering logic into focused modules
   - verify behavior stayed stable
   - Status: completed. Step 1 removed duplicate helper logic from `conversationManager.ts`, step 2 centralized response finalization plus fast-reply shaping in `responseEnvelope.ts`, and step 3 removed the duplicate service/factory boundary so the architecture pass now closes with `pnpm build` green.

### Best next change
Now that transcript cleanup, thread fallback hardening, constraint acknowledgment cleanup, response shaping cleanup, plan-pitch sanitization, planner normalization, grounding separation, prompt-layer simplification, thread-first quality maturation, explicit workspace-handle isolation, memory/constraint salience follow-through, and architecture follow-through have landed, focus on targeted bugs, product polish, or new capability work rather than more structural cleanup by default.

### Safest next implementation step
Audit the remaining orchestrator-heavy surfaces and helper boundaries:
- identify the next cohesive slice inside `conversationManager.ts` that can be removed or rehomed without affecting runtime behavior
- prefer changes that reduce the current unused-import / oversized-service-surface warnings instead of widening the module boundary again
- keep the completed planner, grounding, thread-quality, workspace-handle, and memory-salience layers intact while making the architecture safer for future work

### Biggest risk
When tightening planner/prompt language, do not accidentally strip away the hard factual grounding rules that prevent invented product behavior or fake first-person claims.

### What just changed (2026-03-13)
0. Refactored the `conversationManager.ts` god file into discrete policy modules (`turnContextBuilder`, `routingPolicy`, `draftPipeline`, `memoryPolicy`).
1. Most deterministic chat replies removed — greetings, small talk, capability questions now go through coach LLM.
2. Thread planning now uses per-post beat schemas (hook/setup/proof/turn/payoff/close).
3. Critic has 7 thread-specific quality checks (T1-T7).
4. Safe-framework mode only triggers on very short messages; fallback language softened.
5. Writer can now selectively reuse user-confirmed facts from historical posts (two-lane policy).
6. Constraints capped at 12; only explicit declarations stored.
7. Response shaper now strips only low-information formulaic openers, not substantive natural openings.
8. Shared plan-pitch and planner-normalization helpers now clean user-visible plan language and plan structure before downstream orchestration sees them.
9. `draftPipeline.ts` imports/types were realigned to the modular architecture and lint-cleaned after the helper extraction work.
10. Writer thread-beat instructions now explicitly preserve beat order, post count, proof placement, and transitions, with prompt contract coverage to keep that handoff stable.
11. Planner prompts and normalization now push hooks toward real source tension and remove meta proof filler before it reaches the writer.
12. Planner/writer quality phase is complete; the next active phase is voice-vs-factual grounding separation.
13. The first grounding-separation step is complete: prompts and claim checking now consume an explicit factual-authority lane.
14. The second grounding-separation step is complete: legacy context anchors now split into `factualAuthority` vs `voiceContextHints`.
15. The third grounding-separation step is complete: retrieval/effective-context helpers now keep factual context and voice-context hints separate downstream.
16. Voice-vs-factual grounding separation is complete; the next active phase is prompt layering simplification.
17. Prompt-layer simplification step 1 is complete: grounding-packet prompt assembly now lives in `groundingPromptBlock.ts`, and planner/reviser/critic share that tested contract.
18. Prompt-layer simplification step 2 is complete: X-platform prompt rules now live in `xPostPromptRules.ts`, and writer/reviser/critic share that tested contract.
19. Prompt-layer simplification step 3 is complete: JSON/output contracts now live in `jsonPromptContracts.ts`, and planner/writer/reviser/critic share that tested contract.
20. Prompt-layer simplification is complete; the next active phase is thread-first quality maturation.
21. Thread-first quality step 1 is complete: planner-side thread normalization now repairs duplicate beat chains, dedupes proof points across posts, and upgrades weak transition hints before the writer sees the plan.
22. Thread-first quality step 2 is complete: writer/critic prompts now force stronger role separation in the middle of the thread and reject payoff-as-close endings.
23. Thread-first quality step 3 is complete: `finalDraftPolicy.ts` now collapses obviously samey adjacent thread posts, including closes that only repeat the payoff.
24. Thread-first quality step 4 is complete: the planner, writer, critic, and final-policy layers were revalidated together with thread-focused and orchestrator-level regression coverage.
25. Memory/constraint salience step 1 is complete: `memorySalience.ts` now normalizes persisted and fallback memory, keeping hard grounding sticky while trimming noisy residue, capping ideation carryover, and tightening rolling summaries.
26. Memory/constraint salience step 2 is complete: `turnScopedMemory.ts` plus `turnContextBuilder.ts` now drop stale topic-bound residue on strong topic shifts while keeping local draft/plan continuation cues intact.
27. Memory/constraint salience step 3 is complete: the broader validation sweep stayed green across `test:v2-response-quality`, `test:v2-orchestrator`, and `test:v3-orchestrator`, so the salience/freshness split is now closed out.
28. Architecture follow-through step 1 is complete: `conversationManager.ts` now reuses the shared helper cluster from `draftPipelineHelpers.ts` instead of keeping duplicate implementations, and the diagnostic routing-trace flag is typed instead of cast through `any`.

### Read first
1. `massive-rework.md` (to review the remaining 5 priorities)
2. `apps/web/lib/agent-v2/agents/promptBuilders.ts`
3. `apps/web/lib/agent-v2/agents/planner.ts`
4. `apps/web/lib/agent-v2/core/planPitch.ts`
5. `apps/web/lib/agent-v2/core/plannerNormalization.ts`

---

## 11. Rework vs tweak guidance

Use this section as a bias when deciding effort level.

### Likely small adjustments
- reduce deterministic response coverage
- simplify repeated canned handoff language
- prune or cap constraints/memory
- reduce aggressive response shaping
- improve thread delimiter fallback / validation
- tune safe-mode triggers

### Likely moderate refactors
- split thread planning into its own explicit schema
- separate conversation routing from draft pipeline
- move internal assistant state out of chat transcript assembly
- separate voice anchors vs evidence anchors

### Likely major reworks
- replacing the entire orchestration architecture
- redesigning memory model from scratch
- full prompt system rewrite without an evaluation plan

**Rule:**  
Do not do major rewrites unless moderate refactors clearly cannot solve the core quality problem.

---

## 12. Change log

### 2026-03-13 (Conversation Manager Refactor)
- Refactored `conversationManager.ts` into smaller, testable policy modules: `turnContextBuilder.ts`, `routingPolicy.ts`, `draftPipeline.ts`, `memoryPolicy.ts`.
- Fixed minor TypeScript and import issues with `createDefaultConversationServices`.

### 2026-03-13
- Gutted `chatResponderDeterministic.ts` (605 → 170 lines, kept only safety-critical paths)
- Narrowed `responseShaper.ts` to strip only low-information formulaic openers
- Softened `addGroundingUnknowns` in `groundingPacket.ts` (only fires on short messages < 40 chars)
- Softened safe-framework fallback in `promptBuilders.ts` (prefers opinionated takes over generic frameworks)
- Added constraint salience policy in `conversationManager.ts` (cap at 12, only explicit constraints stored)
- Added `ThreadPlanSchema` to `planner.ts` with per-post beats and 6 structural roles
- Added thread beat planning instructions and JSON schema to `promptBuilders.ts`
- Added thread beat plan injection into writer strategy layer in `promptBuilders.ts`
- Changed evidence policy from blanket "voice-only" to two-lane (voice anchors + evidence anchors) in `promptBuilders.ts`
- Added 7 thread-specific critic checks (T1-T7) to `critic.ts`
- Added shared `planPitch.ts` and `plannerNormalization.ts` helpers for plan-language and plan-structure cleanup
- Repaired `draftPipeline.ts` imports/types after the modular helper extraction and brought the file back to lint-clean
- Added shared `memorySalience.ts` and applied it in `memoryStore.ts` / `memoryPolicy.ts` so persisted and fallback memory now share the same salience rules
- Added shared `turnScopedMemory.ts` and wired it into `turnContextBuilder.ts` so routing/planning/drafting consume fresher per-turn memory instead of blindly inheriting stale topic-bound state
- Removed the duplicated draft-pipeline helper cluster from `conversationManager.ts` in favor of the shared `draftPipelineHelpers.ts` implementation and typed `includeRoutingTrace` on `ConversationalDiagnosticContext`
- Targeted validation is green; if full typecheck disagrees later, treat that as separate follow-up instead of assuming this changelog entry reflects current repo-wide type health

### 2026-03-12
- Created initial `Live Agent.md`
- Captured product mission, current known issues, workstreams, decisions, and validation criteria
- Established future-agent rules for quality-focused work

---
