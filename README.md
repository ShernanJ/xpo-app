# X Growth Engine by shernan javier ✦

> A growth operating system for X.
>
> Write → Predict → Publish → Measure → Explain → Prescribe → Repeat.

---

## 🧠 What This Is

X Growth Engine is a native intelligence engine designed to:

* Systematically solve **0 → 1,000 followers**
* Reduce posting variance
* Enforce measurable learning loops
* Scale strategy as accounts grow

Phase 1 builds the **brain**.

No extension dependency.
Deterministic modeling first.
Structured ingestion second.

---

## 🧱 Stack (Phase 1)

* **Web:** Next.js (TypeScript) + Tailwind
* **DB:** Postgres (**Neon**)
* **ORM:** Prisma
* **Workers / Queue:** Upstash Redis

This keeps Phase 1 affordable, fast to iterate, and strong on structured modeling.

One ingestion platform.
Two job types.
Shared controls and learning loops.

---

## 🎯 Objective (Phase 1)

Validate that the engine can:

* Onboard a 200-follower account
* Provide structured daily guidance
* Improve engagement quality within 2–3 weeks
* Demonstrate measurable variance reduction

If Phase 1 works alone, the engine is validated.

---

# 🏗 Core Architecture

## 1️⃣ Source-Agnostic Onboarding Ingestion (Scrape-First)

User provides:

* `@username` or `x.com/username`

We enqueue an **onboarding bootstrap job** that fetches:

* Profile info
* Follower count
* Posting cadence
* Recent tweets (20–50)
* Public engagement metrics

From that capture we compute:

* Engagement baseline
* Content type distribution
* Hook patterns
* Length patterns
* Posting frequency
* Growth stage (0–1k focus)

We only ask the user:

* Primary goal (followers / leads / authority)
* Time budget per day
* Tone preference (lowercase / normal, safe / bold)

Everything else is inferred from ingestion + models.

Scrape is primary for Phase 1. API fallback remains optional and explicitly gated.

---

# 🧠 Core Intelligence Components

## A) User Performance Model

Analyzes last 20–50 posts:

* Engagement per format
* Engagement vs baseline
* Hook performance
* Length optimization
* Conversation triggers

Produces:

* Best-performing format
* Underperforming patterns
* Format-specific guidance
* Baseline engagement profile

---

## B) Niche Benchmark Model (Async)

Continuously pulls from curated anchor accounts.

Extracts:

* Hook structures
* Character ranges
* CTA types
* Format ratios
* Engagement velocity patterns

Stores:

* Niche benchmark stats
* "Winner structures"
* Ideal structural ranges

Prevents blind LLM guessing.

---

## C) Growth Stage Detector

Determines strategy phase using:

* Follower count
* Engagement rate
* Growth velocity

Stages:

* **0–1k** → Distribution heavy
* **1k–10k** → Authority heavy
* **10k+** → Leverage heavy

Phase 1 optimizes heavily for 0–1k.

---

# ✍️ Composer (Variance Reduction Engine)

While writing, the user sees:

* Hook strength score
* Length optimization guidance
* Niche alignment score
* Predicted engagement vs baseline

Two rewrites available:

* Safe (benchmark aligned)
* Bold (higher variance)

Goal:

Reduce randomness before posting.

---

# 📊 Postmortem Engine (Learning Enforcement)

After publishing, the system:

Compares:

* Post vs user baseline
* Post vs niche benchmarks
* Prediction vs outcome

Explains:

* Why it worked
* Why it didn’t
* Structural gaps

Prescribes:

* What to post next
* Whether to build a series
* Whether to pivot format
* Which loop to double down on

This enforces compounding growth.

---

# 🔄 Async Intelligence + Ingestion

## 1️⃣ Onboarding Bootstrap Lane (High Priority)

* Low-volume, latency-sensitive jobs
* Pulls a target account for onboarding
* Produces canonical profile + post capture

## 2️⃣ Niche Enrichment Lane (Low Priority)

* High-volume background crawling of anchor accounts
* Extracts proven structures and benchmark ranges
* Refreshes benchmark store continuously

## 3️⃣ Account/Session Broker

* Shared rate limits and cooldown policy
* Health scoring per session/account
* Lease-based routing so workers do not collide

## 4️⃣ Shared Scraper Executor

* One HTTP fetcher reused by both lanes
* One parser/normalizer path to canonical records
* Common retry/backoff semantics

## 5️⃣ User Analyzer Worker

* Classifies new posts
* Computes deltas vs baseline
* Updates user model snapshot

## 6️⃣ Strategy Adjuster

* Detects stagnation
* Rebalances recommendation weights

---

# 🔁 Closed Loop (Phase 1)

```
Write
  ↓
Predict
  ↓
Publish
  ↓
Measure
  ↓
Explain
  ↓
Prescribe
  ↓
Repeat
```

This loop is the product.

---

# 📦 Proposed Project Structure

```
stanley-x/
│
├── apps/
│   ├── web/                         # Next.js frontend (App Router)
│   │   ├── app/
│   │   │   ├── page.tsx              # Landing
│   │   │   ├── onboarding/
│   │   │   ├── dashboard/
│   │   │   ├── composer/
│   │   │   ├── postmortem/
│   │   │   └── settings/
│   │   ├── components/
│   │   │   ├── composer/
│   │   │   ├── analytics/
│   │   │   └── growth/
│   │   ├── lib/
│   │   │   ├── api-client.ts
│   │   │   └── hooks/
│   │   └── styles/
│   │
│   └── api/                         # Thin API layer (can be Next.js routes or standalone)
│       ├── src/
│       │   ├── routes/
│       │   │   ├── onboard.ts
│       │   │   ├── compose.ts
│       │   │   ├── predict.ts
│       │   │   ├── postmortem.ts
│       │   │   └── strategy.ts
│       │   ├── services/
│       │   │   ├── onboarding.service.ts
│       │   │   ├── composer.service.ts
│       │   │   └── postmortem.service.ts
│       │   ├── middleware/
│       │   └── server.ts
│       └── package.json
│
├── packages/
│   ├── core/                        # Deterministic intelligence engine (pure logic)
│   │   ├── onboarding/
│   │   ├── performance/
│   │   ├── niche/
│   │   ├── composer/
│   │   ├── postmortem/
│   │   └── strategy/
│   │
│   ├── scoring/                     # Modular scoring system
│   │   ├── modules/
│   │   │   ├── hookStrength.ts
│   │   │   ├── nicheAlignment.ts
│   │   │   ├── lengthOptimization.ts
│   │   │   └── conversationTrigger.ts
│   │   ├── blendWeights.ts
│   │   └── types.ts
│   │
│   ├── models/                      # Structured intelligence snapshots
│   │   ├── userModel.ts
│   │   ├── nicheModel.ts
│   │   ├── growthStage.ts
│   │   └── strategyState.ts
│   │
│   ├── prompts/                     # LLM prompt templates (versioned)
│   │   ├── composer.prompts.ts
│   │   └── postmortem.prompts.ts
│   │
│   ├── types/                       # Shared TypeScript contracts
│   └── utils/
│
├── workers/                         # Async intelligence layer
│   ├── scrape-ingestion/
│   │   ├── onboarding-bootstrap.ts
│   │   ├── niche-enrichment.ts
│   │   ├── account-broker.ts
│   │   └── normalize-capture.ts
│   │
│   ├── niche-intel/
│   │   ├── pullTopPosts.ts
│   │   ├── extractStructures.ts
│   │   └── index.ts
│   │
│   ├── user-analyzer/
│   │   ├── classifyPosts.ts
│   │   ├── computeDeltas.ts
│   │   └── index.ts
│   │
│   └── strategy-adjuster/
│       ├── detectStagnation.ts
│       └── index.ts
│
├── db/
│   ├── schema.prisma (or migrations/)
│   └── seed/
│
├── scripts/
│   ├── seed-niches.ts
│   └── reanalyze-user.ts
│
├── infra/
│   ├── redis/
│   ├── docker/
│   └── env/
│
└── README.md
```

Key principles:

* `apps/web` owns UI only.
* `apps/api` is a thin orchestration layer.
* `packages/core` contains deterministic intelligence.
* `workers/` enforce async learning loops.
* Intelligence snapshots live in structured models, not raw tweet blobs.

UI never owns logic.

---

# 🗄 Data Model (High-Level)

Core tables:

* `users`
* `user_models`
* `user_posts`
* `niche_benchmarks`
* `post_predictions`
* `post_outcomes`
* `strategy_states`

Important:

* We store predictions **before posting**.
* We store outcomes **after posting**.
* The delta becomes the learning signal.

Implementation notes (Phase 1):

* Postgres lives on **Neon**
* Prisma owns schema + migrations
* Workers consume jobs from **Upstash Redis** and write intelligence snapshots back to Postgres

---

# 🧩 Design Philosophy

Stanley for X is not a tweet generator.

It is:

* A structured growth reasoning engine
* A variance reduction system
* A compounding intelligence loop

---

# ✅ Phase 1 Definition of Done

You can:

* Onboard a small account
* Provide daily structured guidance
* Improve engagement quality in 2–3 weeks
* Show measurable variance reduction

If this works, the engine is validated.

---

Built for creators who want systematic growth, not random virality.
