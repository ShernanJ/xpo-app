import { z } from "zod";

export const StructuredThreadTweetRoleSchema = z.enum([
  "hook",
  "context",
  "escalation",
  "value",
  "cta",
]);

export const StructuredThreadSchema = z.object({
  tweets: z.array(
    z.object({
      role: StructuredThreadTweetRoleSchema,
      content: z.string(),
    }),
  ),
});

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
  "extracted_constraints": ["no listicles", "sharpen the tone"],
  "requires_live_context": false,
  "search_queries": ["specific search query"],
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
  "pitchResponse": "Conversational pitch to the user...",
  "extracted_constraints": ["no listicles", "sharpen the tone"],
  "requires_live_context": false,
  "search_queries": ["specific search query"]
}`;
}

export function buildWriterJsonContract(args?: {
  isStructuredThread?: boolean;
}): string {
  if (args?.isStructuredThread) {
    return `Respond ONLY with a valid JSON matching this schema:
{
  "tweets": [
    {
      "role": "hook",
      "content": "The actual text of the tweet."
    },
    {
      "role": "context",
      "content": "The actual text of the tweet."
    }
  ]
}`;
  }

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
  "mechanicalDirective": "Concrete rewrite instruction for the reviser. Example: Strip adjectives, remove exclamation marks, and lower the reading grade level.",
  "issues": ["Issue 1 found and fixed", "Issue 2 found and fixed"]
}`;
}
