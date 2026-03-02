# Agent V2 Exemplars

These exemplars are used to:
- force niche-aware outputs (avoid generic motivational angles)
- force post-history grounding (use scraped posts)
- keep the assistant conversational (coach-first, drafts-second)
- keep output structured (JSON contracts)

How to use:
- During development: feed a small set of these exemplars as few-shot examples to each Action prompt.
- During evals: assert outputs resemble these patterns (structure + specificity).
- During retrieval: use "anchor_summary" patterns to inject scraped posts without copying.

Folders:
- niches/: NicheProtocol exemplars (guardrails)
- actions/: JSONL few-shot examples for each action
- anchors/: examples of post-history summaries to inject