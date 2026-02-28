# Creator Voice Fidelity Plan

This is the implementation-facing follow-up to `improving-creator-voice-fidelity.md`.

Its purpose is simple:
- keep a stable source of truth when chat context drifts
- make the next engineering steps explicit
- separate high-ROI work from low-ROI prompt churn

## Goal

Make generated X outputs reliably match:
- the creator's real voice
- the creator's real structural patterns
- the creator's actual posting lane (short post, long-form, reply, quote)
- the specific request the user is making now

The system should stop producing:
- generic startup advice
- fake specificity
- tweet-sized "long form"
- drafts that sound like platform coaching instead of the creator

## Non-Negotiable Rules

1. Backend owns generation behavior.
- Frontend may collect structured inputs.
- Frontend must not inject prompt logic that changes output style.

2. Retrieval must be query-time, not static-only.
- Static anchors help.
- Request-conditioned anchors are required for relevance.

3. Verified does not automatically mean long-form.
- Long-form should be based on observed behavior and creator capability, not capability alone.

4. Long-form must be enforced structurally.
- "Long form" is not just a different label or a larger char limit.
- It needs structure, proof, and sufficient development.

5. Tone fidelity is not just lowercase.
- Surface voice requires micro-patterns, not only casing.

## Current Root Causes

## 1. Weak request-conditioned retrieval

The model often gets static anchors, but not the most relevant past posts for the current request.

Result:
- outputs drift into generic adjacent topics
- creator-specific substance is underused

## 2. Style representation is too coarse

The current model captures:
- casing
- average length
- some high-level voice stats

It still under-represents:
- preferred openers
- preferred closers
- punctuation rhythm
- repeated sentence shapes
- signature phrasing
- lane-specific voice differences

## 3. Long-form enforcement is still too soft

The system now supports long-form limits, scoring, and expansion, but the generation can still collapse into weak generic mini-posts if the model is not boxed in by a stronger creator-specific structural blueprint.

## 4. Strategy abstractions can still leak into outputs

Meta guidance like:
- "lean into distribution-friendly hooks"

is useful for planning, but dangerous if it becomes the subject of the output.

The output should be based on:
- a real premise
- a real creator signal
- a real angle

not generic strategic advice.

## Immediate Priorities

These are the highest-ROI next steps.

## 1. Add query-time retrieval of relevant past posts

Implement retrieval for the current request before writer generation.

What it should return:
- `topicAnchors`: posts most relevant to the request topic
- `formatAnchors`: posts that best match the required output shape
- `laneAnchors`: posts matching the target lane (`original`, `reply`, `quote`)

Primary file:
- `apps/web/lib/onboarding/chatAgent.ts`

Expected impact:
- highest direct improvement to relevance

## 2. Add a deterministic Style Card

Create a reusable style object, not just loose voice stats.

Minimum fields:
- preferred openers
- preferred closers
- punctuation posture
- signature words
- emoji policy
- forbidden phrases
- sentence looseness / polish level

Primary files:
- `apps/web/lib/onboarding/creatorProfile.ts`
- `apps/web/lib/onboarding/generationContract.ts`
- `apps/web/lib/onboarding/chatAgent.ts`

Expected impact:
- highest direct improvement to voice fidelity

## 3. Separate voice by lane

Maintain separate anchor sets for:
- originals
- replies
- quotes

Reason:
- creators often write differently in each lane

Primary files:
- `apps/web/lib/onboarding/creatorProfile.ts`
- `apps/web/lib/onboarding/chatAgent.ts`

Expected impact:
- better reply quality
- less cross-lane voice contamination

## 4. Tighten long-form output shape selection

Do not choose `long_form_post` because a creator is verified alone.

Use:
- observed long average length
- multiline behavior
- clear long-form exemplars

Verified should be treated as:
- permission/capability
- not the default shape

Primary file:
- `apps/web/lib/onboarding/generationContract.ts`

Expected impact:
- fewer wrong-format drafts

## 5. Make long-form enforcement creator-calibrated

Use exemplar-derived minimums for long-form.

Rules:
- target word range should be based on the chosen exemplar
- long-form drafts must match a clear structure
- expansion pass should preserve the creator's structural blueprint

Primary file:
- `apps/web/lib/onboarding/chatAgent.ts`

Expected impact:
- better long-form matching for creators like Vitalii

## 6. Keep strategy abstract, but generation concrete

Strategy fields may guide the planner, but the writer should always draft from:
- a concrete subject
- a concrete selected angle
- a concrete relevant exemplar

Never let high-level strategic phrasing become the output topic by accident.

Primary files:
- `apps/web/lib/onboarding/chatAgent.ts`
- `apps/web/lib/onboarding/generationContract.ts`

Expected impact:
- less genericness

## Medium-Term Priorities

## 7. Add reference-post pinning

Let the user pin 1-2 of their own posts as hard voice references.

Use these as:
- stronger voice exemplars
- stronger critic checks

This is the cleanest debugging tool when the user says:
- "this still doesn't sound like me"

## 8. Add voice-match evaluation

Add a deterministic rubric check:
- `voice_match_quality`

It should score:
- casing
- openness vs declarative style
- sentence looseness
- anchor similarity
- over-polish penalties

Primary file:
- `apps/web/lib/onboarding/evaluation.ts`

## 9. Improve model routing by stage

Use different models by stage if needed:
- planner: cheap / strict
- writer: strongest available
- critic: strict / stable

This is especially important for:
- long-form creators
- higher-fidelity voice tasks

## 10. Remove duplicated client-side deterministic logic

The frontend currently mirrors some backend logic for:
- fallback behavior
- artifact metadata
- editing calculations

That is acceptable for resilience, but long-term it should drift less.

The backend should remain the source of truth for:
- artifact metadata
- draft classification
- fallback behavior

## What Not To Spend Time On

Avoid these until the above is stronger:

1. More generic prompt wording tweaks
- prompt tweaks alone will not fix structural creator mismatch

2. More UI polish
- the bottleneck is still backend generation quality

3. Auth
- not needed yet for improving voice fidelity

4. Full database migration as a voice-fidelity fix
- better storage helps later
- it does not directly solve current generation problems

## Practical Build Order

Use this sequence.

1. Query-time retrieval
2. Style Card
3. Lane-specific voice anchors
4. Tighten output shape selection
5. Creator-calibrated long-form enforcement
6. Voice-match evaluation
7. Reference-post pinning
8. Stage-specific model routing

## Success Criteria

This work is succeeding when:

1. The app can distinguish:
- "sounds like the creator"
- "sounds like a generic growth coach"

2. Verified long-form creators get:
- thesis-led
- structured
- proof-heavy
- creator-matching outputs

3. Casual lowercase creators get:
- clipped
- natural
- low-polish
- non-corporate outputs

4. The selected angle stays the subject.
- no generic adjacent-topic drift

5. Retrieved past posts clearly influence the result.
- not just as loose tone references
- but as concrete relevance anchors

## Implementation Boundary

The right boundary remains:

- frontend:
  - collect structured input
  - display artifacts
  - allow editing

- backend:
  - retrieval
  - style inference
  - output shape
  - enforcement
  - reranking
  - fallback

If a future change improves quality but moves generation intelligence into the frontend, it is the wrong tradeoff.
