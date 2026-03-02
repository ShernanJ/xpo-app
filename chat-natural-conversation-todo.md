# Chat Natural Conversation TODO

Purpose: make `/chat` feel like a real expert coach, not a wizard or a prompt router.

Use this file as the source of truth for chat-flow work. Mark items complete only after implementation + validation.

## Product Rules

- [ ] The assistant should ask at most one focused question at a time.
- [ ] Explicit user requests to draft should produce a draft, not another coaching loop.
- [ ] Coaching should be optional once the user has given enough context.
- [ ] Quick-reply chips must stay optional helpers, never required gates.
- [ ] The assistant should answer direct user questions before trying to steer back into drafting.
- [ ] User corrections must persist for the current conversation (for example: "don't villainize my cofounder").
- [ ] Main chat should stay clean: no system metadata, no debug blocks, no analysis chrome in the message stream.

## Highest-ROI Backend Work

- [ ] Make the backend fully authoritative for intent.
  - Remove split-brain routing between frontend `inferComposerIntent(...)` and backend `effectiveIntent`.
  - Frontend should send raw message + optional hint only.
  - Backend should decide `coach | ideate | draft | review`.

- [ ] Add explicit conversation state.
  - Introduce a small backend state model:
    - `needs_more_context`
    - `ready_to_ideate`
    - `ready_to_draft`
    - `editing`
  - Use this to decide whether the next turn should ask a question, ideate, or draft.

- [ ] Add a hard stop on over-questioning.
  - After 1 concrete user answer, default to ideation or draft.
  - After 2 concrete user answers, never ask another generic narrowing question unless the user explicitly asks for brainstorming.

- [ ] Add direct-question handling.
  - If the user asks:
    - "why did you mention that?"
    - "can you make it nicer?"
    - "why is this relevant?"
  - answer that question first instead of jumping into a new draft path.

- [ ] Persist active conversation constraints in backend state.
  - Track temporary rules like:
    - do not villainize X
    - keep it more casual
    - do not mention topic Y again
  - Apply these to all later turns in the same chat session.

## Drafting Behavior

- [ ] Support "draft now with current context" as a first-class path.
  - If the user says:
    - "draft me a post"
    - "just write it"
    - "give me something for now"
  - draft using current context, even if imperfect.
  - If context is weak, produce a rough starting draft plus 1 short note about what to improve next.

- [ ] Add "rough draft" mode for incomplete context.
  - The assistant should be allowed to draft with partial context instead of blocking.
  - The output can explicitly say:
    - "this is a rough first pass"
  - but it should still give the user something editable.

- [ ] Make coach outputs conversational, not systemy.
  - Avoid repetitive scaffolding phrases:
    - "let's narrow it down"
    - "what's the most recent concrete moment"
  - Vary phrasing and respond to what the user actually said.

- [ ] Improve follow-up quality.
  - Follow-up questions should use the user's last answer specifically.
  - Do not snap back to generic startup-builder prompts after a concrete answer.

## Frontend / UX

- [ ] Remove frontend intent heuristics after backend intent is authoritative.
  - Delete `inferComposerIntent(...)` or reduce it to a lightweight hint only.

- [ ] Keep quick-reply chips as optional examples only.
  - They should fill the composer, never auto-submit.
  - They should disappear once the conversation has enough context.

- [ ] Show a softer transition from coaching to drafting.
  - Example:
    - coach reply
    - "want me to turn that into a post?"
  - not a sudden jump into a totally different flow.

- [ ] Keep typing behavior human-feeling.
  - Typing indicator should appear before assistant text.
  - Final assistant text should stream or reveal naturally.

## Quality Controls

- [ ] Add regression coverage for conversational flow.
  - Cases:
    - broad ask -> one coach question
    - concrete reply -> ideate or draft
    - explicit draft ask after context -> draft, not coach
    - direct meta question -> answer the question first

- [ ] Add regression coverage for "too many questions."
  - Assert that a conversation with enough concrete signal does not emit a third generic narrowing question.

- [ ] Add regression coverage for corrections.
  - Example:
    - "don't villainize my cofounder"
  - Later turn must preserve that constraint.

## Nice-to-Have After Core Flow

- [ ] Add lightweight session memory for the current chat only.
  - No auth required.
  - Could be keyed by `runId` + local session.

- [ ] Add "refine this draft" shortcuts.
  - `make it softer`
  - `make it punchier`
  - `make it less negative`
  - `make it more specific`

- [ ] Add "answer first, then act" policy for the coach.
  - If the user asks a direct question, answer it first.
  - Then optionally suggest the next action.

## What Not To Do

- [ ] Do not add more wizard-style gating.
- [ ] Do not hardcode creator-specific content.
- [ ] Do not move generation logic back into the frontend.
- [ ] Do not add auth before the chat flow is stable.

## Suggested Execution Order

1. Backend-authoritative intent
2. Conversation state (`needs_more_context` / `ready_to_draft`)
3. Hard stop on over-questioning
4. Direct-question handling
5. "Draft now with current context" path
6. Regression cases for the above

