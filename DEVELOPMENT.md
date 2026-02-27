# DEVELOPMENT.md

> Execution roadmap for Phase 1 for X Growth Engine

---

# 🚀 Phase 1 Execution Stages

Phase 1 is built in deliberate stages. Each stage validates a core assumption before moving forward.

---

## Stage 1 — Structured Onboarding

**Goal:** Build accurate baseline intelligence.

Deliverables:

* Ingest user via scrape-first onboarding bootstrap job
* Normalize and store recent 20–50 posts
* Compute engagement baseline
* Detect growth stage (0–1k focus)
* Initialize strategy state

Validation:

* Baseline metrics are stable
* Growth stage classification makes sense
* Onboarding is resilient when individual fetch paths fail

---

## Stage 2 — Performance Modeling

**Goal:** Understand what works for the user.

Deliverables:

* Format classification
* Hook performance scoring
* Length optimization modeling
* Engagement vs baseline deltas
* Snapshot stored in `user_models`

Validation:

* Model surfaces clear strengths & weaknesses
* Guidance feels structurally grounded (not generic)

---

## Stage 3 — Composer + Prediction Engine

**Goal:** Reduce posting variance before publishing.

Deliverables:

* Hook strength score
* Niche alignment score
* Length optimization guidance
* Predicted engagement vs baseline
* Safe + Bold rewrites
* Store `post_predictions`

Validation:

* Users understand *why* scores change
* Predictions are directionally accurate

---

## Stage 4 — Postmortem + Learning Loop

**Goal:** Enforce compounding learning.

Deliverables:

* Compare outcome vs prediction
* Compare vs baseline
* Compare vs niche benchmarks
* Generate structural explanation
* Prescribe next move
* Update `strategy_states`

Validation:

* Clear explanation of wins/losses
* Observable improvement over 2–3 weeks

---

## Stage 5 — Async Intelligence Stabilization

**Goal:** Make the system adaptive.

Deliverables:

* One queue with two lanes:
  * `onboarding_bootstrap` (high priority, low volume)
  * `niche_enrichment` (low priority, high volume)
* Shared account/session broker with lease-based routing
* Shared scraper executor + parser/normalizer
* User analyzer worker
* Strategy adjuster logic + weight rebalancing

Validation:

* Onboarding jobs are not starved by enrichment traffic
* Rate limits/cooldowns are enforced globally
* System adapts without manual tuning
* Guidance evolves as account grows

---

## Cross-Cutting Scale Constraints (Phase 1)

* Scrape is primary ingestion path.
* API integration is optional fallback only when explicitly enabled.
* No per-request live scraping in user-facing paths; user paths read cached captures.
* Global and per-session budgets are mandatory (min interval, hourly cap, cooldown on `429/403`).
* Account/session credentials must be encrypted and auditable.

---

Phase 1 is complete when the closed loop runs autonomously and produces measurable variance reduction.
