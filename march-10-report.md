# Repo audit for improving X post scraping, enrichment, and generation quality

## Executive summary

**A. Executive summary**

### Top five highest-ROI findings

1) **Your scrape stack is already designed with the right product primitive: a canonical “capture” that downstream systems can reuse (preview → bootstrap → canonical capture), plus a session-broker concept that can eventually support rotation without rewriting the scraper.** That separation is explicitly documented (preview vs bootstrap) and aligns with low-friction UX goals. fileciteturn70file1L15-L25 fileciteturn70file1L73-L141 fileciteturn70file1L185-L199

2) **The biggest immediate quality win is not “more scraping,” it’s “better grounding contracts” in generation**—because your writer is still allowed to be creatively generative (temperature 0.45) and your critic mainly enforces style/length/AI-isms, not “factual claim correctness.” fileciteturn97file0L55-L72 fileciteturn97file1L95-L152 fileciteturn97file1L188-L218

3) **Your scraper normalizer already splits post “lanes” (originals vs replies vs quotes) and preserves engagement metrics**, which is exactly what you need to build a usable writing profile and future “what works” models—*if you actually feed that into generation and retrieval.* fileciteturn86file0L5-L13 fileciteturn86file0L280-L307 fileciteturn86file0L448-L458

4) **There is configuration drift (env var naming mismatches) across your “scrape defaults” and the HTTP scraper**, which creates silent failure modes and makes the scraper feel brittle/“randomly broken” during MVP iteration. This is fixable quickly and will materially improve reliability/operability. fileciteturn77file0L57-L65 fileciteturn83file3L41-L64 fileciteturn70file0L1150-L1186

5) **A reusable template/source-material system is likely your single highest-leverage next product feature** for “voice + grounding without friction,” because it gives you *user-approved factual payloads* you can safely reuse across posts—reducing the need to ask questions while also eliminating most “invented story” hallucinations. Your current guardrails already push you toward “literal / framework language when facts are missing,” but templates give you the missing facts. fileciteturn94file0L1-L6

### Top five risks / weak points

1) **Scraper brittleness is real because you rely on internal web flows (web bearer, query IDs, and GraphQL operations) and even auto-discover them by parsing X’s client scripts.** That is inherently drift-prone, and you should treat it as an MVP risk surface. fileciteturn70file0L497-L536 fileciteturn70file0L605-L645

2) **Silent config mismatch risk:** `ONBOARDING_SCRAPE_PAGE_SIZE` exists in your env defaults, but the bootstrap uses `ONBOARDING_SCRAPE_COUNT` to set the page size/count, so operators will believe they tuned onboarding but nothing changes. fileciteturn77file0L57-L65 fileciteturn83file3L41-L64

3) **Another config mismatch risk:** your `.env.example` “pin known GraphQL query ID” names do not match what the scraper actually reads, so “pinning” may not work when you need it most. fileciteturn77file0L99-L110 fileciteturn70file0L1158-L1186

4) **Generation hallucinations are predictable because you’re still sampling creativity in writing, while explicitly trying to produce autobiographical-sounding content**, and your QA step is not structured as a hard “claim verifier.” fileciteturn97file0L55-L72 fileciteturn94file0L1-L6

5) **If you invest in niche-performance enrichment too early (mass-ingesting “what works in startup/builder/AI Twitter”), you’ll likely create operational burden while also increasing “generic best-practices slop” risk.** Your own scraping architecture doc already describes this as a separate, lower-priority, async lane—which is the correct framing, but strongly suggests “defer for MVP.” fileciteturn70file1L313-L329

### Account rotation now vs later?

**Build now, later, or not at all? → _Later, unless scraping reliability is currently blocking onboarding._**

Reason: you already have a “session broker” concept in place (and your HTTP scraper is built around acquiring/marking session success/failure). That gives you a path to rotation without committing to a heavy “account pool platform” today. The highest ROI near-term is making the existing broker + scraping config coherent and observable. fileciteturn70file1L185-L199 fileciteturn70file0L1107-L1156 fileciteturn70file0L1259-L1274

### Niche successful-post enrichment in MVP?

**MVP scope or deferred? → _Defer as a scraping product. Do a “curated exemplars + playbooks” approximation instead._**

Your own architecture doc already frames niche enrichment as a separate, asynchronous lane that shouldn’t starve onboarding. That’s a strong signal it’s not MVP-critical. fileciteturn70file1L313-L329

## Current system map

**B. Current system map**

### How scraping works end-to-end in the repo today

**There are two scrape depths (intentionally separate):**
- **Lightweight profile preview** (best-effort identity confirmation, low latency). fileciteturn70file1L15-L25
- **Onboarding bootstrap scrape** (deeper capture used to power onboarding analysis, but bounded). fileciteturn70file1L73-L141

**Preview path (resolver layering, fastest → most brittle):** the doc lists a layered chain from cached capture to GraphQL guest lookups, syndication endpoints, cookie-auth fallback, HTML parsing, and avatar fallback. fileciteturn70file1L47-L66

**Bootstrap path (HTTP scraper + canonical capture):**
- Your system’s “primary script” is `apps/web/scripts/scrape-user-tweets-http.mjs`. fileciteturn70file1L89-L107  
- The doc’s high-level sequence: normalize handle → resolve session → resolve target `rest_id` → resolve `UserTweets` query ID → call `UserTweets` + bottom-cursor pagination → parse/normalize → persist canonical capture. fileciteturn70file1L101-L141
- The doc states onboarding targets are bounded (default 5 pages, count 40, max normalized posts 250). fileciteturn70file1L119-L127

### Where scraping logic lives

**Main modules:**
- HTTP scraping: `apps/web/scripts/scrape-user-tweets-http.mjs` fileciteturn70file0L1-L110
- Session broker used by the HTTP scraper: acquired/marked success/failure as part of the run. fileciteturn70file0L1107-L1156 fileciteturn70file0L1259-L1274
- Import endpoint: `apps/web/app/api/onboarding/scrape/import/route.ts` calls `importUserTweetsPayload`. fileciteturn92file1L1-L45
- Normalization/parser: `apps/web/lib/onboarding/scrapeUserTweetsParser.ts` extracts profile + posts + replyPosts + quotePosts and metrics. fileciteturn86file0L5-L13 fileciteturn86file0L280-L307
- Persistence: `apps/web/lib/onboarding/scrapeStore.ts` stores a single latest capture per account in `scrapeCaptureCache` with TTL-based pruning. fileciteturn83file0L21-L32 fileciteturn83file0L39-L54 fileciteturn83file0L66-L104

### What requests are being made by the HTTP scraper

The HTTP script (1) assembles web headers that mimic the web app, then (2) uses either cookie auth or guest-token auth, then (3) resolves IDs and fetches the timeline.

**Session modes + headers:**
- Headers include `authorization: Bearer …`, plus cookie + `x-csrf-token` for cookie auth, or `x-guest-token` for guest flow. fileciteturn70file0L390-L440

**Guest-token activation:**
- `POST https://api.x.com/1.1/guest/activate.json` is used to obtain a guest token when cookie auth is not available. fileciteturn70file0L459-L495

**User identity / `rest_id` resolution:**
- Calls `GET https://x.com/i/api/graphql/<queryId>/UserByScreenName` when possible. fileciteturn70file0L721-L753
- Falls back to `GET https://x.com/i/api/1.1/users/show.json?screen_name=...` to resolve the user id. fileciteturn70file0L650-L686
- Falls back further to loading the profile HTML and regex-extracting `rest_id`. fileciteturn70file0L760-L811

**Timeline fetch:**
- Calls `GET https://x.com/i/api/graphql/<queryId>/UserTweets` with variables `{ userId, count, cursor? }`, and paginates via the “Bottom” cursor. fileciteturn70file0L867-L899 fileciteturn70file0L951-L1011

**Drift-prone auto-discovery of bearer + query IDs:**
- The script can crawl `https://x.com`, find client script URLs, and regex-extract operation query IDs and bearer tokens from JS. fileciteturn70file0L497-L536 fileciteturn70file0L605-L645

**Optional import into app backend:**
- The script can `POST` the raw payload to `/api/onboarding/scrape/import` (`maybeImportCapture`). fileciteturn70file0L1012-L1056 fileciteturn92file1L1-L45

### What data is collected and how it’s normalized

Your parser turns the raw GraphQL timeline payload into a stable internal representation:
- **Profile fields** include username, name, bio, avatar, verified status, followers/following, createdAt. fileciteturn86file0L169-L223
- **Post lanes**: originals (`posts`), `replyPosts`, `quotePosts`. fileciteturn86file0L5-L13 fileciteturn86file0L448-L458
- **Engagement metrics** per post: likes, replies, reposts, quotes. fileciteturn86file0L280-L307
- **Hard cap**: `MAX_PARSED_SCRAPE_POSTS = 250`. fileciteturn86file0L12-L12

The importer persists the capture as a canonical record (including lane splits) and returns counts. fileciteturn86file1L66-L102

The scrape store keeps *one latest capture per account* (upsert) and prunes expired entries; TTL is 2 days. fileciteturn83file0L21-L32 fileciteturn83file0L66-L104

### Where generation happens and how it is structured

Your generation pipeline is built as an “agent system”:
- **Writer** produces 1 draft for X given a plan + style card + anchors; it uses a moderately creative setting (temperature 0.45). fileciteturn97file0L55-L72
- **Critic** “QA edits” and enforces constraints/formatting, but its explicit rules focus heavily on style/AI-isms/length and only includes a concrete-scene drift check; it is not framed as a strict factual claim verifier. fileciteturn97file1L95-L152 fileciteturn97file1L188-L218
- **Grounding rules exist** (explicit “do not invent personal anecdotes…metrics…causal claims”), which is the correct direction. fileciteturn94file0L1-L6
- **A deterministic “missing context” evaluator exists** (`evaluateDraftContextSlots`) for product/career-like drafts, which is the right mechanism for “minimum effective questioning.” fileciteturn96file0L34-L107 fileciteturn96file0L344-L401

## Key problems found

**C. Key problems found**

### Scraping reliability and maintainability issues

**Config-name drift / footguns (high impact, low effort)**
- Your onboarding config suggests `ONBOARDING_SCRAPE_PAGE_SIZE=40`, `ONBOARDING_SCRAPE_MAX_POSTS=250`. fileciteturn77file0L57-L65  
- But the bootstrap actually reads `ONBOARDING_SCRAPE_COUNT` (not `...PAGE_SIZE`). fileciteturn83file3L41-L64  
This creates a “you think you tuned scraping but nothing changes” failure mode.

- Similarly, `.env.example` provides `X_WEB_QUERY_ID_USER_TWEETS`, but the HTTP scraper reads `X_WEB_USER_TWEETS_QUERY_ID`. fileciteturn77file0L99-L110 fileciteturn70file0L1158-L1186  
When query IDs drift (the moment you’d want to pin), the “pin” path may silently not work.

**Drift-prone web scraping strategy (inherent risk)**
- Auto-discovering query IDs and bearer tokens by parsing web client scripts is clever, but it is inherently brittle. fileciteturn70file0L497-L536 fileciteturn70file0L605-L645  
Treat this as a “best-effort convenience layer,” not as the foundation of guaranteed onboarding.

**Operational safety: secrets + compliance risk**
- Your architecture doc explicitly calls out that session credentials like `auth_token` and `ct0` are sensitive and should not be committed/hardcoded, and suggests secret management in production. fileciteturn70file1L387-L395  
- Your `.env.example` includes cookie-based auth tokens and session pool file paths, which is fine for local development but should not be the production operational model. fileciteturn77file0L84-L110 fileciteturn77file0L111-L134

### Enrichment and “user model” gaps that affect output quality

**You have the *data foundation* for a real writing profile (lane splits + metrics), but “user modeling” is not yet presented as a product-grade contract that generation must obey.**
- Parser collects the correct primitives (separate lanes, engagement metrics). fileciteturn86file0L5-L13 fileciteturn86file0L280-L307
- Importer persists those lanes. fileciteturn86file1L66-L102

What’s missing (in MVP terms) is not “more data”—it’s **a stronger intermediate representation** that generation can reliably consume:
- “Voice style” should come from posts (cadence, punctuation, formatting).
- “Facts” and “autobiographical claims” should come from *explicit user-approved assets* (templates/stories) or verified facts.
- “Performance patterns” should influence structure choices (hook types, lane preference) without injecting content clichés.

Right now, your system has the pieces, but it still allows the model to “fill in” too much when it wants a story-shaped post.

### Generation architecture: what’s muddy

From the code we can see strong intent toward separation (constraints, grounding, context slot evaluation), but the pipeline still lacks a single, explicit contract like:

> **Allowed Claims Ledger**: a structured list of facts/stories the writer is permitted to assert in first-person.

You do have a guardrail message explicitly forbidding invented anecdotes/metrics/claims. fileciteturn94file0L1-L6  
However, the writer is still sampling creativity for the draft generation. fileciteturn97file0L55-L72  
That combination is exactly where “high fluency, false specificity” tends to sneak in.

## Hallucination diagnosis

**D. Hallucination diagnosis**

### Where hallucinations are entering today

1) **Writer sampling (temperature) + “write like a human” mandate**
- Your writer runs at temperature **0.45**, which is not “wild,” but it is high enough to produce plausible extra details when the prompt feels under-specified. fileciteturn97file0L55-L72

2) **Missing “facts vs voice” hard boundary**
- You *do* have a strong “do not invent” guardrail that names the core failure modes (invented anecdotes, offline events, metrics, causal claims). fileciteturn94file0L1-L6  
- But when a user asks for (say) a product post or a career story and provides only partial context, the writer can still choose to resolve the narrative shape by inventing an experience-like detail.

3) **Critic is not a claim verifier**
- The critic prompt enforces formatting, removes AI-isms, handles X character limits, and prevents some engagement bait. fileciteturn97file1L95-L152  
- It does include a *concrete scene drift* check, which helps for one class of hallucinations. fileciteturn97file1L188-L218  
- But it does not systematically: (a) extract factual claims, (b) compare them to allowed facts, and (c) reject/repair ungrounded claims.

4) **Under-specified requests + insufficient targeted questioning**
- You have a deterministic slot evaluator that can detect “product-like” prompts and whether behavioral/stakes details are present. fileciteturn96file0L34-L107 fileciteturn96file0L344-L401  
- If this gating doesn’t fire (or if the system “pushes through” to keep friction low), you’ll get exactly the symptoms you described: not enough info asked → generic or invented.

### Concrete fixes that map to the architecture you already have

**Fix 1: Introduce a “Fact Model” that is not just free-form constraints**
Create a small structured object the generator must obey, e.g.:

- `allowedFirstPersonClaims[]` (explicitly user-approved)
- `allowedNumbersAndMetrics[]` (only user-supplied numbers)
- `forbiddenClaims[]` (derived from safety + “no fabrication”)
- `unknowns[]` (fields that must be asked or avoided)

Then: the writer prompt should be forced to either:
- use only allowed claims, or
- write a framework/opinion post with *no* first-person specifics.

This directly targets “invented story details / made-up metrics.”

**Fix 2: Add a post-draft “claim checker” pass**
Not a stylistic critic—an actual verifier:
- Extract claims (especially: numbers, named places, “I did X”, “we saw Y%”, timeline phrases).
- If claims are not in the allowed ledger: rewrite them out or return “needs one follow-up question.”

This can be a cheap deterministic layer + a small LLM pass.

**Fix 3: Make “safe modes” first-class outputs**
When `evaluateDraftContextSlots` says the behavior/stakes are missing for product/career-like prompts, offer:
- Safe draft: “framework take” (no autobiography).
- Ask 1 question to unlock story draft.

This preserves low friction while stoppering hallucinations.

## Scraper and account-rotation recommendations

**E. Scraper improvement plan**

### What to improve first (priority order)

**Priority 1: Eliminate config drift (fastest reliability win)**
- Unify env var names between:
  - `.env.example` scrape defaults (pages/page size/max posts) fileciteturn77file0L57-L65
  - Bootstrap logic reading scrape defaults fileciteturn83file3L41-L64
  - HTTP scraper reading query ID pinning + scrape state fileciteturn70file0L1158-L1186  
This is high ROI because it reduces “phantom breakage” dramatically.

**Priority 2: Make “pinning” real for query IDs and bearer tokens**
Your scraper can auto-discover these by parsing scripts. fileciteturn70file0L497-L536 fileciteturn70file0L605-L645  
That’s useful, but when discovery breaks you need reliable manual override that actually works. Today, the mismatch between `.env.example` and script suggests this will be painful. fileciteturn77file0L99-L110 fileciteturn70file0L1158-L1186

**Priority 3: Tighten failure classification + surfaced errors**
Your architecture doc already describes “session-scoped failures” (rotate/cooldown) vs “job-scoped failures” (private account / parser mismatch / shape drift). fileciteturn70file1L329-L365  
Make the scraper’s user-facing errors match that taxonomy so users don’t get “scrape failed” with no remedy.

**Priority 4: Reduce the blast radius of “full payload imports”**
Right now you POST the entire `payload` back to the server. fileciteturn70file0L1012-L1056  
For MVP that’s fine, but your eventual goal should be “scraper returns normalized capture + minimal raw debugging,” not “ship raw GraphQL everywhere.”

### Reliability, maintainability, scalability assessment

**Reliability**
- Good: bounded pagination and defensive “payload shape” checks. fileciteturn70file0L951-L1011
- Risk: reliance on internal endpoints + script parsing for discovery. fileciteturn70file0L497-L536

**Maintainability**
- Good: canonical normalization layer isolates product from X payload shape drift. fileciteturn70file1L199-L207
- Weak: env drift and multiple naming conventions. fileciteturn77file0L57-L65 fileciteturn70file0L1158-L1186

**Scalability**
- You’ve already defined the correct scaling idea (broker + workers + lanes). fileciteturn70file1L313-L329 fileciteturn70file1L367-L383  
But for MVP, don’t implement a full worker fleet unless onboarding is blocked.

### Account rotation / account pool: should you build it now?

**Recommendation: treat account rotation as an “insurance policy,” not a core MVP feature—unless you are already hitting 403/429 frequently.**

Why:
- Your “session broker” concept already exists at the doc level and in the actual script flow (acquire → mark success/failure with cooldown). fileciteturn70file1L185-L199 fileciteturn70file0L1107-L1156 fileciteturn70file0L1259-L1274
- The next step for MVP ROI is to **make the existing broker predictable and observable**, not to build an elaborate allocator.

**If you decide it’s worth doing now (minimal architecture only):**
- Use **a very small pool** (2–3 accounts) purely to reduce the chance one cookie session gets throttled.
- Keep **strict per-session spacing** and cooldown already represented in your config defaults. fileciteturn77file0L111-L134
- Implement **health states**: `healthy / cooling_down / locked / invalid_credentials`.
- Keep orchestration separate: scraper layer outputs canonical capture; enrichment/generation never touches session selection.

But again: if onboarding is working reliably in guest mode, rotation is mostly throughput—not quality.

## Enrichment and template recommendations

**F. Enrichment improvement plan**

### What you’re doing today vs what you need for “usable writing profile”

You are already collecting the right raw signals:
- Lane-separated posts (originals/replies/quotes). fileciteturn86file0L5-L13
- Engagement metrics. fileciteturn86file0L280-L307
- Bounded capture size (250). fileciteturn86file0L12-L12
- Onboarding analysis reads only a subset of posts for analysis (100 originals, 120 replies, 80 quotes). fileciteturn83file1L8-L11 fileciteturn83file1L97-L118

What’s missing (for output feel) is **turning this into a “writing profile” object that generation uses as an authoritative source**, e.g.:

- **Style fingerprint** (already partly implied by your generation approach): punctuation habits, line breaks, average sentence length, hook shapes (question, contrarian, list, story lead), emoji usage, lowercase/uppercase tendencies.
- **Content pillars**: recurring topics/themes, strongest opinions, typical argument structure.
- **Narrative patterns**: what kinds of stories the author actually tells (career, product building, customer anecdotes), and what they *do not* do (e.g., rarely name brands).
- **Performance priors**: “what tends to work” per lane (original vs reply), and per hook type.
- **Exemplar set**: 10–20 “gold posts” that are safe to borrow *structure* from (not facts).

The fastest MVP way to do this:
- Build a lightweight “profile artifact” JSON derived from the canonical capture:
  - `style`: computed stats + a small LLM summary
  - `pillars[]`: top recurring topic clusters
  - `hooks[]`: detect hook templates from first line
  - `formatting`: line break patterns, bullet patterns
  - `exemplars[]`: store IDs + text + why it’s exemplar (based on engagement ratio)

**G. Friction reduction plan**

### Minimum effective questioning strategy (practical)

You already have the key mechanism: `evaluateDraftContextSlots` can detect missing functional/stakes context for product/career prompts. fileciteturn96file0L34-L107 fileciteturn96file0L344-L401

Turn that into a strict decision policy:

- **Generate immediately (0 questions)** when:
  - The user request is explicitly “framework take / opinion / tips” and does not require personal claims, **or**
  - You have an existing reusable asset that matches the request (see templates below).

- **Ask exactly 1 targeted follow-up** when:
  - Prompt is product-like *and* (behaviorKnown == false OR stakesKnown == false). fileciteturn96file0L344-L401  
  - Prompt is career-like *and* it sounds like a story but lacks “what happened” detail.

- **Avoid making a claim entirely** when:
  - The user asks for a personal result, metric, timeline, or named event and you don’t have it in a fact ledger (templates).
  - In that case: write a framework post or ask the one question.

This directly addresses your stated tension: “low friction” vs “weak/inaccurate posts.”

**H. Reusable template / source-material system recommendation**

### Should this be a major next step?

**Yes—this is one of the highest-ROI features to build next**, because it converts your worst failure mode (“invented story details”) into a solvable retrieval problem (“use a verified story/playbook asset”).

It will also reduce questioning friction because:
- the *same* story can fuel multiple angles for weeks,
- the user doesn’t have to retype facts each time,
- you can safely generate first-person claims only when the asset says them.

### How to implement it in your architecture (MVP shape)

**Where it should live**
- A dedicated “Source Material” module adjacent to onboarding and agent-v2:
  - In the repo layering terms you described: between **enrichment/user modeling** and **generation planning**.

**How it should be represented**
Use typed assets (small number of types):
- `story` (who/what/when/lesson, with “allowed claims”)
- `playbook` (steps, principles, anti-patterns)
- `framework` (named model, definitions, examples)
- `case_study` (constraints, results, caveats)

Each asset should have:
- `title`, `type`, `tags`, `verifiedByUser=true/false`
- `claims[]` (explicit sentences allowed in drafts)
- `snippets[]` (2–5 short excerpt chunks)
- `doNotClaim[]` (optional)

**How it should be retrieved**
- Use a simple “retrieve top 1–2 assets by tag/topic similarity” approach.
- If none found, fall back to “framework mode” or ask 1 question.

**Versioning**
- Every edit creates a new version; keep last 5.
- Store “used in drafts” references so you can detect repetition.

**Distinguishing from raw scraped posts**
- Raw posts are “style + prior topics.”
- Templates are “claims you are allowed to assert.”

This is the missing boundary between voice and facts.

## MVP roadmap and top actions

**I. MVP roadmap**

### What to ship in the next few days

1) **Fix env var drift and align naming (scrape defaults + query ID pinning).** This is the fastest path to fewer scrape failures and less time wasted debugging. fileciteturn77file0L57-L65 fileciteturn83file3L41-L64 fileciteturn77file0L99-L110 fileciteturn70file0L1158-L1186

2) **Add an explicit “safe draft mode” toggle in generation**: when context slots are missing, force writer to output a framework post with no first-person claims. fileciteturn94file0L1-L6 fileciteturn96file0L344-L401

3) **Implement a lightweight claim scrubber post-process** (deterministic): remove/flag numbers, dates, named places, and “I/we did X” sentences unless present in allowed facts.

### What to ship in the next two weeks

1) **Reusable source-material MVP (“Story vault” + “Playbook vault”)** with:
   - create/edit
   - tags
   - retrieval into generation
   - explicit “allowed claims” ledger

2) **A true “claim checker” critic pass** (separate from style critic):
   - extract claims
   - compare against allowed facts + user prompt
   - rewrite or ask 1 question

3) **User writing profile artifact** built from canonical capture:
   - hooks
   - formatting fingerprint
   - topic pillars
   - exemplar set
   - lane-aware heuristics

### What to defer

- **Full niche enrichment scraping lane** (mass ingest). Keep it as a planned async lane as in your doc, but do not operationalize it into MVP. fileciteturn70file1L313-L329
- **Large account pool / load balancer** unless 403/429 rates indicate you are blocked. Your current broker approach is enough to postpone heavy infra. fileciteturn70file1L185-L199

**J. Specific code-level recommendations**

### Scraper-layer code changes

- **Unify scrape default env variables**
  - `.env.example`: `ONBOARDING_SCRAPE_PAGE_SIZE` fileciteturn77file0L57-L65
  - `bootstrapScrapeCapture`: currently reads `ONBOARDING_SCRAPE_COUNT` fileciteturn83file3L41-L64  
  **Change:** standardize on one name (`...PAGE_SIZE`), and ensure both the bootstrap path and the HTTP script use it.

- **Unify query-id env var naming**
  - `.env.example` uses `X_WEB_QUERY_ID_USER_TWEETS` fileciteturn77file0L99-L110
  - HTTP scraper reads `X_WEB_USER_TWEETS_QUERY_ID` fileciteturn70file0L1158-L1186  
  **Change:** support both names for one release (backward compatibility), log which is used, then deprecate.

- **Make “manual pinning” first-class**
  - Add a clear log and structured output: `bearer_source=env|discovered|cached`, `queryid_source=env|discovered|cached`.
  - This reduces time-to-debug when X changes scripts. fileciteturn70file0L497-L536 fileciteturn70file0L605-L645

### Generation-layer code changes

- **Reduce hallucinations by tightening writer randomness when facts are missing**
  - `writer.ts` sets `temperature: 0.45`. fileciteturn97file0L55-L72  
  **Change:** if you are in “no fabrication / safe mode,” drop temperature (e.g., 0.2) and explicitly prohibit first-person claims.

- **Upgrade critic into 2 passes**
  - Current critic is great as a “style QA editor,” but it isn’t a claim verifier. fileciteturn97file1L95-L152  
  **Change:** add a “Claim QA” pass that rejects ungrounded specifics.

- **Use `evaluateDraftContextSlots` as the gate for “ask one question vs generate”**
  - These functions already exist and detect missing functional/stakes detail. fileciteturn96file0L34-L107 fileciteturn96file0L344-L401  
  **Change:** make this deterministically authoritative (don’t leave it to LLM “judgment”).

## Ranked list of the next 10 highest-ROI actions

1) **Fix env var naming drift (scrape defaults + query-id pinning) and add explicit logging for which values were used** (impact: high; difficulty: low; MVP relevance: very high). fileciteturn77file0L57-L65 fileciteturn83file3L41-L64 fileciteturn77file0L99-L110 fileciteturn70file0L1158-L1186

2) **Implement a strict “Allowed Claims Ledger” for first-person facts (even if it starts empty)** and force drafts to avoid autobiography unless claims are present (impact: very high; difficulty: medium; MVP relevance: very high). fileciteturn94file0L1-L6

3) **Add a deterministic “numbers/dates/places scrubber” post-processor** that removes unsupported specifics unless present in allowed claims (impact: high; difficulty: low; MVP relevance: high). fileciteturn94file0L1-L6

4) **Turn `evaluateDraftContextSlots` into the single authoritative gate for “ask 1 question vs safe-generate”** (impact: high; difficulty: low-medium; MVP relevance: high). fileciteturn96file0L344-L401

5) **Add a 2nd QA pass: “Claim Checker” (extract claims → verify against allowed facts → rewrite or ask 1 question)** (impact: very high; difficulty: medium; MVP relevance: high). fileciteturn97file1L95-L152

6) **Ship “Source Materials v1” (stories/playbooks/frameworks) with explicit user-verified claims** and retrieval into generation (impact: very high; difficulty: medium; MVP relevance: very high).

7) **Build a “writing profile artifact” from canonical capture**: hook types, formatting fingerprint, topic pillars, exemplar posts (impact: high; difficulty: medium; MVP relevance: high). fileciteturn86file0L5-L13 fileciteturn86file0L280-L307

8) **Make the HTTP scraper return a normalized capture directly (optionally) instead of shipping full raw payloads everywhere** (impact: medium-high; difficulty: medium; MVP relevance: medium). fileciteturn70file0L1012-L1056 fileciteturn86file1L66-L102

9) **Only then**: introduce a small account pool (2–3) **if** you observe frequent 403/429, using the already-present broker acquire/markFailure cooldown flow (impact: medium; difficulty: medium; MVP relevance: conditional). fileciteturn70file0L1107-L1156 fileciteturn70file0L1259-L1274

10) **Defer mass niche scraping; approximate via curated exemplars + playbooks** until onboarding is stable and you have a strong “voice + facts” contract (impact: medium; difficulty: low-medium; MVP relevance: medium). fileciteturn70file1L313-L329