# Live Agent

**Project:** Xpo  
**Purpose:** Shared working memory + handoff doc for coding agents  
**Last updated:** 2026-03-12  
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
- **Status:** Confirmed

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
- **Status:** Confirmed

### Issue 6
- **Issue:** Internal assistant context may be injected into transcript/history in ways that hurt naturalness
- **Why it matters:** Makes the model behave like it is reading a system log instead of a chat
- **Likely files involved:** `route.logic.ts`, `conversationManager.ts`
- **Severity:** Important
- **Status:** Confirmed

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
- **Status:** Suspected / likely

### Issue 9
- **Issue:** Output shaping may flatten tone too aggressively
- **Why it matters:** Even good drafts can come back feeling same-y
- **Likely files involved:** `responseShaper.ts`, `route.logic.ts`
- **Severity:** Important
- **Status:** Suspected / likely

---

## 6. Workstreams

This is the live execution tracker.  
Every meaningful change should update this section.

### Backlog

#### WS-01 — Reduce hardcoded chat feel
- **Description:** Narrow deterministic responses and shift more conversational turns to model-driven behavior
- **Files touched:** `chatResponderDeterministic.ts`, `chatResponder.ts`, `conversationManager.ts`, `responseShaper.ts`
- **Owner/agent:** Unassigned
- **Status:** Backlog
- **Notes:** High ROI. Likely fastest visible product win.

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
- **Status:** Backlog
- **Notes:** Good medium-depth cleanup with likely quality upside.

#### WS-06 — Add memory/constraint salience policy
- **Description:** Cap, score, and summarize constraints instead of unbounded accumulation
- **Files touched:** `memoryStore.ts`, `conversationManager.ts`
- **Owner/agent:** Unassigned
- **Status:** Backlog
- **Notes:** Good quality safeguard for longer sessions.

---

### In Progress

#### None currently
- Update this section the moment work begins.

---

### Blocked

#### None currently
- Use this section if a workstream depends on API, model, product, or architecture clarification.

---

### Completed

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
**Reduce hardcoded conversational feel and improve thread generation structure.**

### Best next change
Start with the fastest visible win:
1. reduce deterministic chat response coverage
2. inspect where repeated canned phrasing is injected
3. stop flattening model replies unnecessarily

### Safest next implementation step
Audit and simplify:
- `chatResponderDeterministic.ts`
- `chatResponder.ts`
- `responseShaper.ts`

Then evaluate whether the agent feels less robotic before doing deeper architecture changes.

### Biggest risk
Accidentally making the system more natural **but less trustworthy**, or simplifying prompts in ways that reintroduce hallucinated autobiographical content.

### Read first
1. `conversationManager.ts`
2. `promptBuilders.ts`
3. `route.logic.ts`
4. `chatResponderDeterministic.ts`
5. `writer.ts`
6. `planner.ts`
7. `critic.ts`

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

### 2026-03-12
- Created initial `Live Agent.md`
- Captured product mission, current known issues, workstreams, decisions, and validation criteria
- Established future-agent rules for quality-focused work

---