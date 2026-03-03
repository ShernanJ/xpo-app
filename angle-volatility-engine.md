# Angle Volatility Engine

This file defines a backend-owned prompt contract and deterministic mutation rules for generating new X drafts from a high-performing anchor post without copying that post too literally.

The goal is:

- reuse proof
- preserve voice/tone constraints
- rotate the frame
- avoid opener and structure mimicry

This is intended to sit between:

- retrieved `anchor_post_text`
- `evidence_pack`
- lane / goal selection
- the writer model

It should be treated as a generation contract, not a frontend behavior.

## Purpose

The current failure mode is not missing retrieval. The system can often retrieve the correct anchor post and evidence. The failure is that the model then overuses the anchor at the phrasing or structure level.

This contract fixes that by:

1. isolating one primary angle lever
2. forcing a rotated opener
3. banning opener/phrase overlap with the anchor
4. limiting proof reuse
5. enforcing structure based on output length
6. preferring a confident close

## Inputs

- `anchor_post_text: string`
- `evidence_pack: { metrics: string[]; entities: string[]; proof_points: string[]; story_beats: string[]; constraints?: string[] }`
- `lane: "Project Showcase" | "Technical Insight" | "Build In Public" | "Operator Lessons" | "Social Observation"`
- `goal: "followers" | "replies" | "clicks"`
- `target_length: "short" | "long_form"`
- `tone_flags: { lowercase?: boolean; confident_close?: boolean; [key: string]: unknown }`

## Angle Lever Model

Each lever should be normalized into this shape:

```ts
type AngleLever = {
  id: string;
  type:
    | "identity"
    | "scale"
    | "speed"
    | "team"
    | "philosophy"
    | "origin"
    | "talent"
    | "contrarian"
    | "process"
    | "trap";
  title: string;
  description: string;
  example_hooks: string[];
  allowed_proof: {
    metrics: string[];
    entities: string[];
  };
};
```

Example lever set for the Vitalii anchor:

- `small-team-dominance`
- `delete-80-percent-of-work`
- `ignore-best-practices`
- `immigrant-arc-lens`
- `top-one-percent-talent`
- `ten-engineers-beat-one-hundred`
- `founder-traps`

## Hard Generation Constraints

These are non-negotiable:

1. Angle Isolation
- Choose exactly 1 primary angle lever.
- Allow at most 2 supporting levers.
- The draft must clearly read as being about the primary lever.

2. Entry Point Rotation
- The opener must use one of:
  - `contrarian claim`
  - `problem statement`
  - `vivid micro-story`
  - `hard rule`
  - `surprising statistic`
  - `single-sentence thesis`
- The opener type must not match the anchor opener type.

3. No-Overlap Rules
- Do not copy the anchor first sentence.
- Do not paraphrase the anchor first sentence closely.
- Do not reuse the anchor first 15 words.
- Do not reuse any unique anchor phrase verbatim.
- No 5-word sequence from the anchor may appear in the draft.
- Do not reuse any anchor bullet line verbatim.

4. Proof Reuse Limits
- `short`: use at most 2 metrics.
- `long_form`: use at most 4 metrics.
- Reuse concrete proof, but do not dump every proof item into one draft.

5. Blueprint Compliance
- `short`:
  - one clear idea
  - no unnecessary sections
- `long_form`:
  - at least 90 words
  - at least 4 sections
  - includes a bullet proof block

6. Confident Close
- The final line must be a statement.
- Do not end with a question unless a downstream system explicitly overrides this rule.

## Prompt Contract

### System Prompt Template

```text
You are the draft writer for an X growth engine.

Your job is to generate a fresh post that uses the same proof domain as the anchor material without copying the anchor's opening, wording, or structural fingerprint too closely.

You must obey these rules:

1. Angle isolation
- Use exactly one primary angle lever.
- You may support it with at most two secondary levers.
- Keep the draft centered on the primary lever.

2. Entry point rotation
- The opener must use one of these rhetorical moves:
  - contrarian claim
  - problem statement
  - vivid micro-story
  - hard rule
  - surprising statistic
  - single-sentence thesis
- The opener must NOT use the same opener type as the anchor.

3. No-overlap rules
- Do NOT copy the anchor's first sentence.
- Do NOT reuse the anchor's first 15 words.
- Do NOT reuse any bullet line from the anchor verbatim.
- Do NOT reproduce any 5-word sequence from the anchor.
- Use the anchor as proof/style reference only, not as copy.

4. Proof reuse rules
- Reuse concrete proof selectively.
- Use no more than the allowed number of metrics.
- Prefer 1-2 strong proof points over a full proof dump.

5. Output-shape rules
- If target_length is short: keep it to one clear idea.
- If target_length is long_form:
  - write at least 90 words
  - use at least 4 sections
  - include a bullet proof block

6. Closing rule
- End with a confident closing statement.
- Do not end with a question.

7. Voice handling
- Respect tone flags.
- If lowercase=true, lowercase the draft except for acronyms, brand names, or proper nouns that should stay capitalized.
- Keep the tone native to X, concrete, and direct.

8. Grounding rule
- The evidence pack is the factual source.
- The angle lever is the framing source.
- The anchor is a structural/proof reference, not text to copy.

Return valid JSON only.
```

### User Prompt Template

```text
Generate 1 X draft using the following inputs.

anchor_post_text:
{{anchor_post_text}}

anchor_opener_type:
{{anchor_opener_type}}

selected_angle:
- primary: {{primary_angle.id}} | {{primary_angle.title}}
- description: {{primary_angle.description}}
- secondary: {{secondary_angle_ids_csv_or_none}}

lane:
{{lane}}

goal:
{{goal}}

target_length:
{{target_length}}

tone_flags:
{{tone_flags_json}}

allowed_metric_limit:
{{max_metric_count}}

allowed_proof:
- metrics: {{allowed_metrics_json}}
- entities: {{allowed_entities_json}}

evidence_pack:
{{evidence_pack_json}}

Generate JSON in this shape:
{
  "openerType": "contrarian claim | problem statement | vivid micro-story | hard rule | surprising statistic | single-sentence thesis",
  "primaryAngleId": "string",
  "secondaryAngleIds": ["string"],
  "usedMetrics": ["string"],
  "usedEntities": ["string"],
  "draft": "string"
}

Requirements:
- use a different opener type than the anchor opener type
- do not copy the anchor opener or bullet wording
- keep the topic centered on the selected primary angle
- keep proof usage within the allowed metric limit
- if target_length is long_form, satisfy the long-form blueprint
```

## Draft Diagnostics Spec

The diagnostics layer should score four dimensions:

1. Evidence reuse
- How many allowed metrics were reused
- How many allowed entities were reused
- Whether proof points came from the evidence pack vs invented claims

2. Novelty vs anchor
- opener similarity
- 5-gram overlap
- exact line reuse
- exact bullet reuse

3. Blueprint compliance
- word count
- section count
- bullet block presence
- confident close

4. Lane / goal alignment
- lane-specific heuristics
- goal-specific heuristics

### Diagnostics Output Shape

```ts
type DraftDiagnostics = {
  evidence: {
    metricCount: number;
    entityCount: number;
    proofPointCount: number;
    exceededMetricLimit: boolean;
    inventedClaimRisk: "low" | "medium" | "high";
  };
  novelty: {
    openerType: string;
    openerMatchesAnchorType: boolean;
    firstSentenceOverlap: boolean;
    firstFifteenWordOverlap: boolean;
    reusedFiveGramCount: number;
    exactLineReuseCount: number;
    exactBulletReuseCount: number;
  };
  blueprint: {
    wordCount: number;
    sectionCount: number;
    hasBulletProofBlock: boolean;
    confidentClose: boolean;
    passes: boolean;
  };
  alignment: {
    laneScore: number;
    goalScore: number;
    primaryAngleVisible: boolean;
    secondaryAngleLeak: boolean;
  };
  overall: {
    score: number;
    passes: boolean;
    blockers: string[];
  };
};
```

## Pseudocode

### `extractLevers(anchor_post_text, evidence_pack) -> levers[]`

```ts
function extractLevers(
  anchor_post_text: string,
  evidence_pack: EvidencePack,
): AngleLever[] {
  const text = anchor_post_text.toLowerCase();
  const levers: AngleLever[] = [];

  if (/10 engineers|small team|< 30 people/.test(text)) {
    levers.push({
      id: "small-team-dominance",
      type: "team",
      title: "small team dominance",
      description: "small teams outperform larger teams when talent density and execution are high",
      example_hooks: [
        "small teams don't lose because they're small. they lose because they tolerate drag.",
        "10 great operators can outrun 100 average ones.",
      ],
      allowed_proof: {
        metrics: ["10 engineers", "< 30 people"],
        entities: [],
      },
    });
  }

  if (/30m|10m arr|60k creators|200m/.test(text)) {
    levers.push({
      id: "scale-with-proof",
      type: "scale",
      title: "scale with proof",
      description: "use hard operating metrics as proof of execution quality",
      example_hooks: [
        "if you want to talk about growth, bring receipts.",
        "most growth advice is useless without operating proof.",
      ],
      allowed_proof: {
        metrics: ["$30M/y", "$10M ARR", "60k creators", "$200M+"],
        entities: [],
      },
    });
  }

  if (/ignoring “best practices”|ignoring best practices/.test(text)) {
    levers.push({
      id: "ignore-best-practices",
      type: "contrarian",
      title: "ignoring best practices",
      description: "non-obvious execution beats cargo-cult best practices",
      example_hooks: [
        "a lot of so-called best practices are just inherited laziness.",
        "the fastest way to stall is doing what everyone says you're supposed to do.",
      ],
      allowed_proof: {
        metrics: [],
        entities: [],
      },
    });
  }

  if (/small town in russia|canadian winter|immigrated/.test(text)) {
    levers.push({
      id: "immigrant-arc-lens",
      type: "origin",
      title: "immigrant arc lens",
      description: "origin story reframes the way current execution and ambition are understood",
      example_hooks: [
        "how you grow changes when you've had to rebuild from scratch.",
      ],
      allowed_proof: {
        metrics: ["$15 frying pan", "$200 worth of things"],
        entities: [],
      },
    });
  }

  if (/top 1% talent|waiting years/.test(text)) {
    levers.push({
      id: "top-one-percent-talent",
      type: "talent",
      title: "top 1% talent waiting game",
      description: "talent density compounds over time when hiring standards are extreme",
      example_hooks: [
        "hiring slower can speed the company up.",
      ],
      allowed_proof: {
        metrics: [],
        entities: [],
      },
    });
  }

  return dedupeLevers(levers);
}
```

### `selectAngle(levers, lane, goal) -> { primary, secondary[] }`

```ts
function selectAngle(
  levers: AngleLever[],
  lane: Lane,
  goal: Goal,
): { primary: AngleLever; secondary: AngleLever[] } {
  const scored = levers.map((lever) => {
    let score = 0;

    if (lane === "Operator Lessons") {
      if (["contrarian", "process", "team", "trap", "talent"].includes(lever.type)) {
        score += 4;
      }
    }

    if (lane === "Build In Public") {
      if (["origin", "process", "speed", "identity"].includes(lever.type)) {
        score += 4;
      }
    }

    if (goal === "followers") {
      if (["contrarian", "identity", "trap", "philosophy"].includes(lever.type)) {
        score += 2;
      }
    }

    if (goal === "replies") {
      if (["trap", "contrarian", "process"].includes(lever.type)) {
        score += 2;
      }
    }

    if (goal === "clicks") {
      if (["scale", "team", "talent"].includes(lever.type)) {
        score += 2;
      }
    }

    if (lever.allowed_proof.metrics.length > 0) {
      score += 1;
    }

    return { lever, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const primary = scored[0].lever;
  const secondary = scored
    .slice(1)
    .map((item) => item.lever)
    .filter((lever) => lever.type !== primary.type)
    .slice(0, 2);

  return { primary, secondary };
}
```

### `buildPrompt(angle, constraints, evidence_pack, tone_flags) -> messages[]`

```ts
function buildPrompt(
  angle: { primary: AngleLever; secondary: AngleLever[] },
  constraints: {
    anchor_post_text: string;
    anchor_opener_type: string;
    lane: Lane;
    goal: Goal;
    target_length: "short" | "long_form";
  },
  evidence_pack: EvidencePack,
  tone_flags: ToneFlags,
): Array<{ role: "system" | "user"; content: string }> {
  const maxMetricCount = constraints.target_length === "long_form" ? 4 : 2;

  const system = SYSTEM_PROMPT_TEMPLATE;
  const user = renderUserPrompt({
    anchor_post_text: constraints.anchor_post_text,
    anchor_opener_type: constraints.anchor_opener_type,
    primary_angle: angle.primary,
    secondary_angles: angle.secondary,
    lane: constraints.lane,
    goal: constraints.goal,
    target_length: constraints.target_length,
    tone_flags,
    max_metric_count: maxMetricCount,
    allowed_metrics: angle.primary.allowed_proof.metrics,
    allowed_entities: angle.primary.allowed_proof.entities,
    evidence_pack,
  });

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
```

### `diagnoseDraft(draft, anchor_post_text, blueprint) -> diagnostics`

```ts
function diagnoseDraft(
  draft: string,
  anchor_post_text: string,
  blueprint: {
    target_length: "short" | "long_form";
    maxMetricCount: number;
    lane: Lane;
    goal: Goal;
    primaryAngleId: string;
    anchorOpenerType: string;
    evidencePack: EvidencePack;
  },
): DraftDiagnostics {
  const wordCount = countWords(draft);
  const sectionCount = countSections(draft);
  const hasBulletProofBlock = hasBulletBlock(draft);
  const confidentClose = !endsWithQuestion(draft);
  const openerType = classifyOpener(draft);

  const reusedFiveGramCount = countSharedNgrams(anchor_post_text, draft, 5);
  const firstSentenceOverlap = firstSentence(anchor_post_text) === firstSentence(draft);
  const firstFifteenWordOverlap = firstWords(anchor_post_text, 15) === firstWords(draft, 15);
  const exactLineReuseCount = countExactLineReuse(anchor_post_text, draft);
  const exactBulletReuseCount = countExactBulletReuse(anchor_post_text, draft);

  const metricCount = countMetricReuse(draft, blueprint.evidencePack.metrics);
  const entityCount = countEntityReuse(draft, blueprint.evidencePack.entities);
  const proofPointCount = countProofPointReuse(draft, blueprint.evidencePack.proof_points);

  const exceededMetricLimit = metricCount > blueprint.maxMetricCount;
  const blueprintPasses =
    blueprint.target_length === "short"
      ? wordCount > 0 && confidentClose
      : wordCount >= 90 &&
        sectionCount >= 4 &&
        hasBulletProofBlock &&
        confidentClose;

  const laneScore = scoreLaneAlignment(draft, blueprint.lane);
  const goalScore = scoreGoalAlignment(draft, blueprint.goal);

  const blockers: string[] = [];

  if (openerType === blueprint.anchorOpenerType) blockers.push("opener type matches anchor");
  if (firstSentenceOverlap) blockers.push("copied anchor first sentence");
  if (firstFifteenWordOverlap) blockers.push("copied anchor first 15 words");
  if (reusedFiveGramCount > 0) blockers.push("reused 5-gram from anchor");
  if (exactBulletReuseCount > 0) blockers.push("copied anchor bullet line");
  if (exceededMetricLimit) blockers.push("reused too many metrics");
  if (!blueprintPasses) blockers.push("failed blueprint");

  const score =
    (metricCount + entityCount + proofPointCount) * 2 +
    laneScore +
    goalScore -
    reusedFiveGramCount * 3 -
    exactLineReuseCount * 4 -
    exactBulletReuseCount * 5 -
    (blueprintPasses ? 0 : 10);

  return {
    evidence: {
      metricCount,
      entityCount,
      proofPointCount,
      exceededMetricLimit,
      inventedClaimRisk: proofPointCount === 0 && metricCount === 0 ? "medium" : "low",
    },
    novelty: {
      openerType,
      openerMatchesAnchorType: openerType === blueprint.anchorOpenerType,
      firstSentenceOverlap,
      firstFifteenWordOverlap,
      reusedFiveGramCount,
      exactLineReuseCount,
      exactBulletReuseCount,
    },
    blueprint: {
      wordCount,
      sectionCount,
      hasBulletProofBlock,
      confidentClose,
      passes: blueprintPasses,
    },
    alignment: {
      laneScore,
      goalScore,
      primaryAngleVisible: detectPrimaryAngleSignal(draft, blueprint.primaryAngleId),
      secondaryAngleLeak: false,
    },
    overall: {
      score,
      passes: blockers.length === 0,
      blockers,
    },
  };
}
```

## Example Run

### Example Inputs

- `lane`: `Operator Lessons`
- `goal`: `followers`
- `target_length`: `long_form`
- `tone_flags`: `{ "lowercase": false, "confident_close": true }`

### Selected Angle Lever

```json
{
  "primary": {
    "id": "small-team-dominance",
    "type": "team",
    "title": "small team dominance",
    "description": "small teams outperform larger teams when talent density and execution are high",
    "example_hooks": [
      "10 great operators can outrun 100 average ones."
    ],
    "allowed_proof": {
      "metrics": ["10 engineers", "60k creators", "$30M/y"],
      "entities": ["Stan"]
    }
  },
  "secondary": [
    {
      "id": "ignore-best-practices",
      "type": "contrarian",
      "title": "ignoring best practices",
      "description": "non-obvious execution beats cargo-cult best practices",
      "example_hooks": [
        "the fastest way to stall is doing what everyone says you're supposed to do."
      ],
      "allowed_proof": {
        "metrics": [],
        "entities": []
      }
    }
  ]
}
```

### Generated Prompt Messages

```json
[
  {
    "role": "system",
    "content": "You are the draft writer for an X growth engine. Your job is to generate a fresh post that uses the same proof domain as the anchor material without copying the anchor's opening, wording, or structural fingerprint too closely. ... Return valid JSON only."
  },
  {
    "role": "user",
    "content": "Generate 1 X draft using the following inputs.\n\nanchor_post_text:\nI’m planning to be more intentional on Twitter in 2026, so here’s who I am and what I do: ...\n\nanchor_opener_type:\nidentity-led announcement\n\nselected_angle:\n- primary: small-team-dominance | small team dominance\n- description: small teams outperform larger teams when talent density and execution are high\n- secondary: ignore-best-practices\n\nlane:\nOperator Lessons\n\ngoal:\nfollowers\n\ntarget_length:\nlong_form\n\ntone_flags:\n{\"lowercase\":false,\"confident_close\":true}\n\nallowed_metric_limit:\n4\n\nallowed_proof:\n- metrics: [\"10 engineers\",\"60k creators\",\"$30M/y\"]\n- entities: [\"Stan\"]\n\nevidence_pack:\n{\"metrics\":[\"10 engineers\",\"60k creators\",\"$30M/y\",\"$10M ARR\"],\"entities\":[\"Stan\"],\"proof_points\":[\"small team built a profitable company\",\"execution outperformed bigger orgs\"],\"story_beats\":[\"scaling with a lean team\",\"ignoring best practices\"]}\n\nGenerate JSON in this shape:\n{...}"
  }
]
```

### Sample Long-Form Draft

This sample is intentionally fresh. It reuses proof but changes the frame and opener type.

```text
Most founders overcomplicate scale.

The instinct is always the same: add headcount, add process, add layers.

That usually hides the real problem.

The real problem is that most teams expand before they prove they can execute with clarity.

At Stan, we pushed real scale with 10 engineers serving 60k creators.

- we kept the team small on purpose
- we treated clarity like a growth lever, not a soft skill
- we refused to add work just because bigger companies do
- we measured whether each system made execution cleaner, not just busier

That discipline matters more than people think.

A lot of "scaling advice" is really just early bureaucracy with a better brand name.

The lesson is simple:

If a team cannot move fast while lean, adding people usually multiplies confusion before it multiplies output.

Scale should be earned through tighter execution, not purchased through headcount.
```

### Sample Diagnostics Output

```json
{
  "evidence": {
    "metricCount": 2,
    "entityCount": 1,
    "proofPointCount": 2,
    "exceededMetricLimit": false,
    "inventedClaimRisk": "low"
  },
  "novelty": {
    "openerType": "hard rule",
    "openerMatchesAnchorType": false,
    "firstSentenceOverlap": false,
    "firstFifteenWordOverlap": false,
    "reusedFiveGramCount": 0,
    "exactLineReuseCount": 0,
    "exactBulletReuseCount": 0
  },
  "blueprint": {
    "wordCount": 126,
    "sectionCount": 8,
    "hasBulletProofBlock": true,
    "confidentClose": true,
    "passes": true
  },
  "alignment": {
    "laneScore": 8,
    "goalScore": 6,
    "primaryAngleVisible": true,
    "secondaryAngleLeak": false
  },
  "overall": {
    "score": 26,
    "passes": true,
    "blockers": []
  }
}
```

## Implementation Notes

- Do not let the frontend decide any of this.
- The backend should:
  1. extract levers
  2. pick the angle
  3. build the prompt
  4. diagnose the result
  5. reject or rerank weak drafts

- The anchor should remain:
  - a proof source
  - a style/structure source
  - never a source of reusable wording

- If the system later adds a deterministic fallback, it should use:
  - the selected angle
  - the allowed proof subset
  - the same no-overlap rules
  instead of generic templates.
