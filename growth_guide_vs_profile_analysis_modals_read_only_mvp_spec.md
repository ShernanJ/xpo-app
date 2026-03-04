# Read-only MVP: Growth Guide modal vs Profile Analysis modal

## Goal
Both modals are **read-only** in MVP (no “apply”, no “set active”, no reminders), but they must feel **clearly different**:

- **Growth Guide (Playbooks) = the textbook** → “what works on X at each stage (general).”
- **Profile Analysis = your diagnosis + your route** → “what *you* should run next based on *your* posts.”

This separation prevents duplication even when both are informational.

---

## 1) Growth Guide (formerly “Growth Playbooks”) — simplified beginner guide

### Purpose
Teach **how X growth works by stage** and what playbooks are proven at each stage.

### Mental model
**Mini course / field guide**. Something users can skim once and revisit occasionally.

### What it contains (generic, stage-based)
- **Stage overview** + win condition (very short)
- **3–5 core playbooks** for that stage
- **What good looks like** (benchmarks)
- **Common mistakes** (accordion)
- **Templates** (tabbed cards: Hook / Reply / Thread / CTA)

### What it must NOT contain
- No user-specific evidence
- No anchors from the user’s posts
- No “because you…” recommendations

### Primary interactions
- Switch stage chips
- Browse playbooks
- Copy templates / copy checklist

### Recommended naming
To reduce confusion, consider renaming to one of:
- **Growth Guide**
- **X Growth 101**
- **Playbook Library** (explicitly general)

---

## 2) Profile Analysis — personalized read + recommended routes

### Purpose
Summarize what Xpo sees in the user’s recent posts and translate that into **priorities + recommended playbooks**.

### Mental model
**Coach report / diagnostics dashboard**. Something users check weekly.

### What it contains (personalized)
1) **Stage + confidence + why**
   - Stage badge + confidence meter
   - 2–3 signals that drove the stage read (e.g., reply ratio, cadence, formats)

2) **Bottleneck + win condition (1–2 lines max)**

3) **Recommended playbooks for you (top 1–3)**
   Each recommended playbook card includes:
   - **Recommendation reason (1 line)**: “because …”
   - **Expected outcome (1 line)**
   - **Starter plan (3 bullets max)**
   - **Link:** “Learn this playbook” → deep link into Growth Guide

4) **Evidence / anchors**
   - Strong and weak examples (anchors)
   - Voice signals (casing, length, structure)
   - Keep / avoid

### What it must NOT contain
- No full explanation of every stage (that’s the Growth Guide)

### Primary interactions
- Scan insights quickly
- Jump to evidence (anchors)
- Open recommended playbook in Growth Guide

---

## Non-overlap rules (so they never feel redundant)

### Growth Guide is allowed to say
- “Reply Ladder works for 0→1k”
- “Here’s how to run it”
- “Here are templates”

### Profile Analysis is allowed to say
- “Reply Ladder is best for *you* because …”
- “Here’s the evidence from your posts”
- “Here are your next 3 moves”
- “Here’s what to stop doing”

**Profile Analysis should not teach all stages.**
**Growth Guide should not discuss the user’s posts.**

---

## Should we redesign the modals?
Yes — keep a shared visual system, but change the **layout archetype** so they feel distinct.

### Shared modal shell (keep consistent)
- Same header styling
- Same card/chip styles
- Same spacing + typography

### Growth Guide layout (redesign)
**Single-column, sectioned “mini course”** (scrolling guide)
- Header: Growth Guide + stage chips
- Section A: Stage win condition (visual)
- Section B: Playbooks for this stage (3–5 cards)
- Section C: Benchmarks (“what good looks like”)
- Section D: Templates (tabs)
- Section E: Mistakes (accordion)

> Avoid the 2-column “settings + preview” pattern here — it makes it feel like a tool you’re applying.

### Profile Analysis layout (keep dashboard feel)
**Card grid / 2-column report**
- Header: profile + stage badge + confidence
- KPI row: archetype, niche, loop, readiness
- “Top gaps / next 3 moves”
- “Recommended playbooks for you” (with deep links to Growth Guide)
- Evidence: anchors + voice signals + keep/avoid

---

## MVP implementation stance
- Both modals are **read-only**.
- Growth Guide provides **general education**.
- Profile Analysis provides **personalized interpretation + recommended routes**.
- The bridge is: **Recommended playbooks** in Profile Analysis → “Learn this playbook” opens Growth Guide at the right section.

---

## Microcopy cues (to reduce confusion)
- Button: **Growth Guide** — subtitle: “how X growth works”
- Button: **Your Analysis** — subtitle: “what xpo sees in your posts”

Growth Guide section titles:
- “win condition” / “playbooks that work” / “templates” / “common mistakes”

Profile Analysis section titles:
- “stage + signals” / “biggest gap” / “your next playbook” / “evidence”
