export function buildPlannerJsonContract(args: {
  isThread: boolean;
}): string {
  return args.isThread
    ? `Respond ONLY with a valid JSON matching this schema:
{
  "objective": "...",
  "angle": "...",
  "targetLane": "original",
  "mustInclude": ["specific detail 1"],
  "mustAvoid": ["generic word 1"],
  "hookType": "...",
  "pitchResponse": "Conversational pitch to the user...",
  "posts": [
    {
      "role": "hook",
      "objective": "Open with...",
      "proofPoints": ["key point"],
      "transitionHint": "bridges to next post by..."
    }
  ]
}`
    : `Respond ONLY with a valid JSON matching this schema:
{
  "objective": "...",
  "angle": "...",
  "targetLane": "original",
  "mustInclude": ["specific detail 1"],
  "mustAvoid": ["generic word 1"],
  "hookType": "...",
  "pitchResponse": "Conversational pitch to the user..."
}`;
}

export function buildWriterJsonContract(): string {
  return `Respond ONLY with a valid JSON matching this schema:
{
  "angle": "...",
  "draft": "The actual post text. If this is a thread, serialize posts using --- separators between each post.",
  "supportAsset": "...",
  "whyThisWorks": "...",
  "watchOutFor": "..."
}`;
}

export function buildReviserJsonContract(): string {
  return `Respond ONLY with valid JSON:
{
  "revisedDraft": "...",
  "supportAsset": null,
  "issuesFixed": ["what changed"]
}`;
}

export function buildCriticJsonContract(): string {
  return `Respond ONLY with a valid JSON matching this schema:
{
  "approved": boolean,
  "finalAngle": "...",
  "finalDraft": "The corrected draft text...",
  "issues": ["Issue 1 found and fixed", "Issue 2 found and fixed"]
}`;
}
