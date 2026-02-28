# Generation Grounding Plan

This is the canonical execution plan for fixing generation quality in the X growth assistant.

Use this file as the single source of truth for:
- what is already done
- what is next
- what is blocked
- what still needs validation

When a step is fully implemented and validated, mark it as complete here.

## How To Use This File

- Treat this as the working checklist for generation-quality work.
- Update statuses in place instead of creating new ad hoc plans in chat.
- Prefer editing this file whenever priorities change.
- When context is compacted, resume from the first highest-priority incomplete item.

## Status Legend

- `[ ]` not started
- `[-]` in progress
- `[x]` completed
- `(blocked)` known dependency or decision required

## Current Problem Statement

The system can retrieve the right scraped post, but the generation pipeline still often produces generic output because the retrieved post is not yet being converted into a high-salience, enforceable evidence object.

Symptoms:
- the correct exemplar appears in debug output
- the drafts still ignore concrete entities, metrics, and proof points
- long-form creators still get shallow or generic drafts
- deterministic fallback is too abstract

## Non-Negotiable Architecture Rules

- Backend owns generation behavior.
- Frontend collects structured inputs and renders outputs.
- Do not hardcode creator-specific terms.
- Do not use frontend prompt hacks as a long-term fix.
- Use scraped posts as evidence, not only as style or format hints.
- Keep changes reusable across creators, not tuned to one account.

## Already Completed

These are done and should stay done unless a later step explicitly replaces them.

- [x] Query-time retrieval for request-conditioned anchors
- [x] Deterministic style card
- [x] Lane-specific voice anchors
- [x] Tighter backend output-shape selection
- [x] Creator-calibrated long-form structure enforcement
- [x] Keep strategy abstract while generation stays concrete
- [x] `voice_match_quality` evaluation check
- [x] Pinned reference posts for stronger voice control
- [x] Stage-specific provider/model routing
- [x] Remove duplicated client-side deterministic logic
- [x] Conversational onboarding in `/chat`
- [x] Dev-mode format exemplar debug output
- [x] Decouple casual tone from forced lowercase / compressed formatting

## Active Priority Queue

Work from top to bottom unless a blocking dependency appears.

### 1. Evidence Pack Extraction

- [x] Add a deterministic `evidence pack` extracted from the selected anchor/exemplar
- [x] Extract:
  - entities
  - metrics
  - constraints
  - outcomes
  - story beats
  - proof artifacts (when inferable)
- [x] Keep the evidence pack backend-owned
- [x] Make it reusable by live generation and deterministic fallback

Definition of done:
- a selected anchor/exemplar yields a structured evidence object
- debug output can show the extracted evidence
- no creator-specific hardcoding is used

Likely files:
- `apps/web/lib/onboarding/chatAgent.ts`
- `apps/web/lib/onboarding/creatorProfile.ts`
- optionally a new helper module such as `apps/web/lib/onboarding/evidence.ts`

### 2. Planner Becomes Evidence-Aware

- [x] Feed the evidence pack into the planner
- [x] Require planner output to stay tied to concrete evidence
- [x] Prevent planner from collapsing into abstract generic themes too early
- [x] Add evidence-linked angle planning (for example, angle references specific evidence items)

Definition of done:
- planner output preserves concrete nouns/metrics when they are relevant
- angles are less generic and more grounded in retrieved evidence

Likely files:
- `apps/web/lib/onboarding/chatAgent.ts`

### 3. Writer Uses Evidence, Not Just Structure

- [x] Change writer behavior so the exemplar is not treated as structure-only
- [x] Require the writer to use evidence pack details as proof points
- [x] Keep structure and evidence as separate inputs:
  - structure blueprint
  - concrete evidence pack
- [x] Explicitly forbid invented metrics/numbers when real metrics exist

Definition of done:
- drafts reuse concrete details from the retrieved evidence when relevant
- drafts stop drifting into generic domain advice when concrete details are available

Likely files:
- `apps/web/lib/onboarding/chatAgent.ts`

### 4. Grounding Critic Gate

- [x] Add a critic rule that checks evidence usage directly
- [x] Reject drafts that omit critical evidence when evidence is available
- [x] Reject drafts that invent unsupported metrics or named entities
- [x] Force rewrite when grounding is too weak

Definition of done:
- generic drafts fail closed instead of being accepted
- hallucinated numeric claims are explicitly rejected

Likely files:
- `apps/web/lib/onboarding/chatAgent.ts`
- `apps/web/lib/onboarding/generationContract.ts`

### 5. Rerank On Evidence Coverage

- [x] Add evidence coverage as a first-class reranking score
- [x] Score:
  - evidence reuse
  - evidence precision
  - subject fidelity
  - voice fidelity
- [x] Stop allowing readable-but-generic drafts to outrank grounded drafts

Definition of done:
- the top-ranked draft uses the strongest relevant evidence more consistently

Likely files:
- `apps/web/lib/onboarding/chatAgent.ts`

### 6. Redesign Deterministic Fallback

- [x] Replace abstract fallback templates with evidence-based fallback synthesis
- [x] Make fallback produce:
  - grounded angles
  - grounded drafts
  - grounded artifacts
- [x] Use selected exemplar + evidence pack as the fallback source

Definition of done:
- fallback output is still useful when the live model fails
- fallback references real creator-specific facts when available

Likely files:
- `apps/web/lib/onboarding/chatAgent.ts`
- `apps/web/lib/onboarding/draftArtifacts.ts`

### 7. Long-Form Content Skeleton Extraction

- [x] Extract a deterministic content skeleton for long-form exemplars
- [x] Break long-form structure into enforceable sections such as:
  - thesis
  - context
  - proof block
  - turning point
  - lesson
  - close
- [x] Use this skeleton in writer and critic

Definition of done:
- long-form outputs are not just longer tweets
- long-form outputs reflect creator-specific structural patterns

Likely files:
- `apps/web/lib/onboarding/chatAgent.ts`
- optionally a new helper module

### 8. Better Pinning: Voice Pins vs Evidence Pins

- [x] Split pinned references into two explicit types:
  - voice reference
  - evidence/content reference
- [x] Allow users to pin a post because they want its facts, not only its voice
- [x] Keep pinning structured and backend-owned

Definition of done:
- a user can explicitly force a specific post to act as a grounding anchor

Likely files:
- `apps/web/app/chat/page.tsx`
- `apps/web/app/api/creator/chat/route.ts`
- `apps/web/lib/onboarding/chatAgent.ts`

### 9. Prompt Compaction / Salience Ordering

- [x] Reduce prompt entropy
- [x] Put evidence pack near the top of prompts
- [x] Keep strategy compressed and secondary
- [x] Keep structure blueprint present without burying concrete facts

Definition of done:
- prompts are shorter, clearer, and evidence is more salient
- less “lost in the middle” behavior

Likely files:
- `apps/web/lib/onboarding/chatAgent.ts`

### 10. Better Debugging For Grounding

- [x] Expose more grounding debug data in dev mode
- [x] Show:
  - selected topic anchors
  - evidence pack
  - per-draft evidence usage
  - why a draft won reranking

Definition of done:
- a bad output can be traced to a specific grounding failure instead of guessed at

Likely files:
 - `apps/web/lib/onboarding/chatAgent.ts`
 - `apps/web/app/chat/page.tsx`

### 11. Offline Grounding Regression Checks

- [ ] Add offline checks for:
  - evidence usage
  - hallucinated metrics
  - long-form minimum quality
  - voice fidelity
- [ ] Add a small regression suite with known creator accounts

Definition of done:
- grounding regressions can be detected before manual testing

Likely files:
- `apps/web/lib/onboarding/evaluation.ts`
- optionally a new regression helper

## Immediate Build Order

If continuing from scratch after context compaction, do this in order:

1. Offline Grounding Regression Checks

Do not jump ahead unless a lower item is blocked and a higher item is already complete.

## What Not To Work On Right Now

- Do not hardcode creator-specific terms like `Stan`
- Do not add a database as the primary fix for this issue
- Do not add more frontend prompt steering
- Do not spend time on cosmetic UI changes until grounding is reliable
- Do not solve this with generic prompt tweaks only

## Notes / Findings

Use this section for brief notes while iterating.

- The selected exemplar can already be correct while generation still fails.
- That means retrieval alone is not enough.
- The likely failure is signal loss between retrieval and final generation.
