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

## Evaluation Harness

Before adding an LLM, the product needs a repeatable evaluation harness for the deterministic layer.

The goal is to score whether the current creator model is improving or regressing across real onboarding runs.

The evaluation harness should produce rubric-style checks for at least:

- sample quality
- topic quality
- niche overlay quality
- archetype confidence
- playbook quality
- strategy specificity
- interaction signal quality
- conversation conversion quality
- distribution loop quality
- anchor quality

It should output:

- an overall score
- per-check scores
- blockers
- next improvements

This exists so heuristic changes can be measured before the system adds a generative layer on top.

Anchor quality should explicitly score whether:

- positive anchors are diverse enough to be useful
- multiple retrieval sets are actually populated
- anchors span the relevant content lanes when possible
- goal-conflict examples are meaningfully different from generic caution examples

This prevents the future LLM layer from getting shallow or repetitive retrieval context.

Distribution-loop quality should explicitly score whether:

- the inferred primary loop matches observed behavior
- the loop is supported by the current execution pattern
- reply or quote lanes are actually strong enough when they drive the loop
- the loop can be treated as a real planning primitive instead of a weak suggestion

Niche-overlay quality should explicitly score whether:

- the inferred primary domain is coherent
- the domain layer is distinct enough from the archetype layer
- there is enough signal to specialize the playbook credibly
- the likely offer is plausible for the current goal

Playbook quality should explicitly score whether:

- the playbook actually reflects the inferred niche when the niche is strong enough
- the inferred distribution loop is operationalized in the playbook
- cadence is expressed in a capacity-aware way
- the playbook is specific enough to guide generation instead of acting like a generic style summary

Conversation-conversion quality should explicitly score whether:

- original posts are actually turning into replies
- the account shows enough conversation pull to justify reply-led growth advice
- author follow-through in threads is strong enough to compound that conversation
- conversation signals are strong enough to trust as a planning input

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

It should also track topic stability:

- emerging
- steady
- fading

That lets the system distinguish between:

- what has been persistently central
- what is newly becoming prominent
- what may be more historical than current

Topic extraction should prefer weighted entity and phrase candidates over raw single-token counting alone.

That means repeated phrases and clearer named signals should outrank generic one-off words whenever possible.

The deterministic layer should also collapse obvious aliases into one canonical entity before scoring.

Examples:

- `sf` -> `san francisco`
- `nyc` -> `new york`
- `ai` -> `artificial intelligence`

This keeps topic signals from fragmenting across equivalent variants.

It should also collapse low-information suffix variants back into the base entity when the suffix is not meaningfully changing the topic.

Examples:

- `ampm ventures` -> `ampm`
- `creator lab` -> `creator`

This prevents joke labels, entity wrappers, or lightweight brand suffixes from fragmenting the same underlying topic signal.

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

When the sample is below target depth, the product should be able to:

- render the first-pass snapshot immediately
- queue a background backfill
- refresh the snapshot from the improved cached capture when that backfill completes

This allows the creator model to improve after onboarding without blocking the initial user flow.

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

### 6. Niche Overlay Layer

This is the domain the account operates in.

It should be distinct from archetype.

- archetype = how the account behaves
- niche overlay = what domain the account serves

This layer should be domain-coded, not behavior-coded.

Examples:

- artificial intelligence
- software and product
- startups and growth
- career and hiring
- finance and investing
- fitness and health
- design and creative
- policy and society
- media and creators
- community and events

The niche layer should expose:

- primary niche
- secondary niche
- niche confidence
- target niche
- recommended niches
- niche transition summary
- likely offer
- offer signals
- audience intent
- rationale

Important rule:

- if observed niche confidence is low, do not force a domain label
- treat the account as broad / mixed / generalist instead
- explicitly say the current signal is too general to trust as a niche yet
- then recommend the best niche to build toward based on:
  - goal
  - archetype
  - current domain signals
  - likely offer

This prevents false precision on accounts that have posted casually, broadly, or without a deliberate growth lane so far.

This exists so the system can distinguish between:

- a founder archetype in B2B SaaS
- a founder archetype in creator media
- an educator archetype in fitness

Those accounts may share behavior patterns, but the content, examples, and conversion surfaces should still differ.

### 7. Execution Layer

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

### 8. Distribution Loop Layer

This is the explicit growth loop the account is currently best positioned to use on X.

It should capture:

- primary distribution loop
- secondary distribution loop (when signals are mixed)
- confidence
- concrete signals
- rationale

Current loop types:

- reply-driven
- standalone discovery
- quote commentary
- profile conversion
- authority building

This layer exists so the product can optimize for how X actually distributes attention.

The system should be able to say:

- this account should grow through structured replies
- this account should rely on native standalone discovery
- this account can use quote commentary as a wedge
- this account needs a tighter profile-conversion path after attention
- this account should compound authority through stronger point-of-view posts

This should directly shape:

- strategy angles
- next moves
- later planner/writer behavior

### 9. Playbook Layer

This is the executable style card the product should derive from the creator model before any LLM writes a post.

It should capture:

- the content contract
- tone guidelines
- preferred content types
- preferred hook patterns
- CTA policy
- cadence
- conversation tactic
- experiment focus

This layer turns the creator model from:

- descriptive

into:

- operational

The playbook should be derived deterministically from:

- archetype
- goal
- distribution loop
- transformation mode
- current interaction behavior

It should answer:

- what should this person reliably post
- how should it sound
- what hooks should be tested first
- how often should they post and reply
- how should they create conversations
- what should they experiment with next

The playbook should also respect explicit user capacity inputs captured during onboarding:

- posting capacity
- reply budget per day

This prevents the system from recommending a reply-led growth loop to a user who cannot realistically sustain it.

This is the layer the future planner/writer model should follow most directly.

### 10. Strategy Layer

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

The strategy layer should also expose an explicit strategy delta.

This is the cleanest deterministic expression of the gap between:

- the current account state
- the target direction
- the highest-leverage behavior changes needed to move between them

The delta should include:

- one primary gap statement
- what should be preserved
- what should shift
- a small list of prioritized adjustments

Examples of adjustment areas:

- audience breadth
- topic specificity
- standalone posting
- reply activity
- quote activity
- link dependence
- mention dependence

This gives the future LLM a much stronger planning object than raw strengths and weaknesses alone.

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

### 11. Example Layer

This is the concrete post context the future drafting agent should use.

It should include:

- best-performing examples
- voice-anchor examples
- strategy-anchor examples
- goal-anchor examples
- goal-conflict examples
- caution examples to avoid repeating weak patterns

This layer exists so the agent does not draft from abstract summaries alone.

The product should be able to hand the writer real post references that show:

- what the user's audience already responds to
- what most closely matches the user's natural voice
- what best matches the current strategy gap and target direction
- what best matches the current goal (followers, leads, or authority)
- what actively conflicts with the current goal or target direction
- what kinds of structures currently underperform

These examples should be selected deterministically first, not manually curated.

Each representative example should also carry a deterministic goal-fit score.

That score should estimate how strongly the example supports the current goal:

- followers
- leads
- authority

This gives the future LLM a concrete ranking signal instead of forcing it to infer goal alignment from raw examples alone.

Strategy-anchor examples should be lane-aware when necessary.

That means the retrieval layer should be able to pull from:

- original posts
- replies
- quote posts

depending on which lane best matches the current strategy delta.

Goal-anchor examples should also be selected deterministically.

That means the retrieval layer should prefer examples that best fit the current goal mode:

- followers: discovery-friendly and broadly legible
- leads: stronger proof, CTA, and outcome structure
- authority: stronger standalone point-of-view and structured insight

Goal-conflict examples should be selected separately from generic caution examples.

That means the system should be able to say:

- this pattern underperforms in general
- and this pattern is specifically wrong for the current goal or strategy delta

Those are related, but not the same retrieval job.

## Agent Context Pack

Before adding an LLM, the system should expose one deterministic agent-context object.

This should be the primary handoff contract to any future planner, writer, or critic model.

It should bundle:

- the full `CreatorProfile`
- the `PerformanceModel`
- the current strategy delta
- a compact confidence summary
- a context-readiness summary
- a compact anchor summary
- positive anchors
- negative anchors
- the grouped retrieval sets used to build those anchors

The positive anchor bundle should prioritize:

- best-performing examples
- voice anchors
- strategy anchors
- goal anchors

The negative anchor bundle should prioritize:

- goal-conflict examples
- generic caution examples

The compact anchor summary should expose:

- positive-anchor coverage
- how many lanes are represented
- how many positive retrieval sets are populated
- whether goal-conflict retrieval is meaningfully distinct from generic caution retrieval
- the current anchor-quality score/status from the evaluation harness

The context-readiness summary should expose:

- a deterministic readiness score
- whether the context is `ready`, `caution`, or `not_ready`
- the recommended generation mode:
  - `full_generation`
  - `conservative_generation`
  - `analysis_only`
- concise reasons for that recommendation

This exists so the future LLM can immediately decide whether to:

- generate normally
- stay conservative
- avoid generation and stick to analysis

This object should be stable and versioned.

The future LLM should consume this context pack directly rather than assembling context ad hoc from multiple endpoints.

## Generation Contract

Before adding any LLM, the system should expose one deterministic generation contract.

This contract should sit on top of the agent context pack and enforce the existing readiness gate.

It should define three stages:

- planner
- writer
- critic

The generation contract should make these things explicit:

- whether generation is allowed at all
- whether generation should be conservative
- which lane the draft should target (original, reply, or quote)
- the primary angle to push
- which formats and hooks are preferred
- what must be included
- what must be avoided
- which anchor examples should be used as references
- which critic checks must pass

This should be deterministic and stable before any LLM prompt is introduced.

If readiness is too weak, the contract should fail closed into analysis-only mode instead of attempting generation.

The product should also have a lightweight regression suite that runs multiple trusted onboarding runs through the current deterministic system and validates:

- minimum acceptable overall score
- acceptable generation mode
- whether the current heuristics regress after a change

### 12. Reply Layer

Replies should be modeled as a separate lane, not mixed into the main original-post lane.

The reply layer should capture:

- reply count
- reply share of captured activity
- reply signal confidence
- reply signal reliability
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

### 13. Quote Layer

Quote posts should be modeled as a separate lane from both originals and replies.

The quote layer should capture:

- quote count
- quote share of captured activity
- quote signal confidence
- quote signal reliability
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

It should also confidence-gate those conclusions.

If the sample is too small, the system should:

- still show the lane
- mark it as low-sample
- avoid letting that lane drive strong strategic recommendations

This matters because the system should know whether:

- replies are actually working as a growth lever
- quotes are actually working as a commentary lever
- the user should double down on those lanes or convert the best examples back into standalone posts

### 14. Conversation Conversion Layer

This layer should measure whether the account is actually converting original posts into conversations.

This is different from simply counting replies.

The system should capture:

- average replies per original post
- share of original posts that earn replies
- conversation-starter rate
- an author reply follow-through proxy
- a conversation conversion score
- readiness (`low`, `moderate`, `high`)
- rationale

This exists because the strongest X-native growth loops are conversation-driven, not just impression-driven.

The product should be able to distinguish between:

- posts that get passive engagement
- posts that generate replies
- posts that start threads the author can continue compounding

That conversation-conversion read should directly influence:

- strategy angles
- next moves
- distribution-loop trust
- later planner/writer behavior

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
  - entity and phrase candidates
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
