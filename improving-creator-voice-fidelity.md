# Review of stanley-x-mvp: Improving creator voice fidelity and X-native generation

## Executive Summary

Your repo already has the _right macro-architecture_ for an entity["company","X","social network platform"] growth partner: a deterministic “creator model” (profile + strategy + anchors + readiness) and an LLM layer that is forced to operate inside a contract. The biggest wins now are not “more prompting”—they’re **(1) query-time retrieval of relevant past posts**, **(2) a stricter, more explicit “style card” + structural blueprint model**, and **(3) fixing long-form selection/enforcement so the system produces genuinely long, creator-matching outputs**.

My most opinionated diagnosis: you’ve built a decent deterministic core, but the system still *leaks genericness* because the LLM is often given **meta-angles** (“lean into distribution-friendly hooks”) instead of **concrete creator-specific premises** and **the right in-context exemplars** for the *specific request* being made. The architecture is structurally sound; the weakness is mostly **retrieval + creator-style representation + rigorous output enforcement**, with a smaller but meaningful contributor being **model routing** (defaulting to a small fast model will predictably underperform on voice fidelity and long-form).

## How the Current System Actually Works

### End-to-end flow

At a high level, the product is a Next.js app with server routes that load an onboarding run (runId), compute deterministic context/contract, and then generate a response package via a structured multi-pass LLM call.

**Data sources + persistence**
- The system is account-centric: an onboarding run is persisted as JSONL in `db/onboarding-runs.jsonl` via `apps/web/lib/onboarding/store.ts`. Each record stores `input` and `result`. This is intentionally simple (no auth, no DB).  
- The chat routes load the run with `readOnboardingRunById(runId)` and reuse the stored `OnboardingResult` (scraped posts + computed baselines + strategy state).

**Deterministic modeling layer (source of truth)**
- `apps/web/lib/onboarding/creatorProfile.ts` builds a `CreatorProfile` from recent originals + replies + quote posts. It deterministically derives:
  - Niche overlay (domain signals and confidence)
  - Archetype (builder/founder_operator/etc.) with confidence
  - Voice stats (casing, length band, multiline rate, question rate, emoji rate)
  - Distribution loop hypothesis (reply-driven vs standalone discovery vs quote commentary etc.)
  - Playbook: content contract, cadence, tone guidelines, CTA policy, experiment focus
  - Representative examples: best posts, voice anchors, strategy anchors, goal anchors, goal-conflict examples, caution examples
- `apps/web/lib/onboarding/evaluation.ts` scores the above on multiple checks (sample quality, niche quality, anchor quality, playbook quality, etc.) and produces blockers/next improvements.
- `apps/web/lib/onboarding/agentContext.ts` combines the profile + evaluation into `CreatorAgentContext`, dedupes anchors, and outputs a **readiness summary** with a recommended mode:
  - `analysis_only` vs `conservative_generation` vs `full_generation`.

**Contract layer (hard constraints the LLM must obey)**
- `apps/web/lib/onboarding/generationContract.ts` builds a `CreatorGenerationContract` from the agent context + optional tone preference.
  - It sets:
    - Target lane: original / reply / quote (based on distribution loop)
    - Output shape: short form / thread seed / long form / reply / quote
    - Authority budget: low/medium/high (based on follower band + verified flag)
    - Proof requirement copy
    - Tone casing + risk (“safe” vs “bold”) via `resolveTargetTone`
    - Must include / must avoid lists and a critic checklist

**LLM layer (multi-pass, structured output)**
- `apps/web/app/api/creator/chat/route.ts` is the orchestration entrypoint.
  - It loads the run, applies strategy overrides and tone overrides, then calls:
    - `generateCreatorChatReply` from `apps/web/lib/agent-v2/orchestrator/conversationManager.ts`.
- `apps/web/lib/agent-v2/orchestrator/conversationManager.ts` is the core generation system:
  - Builds context + contract deterministically.
  - If not ready (or no model key), it returns deterministic fallback.
  - Otherwise runs a 3-stage pipeline (planner → writer → critic), all JSON-shaped:
    - **Planner** outputs objective/angle/targetLane and mustInclude/mustAvoid deltas.
    - **Writer** outputs response + angles/drafts + supportAsset + whyThisWorks/watchOutFor.
    - **Critic** approves or tightens into final fields.
  - Then the system **reranks** angles/drafts deterministically:
    - Penalizes generic phrases, generic question structures, missing proof, casing mismatch
    - For long-form: penalizes drafts that are still tweet-sized and can trigger an expansion pass.
  - It returns **draft artifacts** with X-weighted character counts, closers, and reply plans.

**Frontend**
- `apps/web/app/chat/page.tsx` fetches deterministic context & contract (server routes), then streams chat results from `/api/creator/chat`.
- The frontend collects structured overrides (goal, cadence, reply budget, transformation mode, content focus, tone casing/risk) and passes them as JSON.
- The frontend also duplicates some “artifact” logic (character counting, closers, reply plan, deterministic fallback) for resilience and editing UX.

### Deterministic vs LLM responsibilities

**Deterministic owns**
- Creator identity/voice/distribution hypothesis
- Readiness gating
- Generation contract (what shape to output, what to avoid, what must be included)
- Anchor selection
- Post-processing (rerank, draft artifact metadata, proof checks)

**LLM is intended to own**
- Language realization: turning an angle + exemplars + constraints into drafts that feel like the creator
- Local structure selection: which blueprint to use, how to phrase the hook, which proof to emphasize

### Where frontend still influences backend behavior incorrectly

You’ve largely respected your stated constraint (“frontend should collect structured inputs; backend owns generation logic and shape”). The overrides are structured and applied server-side in `strategyOverrides.ts`.

That said, there are two **architectural drifts** that will bite you later:
1. **Duplicate deterministic logic in the client.** `apps/web/app/chat/page.tsx` re-implements:
   - X weighted character counting
   - “Better closers” and “reply plan”
   - Deterministic fallback draft behavior  
   This will drift from `conversationManager.ts` and create “it worked on screen but not in API” discrepancies.
2. **The UI effectively defines important taxonomy.** The `contentFocusOptions` list and the “setup prompt” flow strongly shape what the system considers “content planning,” but they aren’t represented as first-class backend domain objects (they’re passed in as strings). That’s acceptable for MVP, but it’s a real product-logic surface.

## Root Causes of the Current Quality Problems

Your pain points (voice mismatch, long-form weakness, generic startup advice, scraped posts not strongly used) track to a small number of systemic causes.

### Why it still misses creator voice

Your repo *does* measure voice at a high level (casing, length band, multiline/question/emoji rate) and it passes a few “voice anchors” into prompting. The issue is: **voice fidelity is mostly micro-patterns**, and your deterministic voice model does not yet represent those micro-patterns as enforceable constraints.

What’s currently missing (or underrepresented) in the deterministic layer:
- **Surface markers**: typical openers/closers, common sentence fragments, punctuation rhythm, “internet casing” habits, typical emoji choices, swearing/slang propensity, “confidence posture” (hedged vs declarative).
- **Distribution posture**: whether the creator typically “asks” vs “states,” whether they end posts with questions, whether they post fragments, whether they do receipts-first (“shipped X in Y hours”) vs essay-first.
- **Topic-to-voice coupling**: many creators change voice by lane (replies vs top-level, technical vs social). Your voice anchors pull only from original posts; you don’t maintain “reply voice anchors” or “quote voice anchors” as separate voice regimes.

Net: the LLM is given a few anchors, but it is not sufficiently **boxed in** to reproduce the creator’s cadence reliably for _a given request_.

### Why it still misses long-form structure (especially for verified / long-form-capable users)

You have several good components for long-form already:
- `pickOutputShape` sets `long_form_post` based on verified status or long average length.
- The writer/critic prompts explicitly warn against tweet-sized long-form.
- There’s a long-form expansion pass if none of the drafts look “clearly long-form.”

But there are two core issues:

1. **Selection logic conflates “can post long-form” with “does post long-form.”**  
   Treating `isVerified` as a strong reason to default to `long_form_post` will produce mismatches for verified accounts whose _actual style is short_. This can degrade voice fidelity and cause the system to “force” a format the creator doesn’t use.

2. **Enforcement thresholds are too soft and not creator-calibrated.**  
   Your `isClearlyLongFormDraft` threshold is low (it can accept drafts that are only modestly larger than a normal tweet). This allows the pipeline to “pass” with outputs that still feel tweet-sized compared to what users mean by “long-form creator.”

Additionally, your blueprinting uses a single selected exemplar from the `positiveAnchors` pool. If that exemplar isn’t truly representative of the creator’s best long-form structure, the model’s structure will drift.

### Why the outputs still feel generic (and why “startup advice” sneaks in)

The single biggest driver of genericness is: **when the user request is underspecified, the system’s “fallback angle” is still a meta-angle** (strategy guidance) instead of a concrete post premise.

Examples in your deterministic layer that can become “meta” when used as the topic itself:
- `CreatorProfile.strategy.recommendedAngles` are often phrased as guidance (“Lean into distribution-friendly hooks…”). Those are useful for planning, but risky as the “primary angle” that the LLM must write about.
- The playbook and strategy delta are necessarily abstract and can push the model into “consultant-speak” unless a concrete subject is present.

You’ve already tried to mitigate this with:
- `extractConcreteSubject` (great)
- “Don’t introduce startup tropes unless present” instructions (good)
- Generic phrase penalties and reranking (good)

But the structural problem remains: **you aren’t doing query-time retrieval of the most relevant concrete past posts or concrete creator artifacts** for the specific request. You pass static anchors (voice/strategy/goal), not request-conditioned anchors. Static anchors help tone; they don’t solve relevance.

### Is it retrieval, contract design, data model, prompting, reranking, frontend interference, missing memory?

In your current state, the biggest contributors are:

- **Retrieval (high impact):** missing query-time retrieval + missing separate anchor sets per lane (original vs reply vs quote)  
- **Data model (high impact):** voice model is too low-resolution; “style card” is not explicit enough  
- **Contract design (medium impact):** output shape selection rules need tightening; long-form targets need explicit numeric constraints  
- **Prompting (medium impact):** prompts are already strong; improvements should mostly come from better inputs and better enforcement  
- **Reranking (medium impact):** good start, but long-form enforcement and “concreteness enforcement” should become stricter/dynamic  
- **Frontend interference (low-medium):** not “leaking prompts,” but duplicating deterministic logic will drift  
- **Memory/state (high impact):** no persistence of “user corrected the tone,” pinned exemplars, or “this is what my voice should be for X” beyond a single onboarding run.

## Top 10 Highest-ROI Improvements

Below are the highest-ROI changes in strict priority order, optimized for voice fidelity + long-form matching + X-native workflow, while preserving your constraint that backend owns generation.

### Query-time retrieval of relevant posts

**Why it matters**  
Static anchors help tone, but relevance and specificity require **the right past post(s) surfaced for the current request**. This is the most direct fix for “scraped posts aren’t used strongly enough” and “generic startup advice.”

**Where to change**
- `apps/web/lib/agent-v2/orchestrator/conversationManager.ts` (right before writer call): select “request-conditioned anchors”
- Potentially factor into a module called `retrieval.ts` under onboarding lib

**Type**: deterministic model logic  
**Complexity**: medium  
**Expected impact**: high

**Concrete implementation sketch**
- Implement a simple hybrid scorer over the creator’s original posts:
  - lexical overlap (signal terms) + recency weight + engagement lift
  - optionally treat hashtags/mentions differently
- Return:
  - `topicAnchors`: 3–5 past posts most relevant to the request
  - `formatAnchors`: 1–2 posts matching the required output shape
- Feed those as explicit sections into writer/critic prompts.

### Model routing: stop defaulting to a small general model for “writer”

**Why it matters**  
Voice fidelity + long-form structure are exactly the tasks where smaller models tend to collapse into genericness. Your default provider in the route is “groq”, and the default model is `llama-3.1-8b-instant`. That’s a predictable quality bottleneck. Using a stronger writer model is a *system quality* move, not prompt tuning.

**Where to change**
- `apps/web/lib/agent-v2/orchestrator/conversationManager.ts` (`resolveProviderConfig`, or support per-stage model selection)
- `apps/web/app/api/creator/chat/route.ts` (default provider selection if you keep it there)

**Type**: backend generation logic (model architecture / routing)  
**Complexity**: low-medium  
**Expected impact**: high

**Concrete approach**
- Use a “small model” for planner (cheap) and a “strong model” for writer+critic (quality).
- Route based on output shape:
  - `long_form_post` and `thread_seed`: always strong model
  - `reply_candidate`: cheaper acceptable

### Fix output-shape selection so verified ≠ long-form by default

**Why it matters**  
Your current `pickOutputShape` can select `long_form_post` purely because `isVerified` is true. That will mis-match creators whose observed behavior is short-form and will create downstream “long-form but tweet-like” conflicts.

**Where to change**
- `apps/web/lib/onboarding/generationContract.ts` (`pickOutputShape`)

**Type**: deterministic model logic  
**Complexity**: low  
**Expected impact**: high

**Concrete rule**
- Choose `long_form_post` only if:
  - the creator **actually writes long** (e.g., average length band is long, or multiLinePostRate high, or there exist posts above a long threshold), not just verified.
- Keep verified as an “upper bound capability,” not the default.

### Make long-form enforcement numeric and creator-calibrated

**Why it matters**  
Your current “long-form” checks can pass on drafts that are barely longer than average. Real long-form creators have recognizable shapes: paragraphs, bullets, proof blocks, and a minimum density of specifics.

**Where to change**
- `apps/web/lib/agent-v2/orchestrator/conversationManager.ts`
  - `isClearlyLongFormDraft`
  - `scoreDraftCandidate` for `long_form_post`
  - long-form expansion prompt builder

**Type**: deterministic model logic + contract change  
**Complexity**: low-medium  
**Expected impact**: high

**Concrete changes**
- Compute a **target word range** from the chosen format exemplar:
  - If exemplar is 140 words, require drafts >= 110 words
  - If no exemplar, set minimum >= 90 words for `long_form_post`
- Raise the “clearly long-form” threshold substantially.
- In the writer/critic prompts, state explicit targets:
  - “target 120–200 words, 4–7 beats, at least 1 proof block, no forced question ending.”

### Add a deterministic “Style Card” and use it everywhere

**Why it matters**  
Right now you have “voice stats” and “voice anchors,” but not a reusable object that other modules can enforce. You need a `StyleCard` that includes explicit “dos/don’ts” and repeatable micro-templates.

**Where to change**
- `apps/web/lib/onboarding/creatorProfile.ts` (build and attach `styleCard`)
- `apps/web/lib/onboarding/generationContract.ts` (voiceGuidelines + mustAvoid/mustInclude incorporate style card)
- `apps/web/lib/agent-v2/orchestrator/conversationManager.ts` (use style card in prompts + reranker)

**Type**: deterministic model logic + API contract change  
**Complexity**: medium  
**Expected impact**: high

**What the Style Card should contain (minimal v1)**
- Preferred openers list (extracted n-grams / regex families from posts)
- Preferred closers list (e.g., “thoughts?” vs “curious if…”)
- Emoji policy: allowed emoji set (top 5 used) + max count
- Punctuation posture: lots of ellipses? dashes? no period endings?
- “Forbidden phrases” personalized (things they never say)
- “Signature words” list (things they repeatedly say)

### Separate voice anchors by lane (original vs reply vs quote)

**Why it matters**  
A lot of “X-native authenticity” is lane-dependent. Someone may write clean standalone posts but very casual replies. If you use only original-post anchors, your reply generation will feel off.

**Where to change**
- `apps/web/lib/onboarding/creatorProfile.ts` (representative examples should include reply voice anchors and quote voice anchors)
- `apps/web/lib/agent-v2/orchestrator/conversationManager.ts` (choose anchors based on target lane)

**Type**: deterministic model logic  
**Complexity**: medium  
**Expected impact**: high

### Stop using meta-strategy strings as the default “angle” unless the user gave no subject

**Why it matters**  
When the user request is vague (“draft me a post idea”), the system falls back to `primaryAngle`, which is often strategy guidance. That nudges the LLM into generic.

**Where to change**
- `apps/web/lib/onboarding/generationContract.ts` (how `primaryAngle` is chosen)
- `apps/web/lib/agent-v2/orchestrator/conversationManager.ts` (planner and writer should prefer a concrete subject if missing, or ask for one)

**Type**: contract change + deterministic planning logic  
**Complexity**: low-medium  
**Expected impact**: medium-high

**Concrete move**
- Replace generic “recommendedAngles” as `primaryAngle` with something more concrete:
  - a specific content pillar from topic extraction
  - or a “next-post premise template” that forces concreteness:
    - “what i shipped this week + the one surprising thing + what i’d do differently”
- If no concrete subject exists, return 2–3 **concrete question prompts to the user** (not generic “what should I post about?”), e.g.:
  - “what did you ship in the last 7 days?”
  - “what’s the messiest bug you hit this week?”
  - “what’s the one metric that moved?”

### Persist a per-handle “creator memory” without auth (file or SQLite)

**Why it matters**  
Users will correct the system (“use all lowercase,” “stop sounding like LinkedIn,” “I never say ‘excited to share’”). If you don’t persist those corrections, voice fidelity will plateau.

**Where to change**
- Add a new `creator_state` store keyed by handle (or runId → handle mapping)
- Keep onboarding runs immutable, but store “overrides and preferences” separately

**Type**: data/storage change  
**Complexity**: medium  
**Expected impact**: high

**Schema boundary (minimal)**
- `CreatorState`
  - `handle`
  - `styleOverrides` (casing, risk, banned phrases, emoji policy)
  - `pinnedAnchorIds` (format exemplar + voice exemplars)
  - `lastUpdatedAt`
- Keep deterministic derived profile still recomputable from raw posts.

### Make the backend the single source of truth for artifacts (remove client duplication)

**Why it matters**  
Right now, client and server both compute:
- weighted character counts
- closers
- reply plans
- fallback drafts  
This will drift and create debugging chaos later.

**Where to change**
- Move shared artifact logic into `apps/web/lib/onboarding/artifacts.ts` (or similar)
- Import in both `conversationManager.ts` and `chat/page.tsx` (shared library)
- Keep server as authoritative for the response shape; client only renders.

**Type**: UI contract change + deterministic logic refactor  
**Complexity**: low  
**Expected impact**: medium

### Strengthen evaluation into a regression harness: measure voice fidelity + structure

**Why it matters**  
You already have `evaluateCreatorProfile`, which evaluates deterministic readiness. You still need **generation evaluation** for:
- voice similarity to anchors
- structural similarity (bullets/sections/word count)
- banned phrase leakage
- proof inclusion rate

**Where to change**
- `apps/web/lib/onboarding/evaluation.ts` (add “generation eval”)
- Add a test runner under `apps/web/lib/onboarding/__tests__` or a simple CLI script

**Type**: deterministic evaluation + testing harness  
**Complexity**: medium  
**Expected impact**: medium-high (debuggability + iteration speed)

## What To Avoid Right Now

### Don’t sink time into “prompt polishing” as the primary lever
Your prompts are already quite explicit. Most remaining failures are upstream: missing request-conditioned retrieval, weak style modeling, and soft enforcement. Prompt tweaks alone will keep producing “sometimes it matches, sometimes it doesn’t.”

### Don’t build auth/OAuth or posting automation yet
You’ll be tempted to add sign-in + user-context metrics. But until drafts reliably match voice and structure, auth is a distraction. Stay account-centric and focus on generation quality + workflow.

### Don’t add more agents
You already have planner → writer → critic. Adding more agents (researcher, editor, etc.) will increase variance and cost without solving the core issue: the model needs better exemplars and stronger enforcement.

### Don’t over-index on a giant “calendar” feature
A content calendar only helps if the *generated posts are good*. Build the X-native artifact workflow first (thread builder, long-form builder, reply plan) and then layer calendaring on top.

## Concrete Roadmap

### Next one to two days

**Goal:** make outputs concretely grounded, more X-native, and reliably creator-matching.

- Implement query-time retrieval for the specific request in `conversationManager.ts` and pass “topic anchors” into writer/critic.
- Fix `pickOutputShape` so “verified” doesn’t force long-form; require observed long-form behavior.
- Raise and calibrate long-form enforcement thresholds (dynamic word target from exemplar).
- Introduce Style Card v1 (openers/closers, emoji policy, punctuation posture, forbidden phrases) and inject into contract + reranker.
- Add lane-specific voice anchors (reply vs quote vs original), and select them based on `targetLane`.
- Change model routing so writer/critic use a stronger model for long-form + threads, while planner can stay cheap.

### Next one week

**Goal:** reduce drift, improve debuggability, and make the workflow feel like an X-native tool, not “LinkedIn in disguise.”

- Create a shared artifact module for weighted counts/closers/reply-plan; delete client/server duplication.
- Add a per-handle creator memory store (no auth):
  - store user corrections to voice + pinned exemplars
  - store “never write like this” banned phrases
- Expand artifact types:
  - threads as arrays of tweets with per-tweet limits
  - real thread builder in UI (reorder, collapse/expand, per-tweet counters)
- Build a small regression harness:
  - fixed test accounts and golden prompts
  - tracked metrics: banned phrase rate, proof inclusion rate, long-form compliance, anchor similarity

### Before scaling, before auth, before multi-user persistence

**Goal:** lock clean boundaries so the system can scale without rewrites.

- Introduce a real storage layer (SQLite is enough initially; Postgres later) with strict boundaries:
  - Raw scraped posts and metrics (immutable)
  - Derived deterministic profile (versioned, recomputable)
  - CreatorState memory (mutable overrides, pinned anchors)
  - Generation logs (inputs/outputs, model used, scores)
- Treat deterministic model versions as first-class:
  - you already version `CREATOR_PROFILE_MODEL_VERSION`, `CREATOR_AGENT_CONTEXT_VERSION`, and `CREATOR_GENERATION_CONTRACT_VERSION`; keep that discipline and add generation eval versioning too.
- Add “exemplar pinning” as a core abstraction:
  - pinned voice exemplars
  - pinned structure exemplars per output shape
  - pinned “do not imitate” posts

If you want one “north star” implementation principle to keep the system honest: **every generated draft should be explainable as “this came from these 3 exemplars + this style card + this required output structure.”** Right now you have parts of that; the next step is making it request-conditioned, persistent, and enforceable.