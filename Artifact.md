# Agent-v2 Audit Board

Last updated: 2026-03-18

## Status Legend
- `landed`: implemented and active in code now
- `partial`: real mitigation exists, but rollout or cleanup is still incomplete
- `open`: still needs meaningful implementation or rollout work

## External Audit Mapping
### 1. Classifier Bottleneck
- Status: `landed`
- Notes:
  - structured UI turns already bypass the control model
  - short artifact continuations now resolve deterministically
  - legacy `agents/classifier.ts` is removed

### 2. Waterfall Latency / Progress UX
- Status: `partial`
- Notes:
  - coarse sanitized progress updates already exist
  - queued execution support now exists
  - production still needs the queued path to become the default rollout mode

### 3. Token Bloat / Model Asymmetry
- Status: `partial`
- Notes:
  - tiered model routing is now implemented
  - the remaining work is rollout, env tuning, and usage validation in production

### 4. Groq / JSON Contract Resilience
- Status: `partial`
- Notes:
  - shared structured-output parsing now strips fences, retries once, validates with Zod, and supports safe optional defaults
  - remaining work is broader coverage and continued cleanup of any non-migrated ad hoc callers outside the main agent-v2 path

### 5. Context Window Poisoning
- Status: `partial`
- Notes:
  - workflow-scoped prompt context is now active
  - approved plan, artifact summary, and source refs now survive phase transitions
  - stale ideation menus are compacted out once drafting or revision is underway
  - remaining work is broader regression coverage around additional workflow boundaries

### 6. Critic / Reviser Infinite Loop
- Status: `landed`
- Notes:
  - hard two-attempt breakers already existed
  - attempt metadata is now standardized in traces for drafting, revision, reply, and analysis

### 7. Serverless Timeout Execution
- Status: `partial`
- Notes:
  - the Prisma-backed lease worker and queued turn control already existed
  - the chat route now supports explicit queued execution mode and `202 accepted`
  - remaining work is rollout: queued must become the verified production default

## What Changed In This Pass
- Removed the dead classifier path.
- Added model-tier env routing.
- Added shared structured-output repair and validation.
- Added workflow-scoped prompt context compaction.
- Added queued execution mode behind `CHAT_TURN_EXECUTION_MODE`.
- Added accepted queued-turn responses and lightweight turn-status reads.
- Tightened client polling to the documented contract.
- Standardized attempt metadata across retry-heavy capability paths.

## Remaining Priority Work
- Flip staging to queued mode and validate recovery/cancellation behavior.
- Expand queue-lifecycle coverage.
- Validate real-world model cost reduction after tier rollout.
- Continue shrinking the chat route toward a thinner entrypoint.
