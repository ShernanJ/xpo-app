# Repo audit of xpo-app agent system: highest-ROI fixes for naturalness and thread drafting

## Executive summary

Your agent feels “hardcoded” primarily because a meaningful portion of the chat experience is *literally deterministic* (pattern-matched) and uses repeated canned phrasings, and because multiple layers of post-processing normalize outputs into the same handful of scaffolding replies. fileciteturn51file0L1-L1 fileciteturn50file0L1-L1 fileciteturn49file0L1-L1

Output quality degradation is most likely coming from a combination of: (a) very long, highly prescriptive prompt stacks with many “DO NOT” constraints, (b) safety/grounding guardrails that push the system into “safe framework mode” whenever autobiographical grounding is incomplete, and (c) an explicit instruction to treat historical posts as “voice-only” and *not reuse facts/metrics/stories*, which can remove the most specific material that would otherwise make posts feel real and “earned.” fileciteturn48file0L1-L1 fileciteturn52file0L1-L1 fileciteturn41file0L1-L1

On rework vs targeted fixes: you can get a visible jump in “naturalness” with *small targeted fixes* (reduce deterministic responder coverage, vary acknowledgements/hand-offs, stop stripping/rewriting chat tone in post-processing). fileciteturn51file0L1-L1 fileciteturn45file0L1-L1 fileciteturn49file0L1-L1  
Thread drafting quality, however, is unlikely to fully recover from tweaks alone: the system treats “thread” mostly as “shortform but multiple chunks” (4–6 posts separated by `---`) rather than a first-class narrative/argument arc with explicit per-post roles and transitions. That needs at least a *moderate refactor* (planner schema + thread-specific drafting/critic checks). fileciteturn48file0L1-L1 fileciteturn41file0L1-L1

Overall this is a **combination problem**:
- **Architecture/orchestration:** a centralized “god orchestrator” (`conversationManager.ts`) that mixes routing, memory, grounding, retrieval, planning, writing, critique, and many deterministic gates. fileciteturn41file0L1-L1  
- **Prompt system:** extremely constraint-heavy multi-layer instructions that can reduce spontaneity and voice fluidity. fileciteturn48file0L1-L1  
- **Frontend/UX influence:** the API layer injects “assistant_context/assistant_plan/assistant_draft” blocks into the **same** transcript string used as “recent chat history,” and also contains a large deterministic handoff reply set that can normalize your UI experience into repetitive phrasing. fileciteturn49file0L1-L1

## Codebase mental model

The end-to-end behavior is shaped by four layers: request assembly, orchestration, agent submodules, and post-processing/presentation.

The **API route layer** builds the “recentHistory” string and tries to infer or recover an “activeDraft” from prior assistant messages/draft artifacts. It also embeds structured “assistant_context” blocks into the history string (summary, plan excerpt, draft excerpt, grounding explanation, critique issues). This is then fed to the orchestrator as raw text. fileciteturn49file0L1-L1

The **orchestrator** is `apps/web/lib/agent-v2/orchestrator/conversationManager.ts`. `manageConversationTurn()` is the core control loop. It:
- loads/creates conversation memory, merges “activeConstraints” with “preferenceConstraints,” and may append user messages directly into constraints; fileciteturn41file0L1-L1  
- calls a controller for intent classification unless there is explicit intent or deterministic override; fileciteturn41file0L1-L1 fileciteturn23file0L1-L1  
- pulls style profile + anchors + extracted style rules + extracted “facts” + saved source materials in parallel; fileciteturn41file0L1-L1  
- builds a “grounding packet” (durable facts, turn grounding, allowed first-person claims, allowed numbers, unknowns, source materials) and optionally enforces “safe framework mode”; fileciteturn41file0L1-L1 fileciteturn52file0L1-L1  
- runs a large set of clarification gates, then either ideates, plans, drafts, revises, or “coach chats” based on routing state; fileciteturn41file0L1-L1  
- runs a plan → writer → critic pipeline, including retry loops for grounding drift and “claim check” enforcement. fileciteturn41file0L1-L1

The **agent submodules** are separated, but they are coupled through shared prompt builders and shared context strings:
- `controller.ts` (classification) fileciteturn23file0L1-L1  
- `coach.ts` (conversational response) fileciteturn29file0L1-L1  
- `planner.ts` (strategy plan JSON) fileciteturn27file0L1-L1  
- `writer.ts` (draft JSON) fileciteturn26file0L1-L1  
- `critic.ts` (approval + “finalDraft” enforcement + final draft policy) fileciteturn28file0L1-L1  
- `reviser.ts` (edit-oriented revision; also some deterministic edits) fileciteturn54file0L1-L1  
- all of them depend heavily on `promptBuilders.ts` and `promptHydrator.ts` for prompt assembly. fileciteturn48file0L1-L1 fileciteturn7file0L1-L1

Finally, **post-processing/presentation** shapes output:
- “final draft policy” normalizes thread formatting and removes markdown/CTA patterns; fileciteturn13file0L1-L1 fileciteturn28file0L1-L1  
- “response shaper” strips certain lead-ins, removes trailing follow-up questions, and removes specific canned “I’ll remember that…” notices, which interacts in non-obvious ways with the orchestrator’s memory acknowledgement logic. fileciteturn45file0L1-L1 fileciteturn42file0L1-L1

## Findings by severity and rework vs tweak map

**Critical findings**

The chat experience is heavily deterministic in the exact places users notice “human-ness”: greetings, small talk, capability questions, “why are you asking that,” and meta-quality complaints all map to canned responses (and several share the same repeated sentence). This is the most direct, highest-confidence explanation of “it feels hardcoded.” fileciteturn50file0L1-L1 fileciteturn51file0L1-L1

Thread drafting is not modeled as a first-class object. The planner output schema describes a single “objective/angle/hookType” plan even when `formatPreference === "thread"`, while the writer prompt tells the model “write 4–6 posts separated by `---`.” There is no explicit per-post beat plan (hook post, setup post, proof post, turn, payoff, close), so the model will often generate either (a) an essay chopped into chunks or (b) “mini tweets” that don’t have continuity. fileciteturn27file0L1-L1 fileciteturn48file0L1-L1

Your prompt design explicitly tells the model **not** to reuse facts/metrics/stories from the user’s own historical posts (“voice-only”), which is a strong contributor to “generic output” when current-chat grounding is thin. This is especially damaging for threads (which typically require multiple concrete beats). fileciteturn48file0L1-L1 fileciteturn41file0L1-L1

**Important findings**

`conversationManager.ts` has become an orchestration “god file”: routing, clarification trees, memory patching, style/fact learning, source material persistence, grounding, planning/drafting/revision pipelines, novelty checks, and response shaping decisions are interleaved. This makes it easy for hidden interactions to degrade quality (example: a small change in constraints/unknowns flips the system into safe-framework mode, which then changes both planning and writing style). fileciteturn41file0L1-L1 fileciteturn52file0L1-L1

The system injects “assistant_context / assistant_plan / assistant_draft / assistant_grounding / assistant_critique” blocks into the same **history transcript** used as “recent chat history.” Even if your prompts tell the model “don’t show internal modes,” showing the model these internal labels increases the chance of “workflow engine vibes” and encourages templated meta-language. fileciteturn49file0L1-L1 fileciteturn48file0L1-L1

Grounding safety is implemented as both (a) structured “unknowns” in `groundingPacket.ts` and (b) heavy prompt blocks like “SAFE FRAMEWORK FALLBACK MODE,” plus additional guardrails in writer/critic prompts. In practice, this creates a lot of fail-closed behavior: if the user message doesn’t include a narrow set of “behavior/stakes” cues, the system will either interrogate for details or produce framework-ish generics. fileciteturn52file0L1-L1 fileciteturn53file0L1-L1 fileciteturn41file0L1-L1

Session constraints and style guidelines can grow without strong pruning. The orchestrator merges session constraints and sometimes stores whole user messages as constraints; style guidelines are unioned into `styleCard.customGuidelines` without a hard cap. Over time this can over-constrain voice and increase “stiffness.” fileciteturn41file0L1-L1 fileciteturn38file0L1-L1

**Minor findings**

There are multiple places that try to manage “memory acknowledgement phrasing” and also multiple layers that strip/normalize that phrasing. This is not the primary cause of degraded drafting quality, but it’s a symptom of prompt/response spaghetti and makes chat feel less organic. fileciteturn42file0L1-L1 fileciteturn45file0L1-L1

The LLM JSON parsing layer (`fetchJsonFromGroq`) applies response_format only for Groq-native models, but not for `openai/*` models. Since most agents default to `openai/gpt-oss-120b`, you’re relying on “please respond with JSON” instruction-following and a best-effort JSON extractor. This can cause brittle failures and fallback behaviors during spikes (not necessarily your main quality regression, but it adds instability). fileciteturn25file0L1-L1 fileciteturn26file0L1-L1

### Rework vs tweak map

| Issue | Recommended fix | Effort | Impact | Rework vs small adjustment | Priority |
|---|---|---:|---:|---|---:|
| Deterministic chat replies make agent feel robotic | Greatly narrow deterministic coverage; replace canned messages with style-aware variants; route more “chatty” turns through coach LLM | Low–Med | Very High | Small adjustment | 1 |
| Thread generation lacks per-post beat modeling | Introduce a ThreadPlan schema (per-post roles + transitions) and make writer/critic enforce it | Med | Very High | Moderate refactor | 2 |
| “Historical posts are voice-only” removes specificity | Add an explicit “evidence reuse policy” + “user approved reuse” path (voice pins vs evidence pins); allow selective reuse of *user-owned* facts when safe | Med | High | Moderate refactor | 3 |
| Safe-framework triggers too often → bland outputs | Re-tune slot detector; soften unknown→safe-mode coupling; allow “draft-with-uncertainty” patterns instead of generic frameworks | Low–Med | High | Small adjustment | 4 |
| `conversationManager.ts` is overloaded; hidden interactions | Split into “TurnContext builder,” “ClarificationPolicy,” “DraftPipeline,” “MemoryPolicy” modules; keep behavior identical, reduce coupling | Med | High | Moderate refactor | 5 |
| History transcript includes internal “assistant_context” blocks | Move these blocks out of the chat transcript; pass as separate system-only context | Med | Med–High | Moderate refactor | 6 |
| Constraints + style guidelines accumulate without pruning | Add caps + salience scoring; keep top N constraints; summarize older ones | Low | Med–High | Small adjustment | 7 |
| Thread segmentation is fragile if model misses `---` | Add deterministic post-segmentation fallback and validation; enforce minimum post count for thread mode | Low | Medium | Small adjustment | 8 |
| Revision path over-restricts “make it more specific” | Add “specificity-with-evidence” mode: request missing proof from user or convert to question-based specificity instead of refusing | Low | Medium | Small adjustment | 9 |
| JSON reliability for `openai/*` via Groq | Use a structured output mechanism where supported; add a “repair JSON” retry | Low–Med | Medium | Small adjustment | 10 |

## conversationManager.ts audit

**What responsibilities it currently owns**

`manageConversationTurn()` currently orchestrates almost every major behavior knob: memory hydration and writes, intent classification, style profile refresh + saving, source material harvesting, grounding packet creation, clarification routing, plan generation, plan approval loop, draft generation with retries, novelty checks, revision/edit/review fallback, and “coach mode” fast-path replies. fileciteturn41file0L1-L1

It also embeds product/UI behavior directly in server responses (e.g., fixed strings like “pulled four different post directions…” and deterministic plan pitch closers). That’s a direct vector for “templated feel.” fileciteturn41file0L1-L1

**What it should not own (because it harms output quality)**

It should not own *both* “decide mode” and “generate language” *and* “normalize language.” The current pipeline includes deterministic responder + coach LLM + response shaper + route-layer draft handoff normalizer. That multiplicity of “voice shaping” layers increases the chance that your LLM outputs get flattened into a repetitive “product voice.” fileciteturn41file0L1-L1 fileciteturn51file0L1-L1 fileciteturn45file0L1-L1 fileciteturn49file0L1-L1

It should not directly merge and persist “constraints” without a salience policy. Right now it can append `userMessage` into constraints under some controller outcomes, and it merges constraints with preferenceConstraints; over time this can become “prompt barnacles” that degrade writing tone. fileciteturn41file0L1-L1 fileciteturn38file0L1-L1

**Whether the current design is hurting agent quality**

Yes, in a very specific way: it creates many “small but real” deterministic interventions that collectively dominate the user experience. Even if each one is “reasonable,” the aggregate feels like a workflow engine that occasionally calls an LLM. The deterministic chat responder alone is enough to produce this feeling. fileciteturn50file0L1-L1 fileciteturn51file0L1-L1

**Best restructuring path (high ROI, minimal behavior change)**

A pragmatic refactor path that targets quality (not just cleanliness):

Create a `TurnContext` object built once per request:
- normalized user message
- a structured representation of recent history (without “assistant_context:” inline labels)
- active draft context
- memory snapshot and “salient constraints”
- grounding packet and safe-mode flags
- requested output type decisions (intent + format + lane)

Then split orchestration into three pure “policy engines,” each testable:
- `RoutingPolicy`: intent/mode selection + clarification gating.
- `DraftPipeline`: plan→draft→critic loops, including thread-specific variants.
- `ConversationResponsePolicy`: how to phrase non-draft responses with minimal deterministic overrides.

`conversationManager.ts` would then become mostly glue code that calls these policies and writes memory. The ROI is that you can tune naturalness without accidentally changing grounding behavior, and tune thread drafting without touching chat replies. fileciteturn41file0L1-L1

## Prompt and frontend audit

**Prompt layers that are likely helping**

The grounding packet concept and the “do not invent first-person claims/numbers” constraints are clearly designed to prevent hallucinated autobiographical proof points, and the orchestrator uses them consistently through planning, writing, critique, and claim checks. fileciteturn52file0L1-L1 fileciteturn48file0L1-L1 fileciteturn41file0L1-L1 fileciteturn28file0L1-L1

**Prompt layers that are likely harming naturalness and thread quality**

The writer prompt is extremely long and includes many nested blocks: factual truth layer, strategic plan, style card, thread cadence, creator hints, anti-patterns, plus long “requirements.” This tends to produce cautious, compliance-heavy writing (less “alive”), especially when combined with “safe framework fallback mode.” fileciteturn48file0L1-L1 fileciteturn52file0L1-L1

The most directly harmful instruction for quality (in your context) is: **“USER'S HISTORICAL POSTS … CRITICAL: DO NOT copy facts, metrics, or personal stories … Use them … voice only.”** That is essentially “throw away the user’s best specificity” unless it has been separately captured into durable facts/source materials. If that capture isn’t perfect, the system will write generic. fileciteturn48file0L1-L1 fileciteturn41file0L1-L1

**Frontend / UX contributions that likely degrade outputs**

Your API “recentHistory” includes special internal blocks (assistant_plan, assistant_draft, assistant_grounding, etc.) inside the same string transcript. This pushes the model toward “systemy” internal reasoning styles (even if it tries not to surface them), and it raises prompt entropy. fileciteturn49file0L1-L1

The route-layer draft normalization has a massive list of draft handoff phrases and will replace reply text in some scenarios, which can also create a sameness in the UX (“drafted a version…” over and over). fileciteturn49file0L1-L1

Finally, there are multiple “human-ness” normalizers (response shaper strips fluff/lead-ins; deterministic responder injects canned lines), which can paradoxically create a single consistent—but robotic—assistant tone. fileciteturn45file0L1-L1 fileciteturn50file0L1-L1

## Thread drafting upgrades and concrete implementation plan

### Why thread generation is weak or degraded in this repo

Right now, “thread” is mostly enforced via formatting constraints: “write 4–6 posts separated by `---`,” “keep each post under a per-post limit,” plus an optional `threadFramingStyle` that toggles numbered vs soft-signal vs none. fileciteturn48file0L1-L1 fileciteturn31file0L1-L1

What’s missing is **explicit modeling of post roles and transitions**. The planner schema is still basically “one post plan,” and nothing forces:
- a hook post that opens loops rather than summarizing,
- a setup post that defines the context,
- middle posts that each deliver a distinct beat,
- bridge lines that naturally point to the next beat,
- and a close post that pays off without engagement bait. fileciteturn27file0L1-L1 fileciteturn48file0L1-L1

Also, thread splitting can become fragile: `draftArtifacts.ts` will only split cleanly if the model uses the `---` delimiter, and your post-limit logic for threads can become extremely large on verified accounts (per-post limit derived from account limit). This increases the chance of “one giant post that isn’t really a thread” when delimiter compliance fails. fileciteturn31file0L1-L1 fileciteturn41file0L1-L1

### Top 10 highest-ROI improvements

1) **Reduce deterministic chat coverage drastically (keep only safety-critical deterministic replies).**  
Why it matters: this is your clearest “hardcoded” culprit. Your deterministic responder returns the same phrasing for multiple conversational intents and is used in the conversational fast path. Expected gain: immediate naturalness improvement. Difficulty: low. Touches: `chatResponderDeterministic.ts`, `chatResponder.ts`, and the coach-mode fast path in `conversationManager.ts`. Do now. fileciteturn50file0L1-L1 fileciteturn51file0L1-L1 fileciteturn41file0L1-L1

2) **Introduce a ThreadPlan schema (planner output for thread must include per-post beats).**  
Why it matters: it upgrades thread generation from “formatted chunks” to an actual arc. Expected gain: major thread coherence improvement. Difficulty: medium. Touches: `planner.ts` schema, `promptBuilders.ts` plan instruction, `conversationManager.ts` handling, and `writer.ts` prompt. Do now (core). fileciteturn27file0L1-L1 fileciteturn48file0L1-L1 fileciteturn41file0L1-L1

3) **Add a thread-specific critic check: verify beat separation, continuity, and “no chopped-essay” failure modes.**  
Why it matters: you already enforce many style constraints in the critic; extend it to thread structure. Expected gain: fewer low-quality threads making it to the user. Difficulty: medium. Touches: `critic.ts` and/or a deterministic “thread validator” in orchestrator. Do now. fileciteturn28file0L1-L1 fileciteturn41file0L1-L1

4) **Replace “historical posts are voice-only” with a two-lane policy: Voice Anchors vs Evidence Anchors.**  
Why it matters: your system currently forbids reusing facts/stories from the user’s own history, which forces generic drafting when current grounding is thin. Expected gain: more specificity and “earned” voice. Difficulty: medium. Touches: `promptBuilders.ts` reference anchor block, retrieval/context policy in `conversationManager.ts`, and UI pin semantics if present. Do soon. fileciteturn48file0L1-L1 fileciteturn41file0L1-L1

5) **Stop injecting internal “assistant_context:” blocks into the transcript string.**  
Why it matters: it makes the model read a system log as if it’s a chat, which biases it toward “workflow engine” language. Expected gain: more natural replies and fewer meta/templated phrasings. Difficulty: medium. Touches: `route.logic.ts` recentHistory builder and `conversationManager.ts` expectations. Do soon. fileciteturn49file0L1-L1 fileciteturn41file0L1-L1

6) **Tighten the “safe framework mode” trigger so it doesn’t collapse good drafts into bland generics.**  
Why it matters: unknowns generation + product/career heuristics can be overly sensitive. Expected gain: fewer “framework-y” drafts when the user wanted voicey specificity. Difficulty: low–medium. Touches: `draftContextSlots.ts`, `groundingPacket.ts`, and `conversationManager.ts` safe mode toggle. Do now. fileciteturn53file0L1-L1 fileciteturn52file0L1-L1 fileciteturn41file0L1-L1

7) **Add deterministic thread segmentation fallback if delimiter compliance fails.**  
Why it matters: your whole thread UX depends on `---`. If the writer misses it, thread artifacts can degrade into one post. Expected gain: fewer “thread is broken” outputs. Difficulty: low. Touches: `draftArtifacts.ts` and/or orchestrator post-processing. Do now. fileciteturn31file0L1-L1

8) **Add a “constraint/memory salience” policy: cap and summarize.**  
Why it matters: constraints and guidelines can grow and over-constrain voice. Expected gain: less stiffness over long sessions. Difficulty: low. Touches: memory merge logic and style guideline save logic. Do soon. fileciteturn41file0L1-L1 fileciteturn38file0L1-L1

9) **Flatten the number of “voice shapers”: pick one layer to normalize chat phrasing, not three.**  
Why it matters: deterministic replies + response shaper + route draft handoff normalizer create repetitiveness. Expected gain: better “alive” feel. Difficulty: low. Touches: `responseShaper.ts` + route normalization policy and deterministic responder. Do soon. fileciteturn45file0L1-L1 fileciteturn49file0L1-L1 fileciteturn50file0L1-L1

10) **Harden JSON reliability for `openai/*` models via Groq.**  
Why it matters: planner/writer/critic all depend on strict JSON. When it fails, the system falls back to errors or to deterministic scaffolding. Expected gain: stability and fewer “failed to …” user-facing artifacts. Difficulty: low–medium. Touches: `llm.ts` wrapper + retry/repair. Do later if not currently erroring a lot, but it’s a stability multiplier. fileciteturn25file0L1-L1

### Concrete implementation plan in phases

**Phase 1: fastest wins (days)**
- Remove or sharply narrow the deterministic responder paths for greetings/capabilities/meta complaints. Keep deterministic only for truly safe/necessary cases (e.g., “paste the draft” when none exists), and make acknowledgements vary with voice target rather than a fixed string. fileciteturn50file0L1-L1 fileciteturn51file0L1-L1  
- Add a thread output validator that asserts: (a) at least N posts exist in thread mode, (b) separator correctness, (c) no single-post masquerading. If invalid, run a rewrite prompt that only fixes segmentation and bridging lines (not the whole content). fileciteturn48file0L1-L1 fileciteturn31file0L1-L1  
- Cap active session constraints and style guidelines: keep the most recent or most explicit “hard constraints,” and summarize older constraints into one short line in memory. fileciteturn41file0L1-L1 fileciteturn38file0L1-L1  
- Re-tune “unknowns” triggers so that missing “it does / because” phrasing doesn’t unnecessarily force safe-framework mode; prefer “ask one question OR draft with explicit uncertainty,” not “default to generic framework.” fileciteturn53file0L1-L1 fileciteturn52file0L1-L1

**Phase 2: medium-depth improvements (weeks)**
- Implement ThreadPlan: update planner output so `formatPreference:"thread"` returns a `posts[]` plan with per-post objective, key proof points, and a transition note. Then update writer prompt to draft from that plan. fileciteturn27file0L1-L1 fileciteturn48file0L1-L1  
- Update critic to include thread-structure scoring and rejection reasons for: “repeated hook,” “missing transitions,” “essay chopped into posts,” “no payoff.” fileciteturn28file0L1-L1  
- Refactor orchestration: extract TurnContext + DraftPipeline so thread improvements don’t entangle with memory/clarification logic. fileciteturn41file0L1-L1

**Phase 3: larger re-architecture (if needed, weeks+)**
- Stop building a monolithic “recentHistory” string. Represent history as structured messages and pass internal context (plan/draft refs, grounding) separately from “the chat.” This will reduce systemy leakage into the model’s conversational style. fileciteturn49file0L1-L1  
- Introduce “voice vs evidence anchors” as explicit primitives across retrieval, prompt building, and UI selection. This will let you safely reuse user-specific facts when desired without reintroducing hallucinated proof. fileciteturn48file0L1-L1 fileciteturn41file0L1-L1

### If I were you (blunt)

I would do three things first, in this exact order:

1) **Delete/disable most deterministic chat replies** (especially the “i can help with what to post…” family) because anything else you do won’t matter if the surface keeps feeling canned. fileciteturn50file0L1-L1  
2) **Make thread drafting a first-class pipeline** (ThreadPlan → ThreadDraft → ThreadCritique) instead of “single post prompt + separators.” That’s where your biggest product differentiation and biggest quality pain is. fileciteturn48file0L1-L1 fileciteturn41file0L1-L1  
3) **Stop treating the user’s historical posts as forbidden factual territory in all cases.** Add a controlled way to reuse *user-owned* facts/stories when explicitly allowed or when confidence is high, because “specificity” is the core ingredient of posts that don’t sound AI-generated. fileciteturn48file0L1-L1