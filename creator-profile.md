# Creator Profile System

This file is the canonical reference for how the product should understand a user after scraping their X account.

When the creator-understanding logic changes, this file should be updated first or in the same change.

The goal is to make the system understandable to both engineering and product without needing to reverse-engineer code.

## Objective

After scraping, the system should understand the user well enough to:

- describe what they post about
- identify how they write
- measure what currently works
- map that against their stated goal
- generate post ideas and draft posts that fit both their voice and objective

This is not one monolithic algorithm.

It is a layered creator model.

## Core Product Question

The system should always be able to answer:

1. how does this person currently post
2. what works for them right now
3. what are they trying to achieve
4. what is the gap between current behavior and target outcome
5. what should they post next to close that gap

If the product cannot answer those five questions clearly, the creator model is not good enough yet.

## System Layers

The creator-understanding system is built in layers.

### 1. Identity Layer

This is the factual account context:

- username
- display name
- followers
- following
- verified status
- follower band / growth stage
- account age

This tells the system how large the account is and what constraints apply.

### 2. Voice Layer

This is how the user tends to write:

- lowercase vs normal casing
- short vs medium vs long posts
- question usage
- multi-line usage
- emoji usage
- dominant content type
- dominant hook pattern
- concise style notes

This keeps the drafting agent from writing in a generic tone that does not sound like the user.

### 3. Topic Layer

This is what the user tends to talk about:

- dominant repeated topics
- likely content pillars
- implied audience
- audience breadth
- specificity tradeoff

This keeps the system anchored to what the account is already about and what adjacent topics make sense.

The deterministic model should now explicitly capture whether the current topic mix is:

- broad enough for general discovery
- niche enough to improve resonance
- local enough to narrow reach while strengthening identity

### 4. Performance Layer

This is what has historically worked:

- baseline average engagement
- median engagement
- engagement rate
- posting cadence
- best content type
- weakest content type
- best hook pattern
- recommended length band
- recommended posts per week
- confidence and sample reliability per insight

This is the deterministic part of the model and should stay as structured as possible.

The system should not declare a clear "best" or "worst" pattern when the sample is too small.

Small-sample insights should remain visible, but they should be marked as low-confidence and should not drive aggressive strategy recommendations.

The system should also expose an explicit sample-confidence read for the onboarding scrape itself.

Current guidance:

- under 20 posts: below minimum viable confidence
- 20-39 posts: directional only
- 40-79 posts: usable first-pass signal
- 80+ posts: strong onboarding baseline

This confidence should be persisted in the onboarding result so downstream systems know whether to trust the current read or keep backfilling.

### 5. Archetype Layer

This is the behavioral label for the creator.

Current examples:

- builder
- founder_operator
- job_seeker
- educator
- curator
- social_operator
- hybrid

This is the bridge between raw behavior and strategy.

The archetype helps determine which growth tactics and content framing are most natural for the user.

The model should not force a single hard label when the account is clearly mixed.

It should expose:

- primary archetype
- secondary archetype (when there is meaningful overlap)
- archetype confidence

That allows downstream systems to treat weak classifications more cautiously.

### 6. Execution Layer

This is how the account currently distributes attention:

- link usage rate
- mention usage rate
- CTA usage rate
- reply-style rate
- standalone-style rate
- link dependence
- mention dependence
- CTA intensity
- delivery style
- execution notes

This layer exists so the product can reason about delivery constraints directly.

The system should be able to say things like:

- this account is too link-dependent
- this account relies too heavily on mention-led distribution
- this account is mostly reply-led
- this account already has a strong standalone discovery base

These are not just analytics details. They should directly influence:

- current weaknesses
- recommended angles
- next moves
- later draft strategy

### 7. Strategy Layer

This is where the scraped behavior and user goal meet.

It should include:

- primary goal
- archetype
- transformation mode
- whether the mode is a default assumption or user-selected
- current state
- target state
- current strengths
- current weaknesses
- recommended angles
- next moves
- rationale

This is the part the drafting agent should care about most.

It answers: given who this person is and what they want, what should the system push them toward next?

This layer must stay open-ended enough to support:

- small accounts trying to grow from zero
- accounts simply optimizing an existing lane
- large accounts preserving a working position
- large accounts pivoting toward a different audience or identity

That means the strategy layer should separate:

1. current state
2. target state
3. transformation mode

The system should not assume every user wants the same kind of growth.

The preferred product behavior is to capture transformation mode explicitly during onboarding:

- preserve
- optimize
- pivot_soft
- pivot_hard

That should be a real user input, not a hidden inference.

### 8. Example Layer

This is the concrete post context the future drafting agent should use.

It should include:

- best-performing examples
- voice-anchor examples
- caution examples to avoid repeating weak patterns

This layer exists so the agent does not draft from abstract summaries alone.

The product should be able to hand the writer real post references that show:

- what the user's audience already responds to
- what most closely matches the user's natural voice
- what kinds of structures currently underperform

These examples should be selected deterministically first, not manually curated.

### 9. Reply Layer

Replies should be modeled as a separate lane, not mixed into the main original-post lane.

The reply layer should capture:

- reply count
- reply share of captured activity
- average reply engagement
- reply engagement delta vs original posts
- dominant reply tone
- dominant reply style
- reply style mix
- reply usage note

This exists for a different product purpose than the main post model.

The original-post lane should drive:

- standalone voice
- content pillars
- top-level drafting

The reply lane should drive:

- conversational tone
- reply-first growth tactics
- future extension behavior for choosing what to reply to and how

This is especially important for:

- 0-1k users
- users using replies as a distribution wedge
- future "reply guy" workflows in the extension

The system should analyze replies, but it should not let reply-heavy behavior distort the main standalone-post strategy model.

### 10. Quote Layer

Quote posts should be modeled as a separate lane from both originals and replies.

The quote layer should capture:

- quote count
- quote share of captured activity
- average quote engagement
- quote engagement delta vs original posts
- dominant quote opener pattern
- average quote length band
- quote usage note

This exists because quote posts are often a commentary and distribution format, not the same thing as a pure original post.

The quote lane should help the system decide:

- when quote posts are a useful wedge
- when a strong quote take should be rewritten as a standalone post
- when quote-heavy behavior is overshadowing the main original-post lane

The system should analyze quotes, but it should not let quote-driven behavior distort the main standalone-post voice model.

The deterministic model should compare reply and quote engagement against the original-post baseline.

This matters because the system should know whether:

- replies are actually working as a growth lever
- quotes are actually working as a commentary lever
- the user should double down on those lanes or convert the best examples back into standalone posts

## Input Sources

The creator profile should be built from two categories of inputs.

### Deterministic inputs

These come from the scrape and structured analysis:

- normalized profile
- recent posts
- recent replies
- recent quote posts
- engagement metrics
- per-post feature extraction
  - links
  - mentions
  - question usage
  - number usage
  - CTA presence
  - line count
  - word count
  - emoji count
  - reply-like structure
- content distribution
- hook patterns
- performance model

These should be computed in code, not inferred loosely by an LLM.

### Intent inputs

These come from the user:

- growth goal
- transformation intent (preserve vs optimize vs pivot)
- later chat answers such as:
  - trying to get hired
  - trying to grow a company
  - trying to grow audience
  - trying to book clients

These should shape strategy, not overwrite the behavioral truth of the account.

Until the product explicitly collects preserve vs optimize vs pivot intent, the system may carry a default transformation mode.

That default should be marked as a default assumption, not treated as final truth.

## Canonical Model

The app should not reason from raw tweets every time.

It should build and store a canonical `CreatorProfile`.

That model becomes the source of truth for:

- drafting
- idea generation
- chat context
- strategy recommendations

This keeps the rest of the product decoupled from raw scrape payload shape and repeated recomputation.

## Current Heuristic Version

The first version of the creator profile should remain mostly heuristic and deterministic.

That means:

- use rule-based topic extraction
- use rule-based archetype inference
- use structured performance signals
- use simple strategy mappings

This is the correct first step because it is:

- inspectable
- testable
- easy to debug
- stable under iteration

That deterministic layer should increasingly encode explicit tradeoffs instead of vague summaries.

Examples:

- top topics should be weighted by frequency, engagement, recency, and specificity
- broad generic words should be downweighted
- repeated niche or local entities should be promoted
- the model should explicitly say when specificity increases resonance but narrows audience breadth

LLM-based semantic enrichment can be layered on top later, but it should not be the foundation.

## Future LLM Upgrade: Entity Semantics and Locality

The current heuristic model can detect repeated tokens, but it does not yet understand what those tokens mean in context.

This matters because some repeated terms are not just "topics" — they imply:

- subculture
- geography
- audience filtering
- social identity
- tone constraints

Example:

- `ampm`

At the heuristic level, this is just a repeated token.

At the semantic level, the system should eventually understand that:

- it refers to a specific club / social scene in Toronto
- it signals a more social, nightlife-adjacent, comedic, or personality-driven posting lane
- it can explain why certain posts attract a more socially native audience
- it can also narrow reach because the reference is highly local and culturally specific

That means the future LLM layer should not just label `ampm` as a topic.
It should infer both:

1. persona signal
2. audience scope tradeoff

### Persona signal

A repeated local social reference can imply:

- party / nightlife energy
- higher relatability in social circles
- more comedic or personality-led content opportunities
- stronger identity-driven posting

### Audience scope tradeoff

The same reference can also imply:

- narrower geographic relevance
- lower clarity for outsiders
- reduced reach for broader X discovery
- stronger resonance for people already in that scene

This is a core future capability:

The system should understand when a specific entity makes content:

- more resonant for a niche audience
- but less transferable to a broad audience

### Required future behavior

When an LLM is added, it should evaluate repeated entities across these dimensions:

- what is this entity
- is it local, niche, global, or widely legible
- what identity does referencing it signal
- what audience is likely to respond
- what audience is likely excluded
- does it strengthen authenticity
- does it reduce discovery breadth

That semantic read should then influence:

- audience signals
- archetype confidence
- recommended content angles
- draft strategy
- whether to keep or generalize the reference in a draft

### Drafting implication

The future agent should be able to make tradeoffs like:

- keep the local / scene-specific reference when the goal is identity, relatability, or niche resonance
- generalize or abstract the reference when the goal is broader discovery and reach

This is an important product rule:

Specificity can increase resonance while decreasing universality.

The LLM layer should treat that as a strategy decision, not just a semantic observation.

## Drafting Architecture

The drafting system should not be one prompt that directly writes a tweet.

It should be a three-stage pipeline:

### 1. Planner

Inputs:

- creator profile
- goal
- recent strengths and weaknesses
- later, niche benchmark context

Outputs:

- recommended post type
- angle
- hook direction
- target length
- CTA direction

### 2. Writer

Inputs:

- planner output
- creator voice profile
- representative examples of the user's prior posts

Outputs:

- multiple draft candidates

### 3. Critic

Checks:

- does it sound like the user
- is it aligned to the goal
- does it match winning patterns
- does it avoid known weak patterns
- is it too generic

The critic can either score or request a rewrite.

## What “Understands The User” Means

The system does not need perfect human-level understanding.

It needs reliable enough understanding to:

- preserve voice
- stay on-topic
- push toward the stated goal
- exploit known strengths
- avoid obvious weak patterns

That means the model should prioritize:

- consistency over novelty
- structure over vibe
- explicit tradeoffs over generic inspiration

## Modification Rule

Whenever the creator-understanding algorithm changes, update:

1. this file
2. the `CreatorProfile` schema in code
3. the builder logic

All three should stay aligned.

If they drift, the product will become harder to reason about and the agent behavior will become less predictable.

## Current Implementation Direction

The immediate implementation path is:

1. build `CreatorProfile` from onboarding output
2. expose it as a reusable internal API
3. use it as the future context object for the chat/drafting agent

That is the minimum viable path to move from “scraped analytics” to “agent that can write like the user and for the user.”
