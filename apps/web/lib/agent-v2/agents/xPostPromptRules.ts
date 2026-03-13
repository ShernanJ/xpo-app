import type { ThreadFramingStyle } from "../../onboarding/draftArtifacts";

type PromptRuleMode = "draft" | "revision" | "critic";

export function buildVerificationProfessionalismRule(
  mode: Exclude<PromptRuleMode, "critic">,
): string {
  return mode === "revision"
    ? "Verification is not a professionalism signal. Do not make the revision sound more polished or corporate just because the account is verified."
    : "Verification is not a professionalism signal. Do not make the writing more polished or corporate just because the account is verified.";
}

export function buildMarkdownStylingRule(mode: PromptRuleMode): string {
  return mode === "draft"
    ? "X does NOT support markdown styling. Do not use bold, italics, headings, or other markdown markers like **text**, __text__, *text*, # heading, or backticks."
    : "X does NOT support markdown styling. Remove or avoid bold, italics, headings, or markdown markers like **text**, __text__, *text*, # heading, or backticks.";
}

export function buildEngagementBaitRule(mode: PromptRuleMode): string {
  switch (mode) {
    case "critic":
      return `Do NOT allow empty engagement-bait CTAs like "reply 'FOCUS'" or "comment 'X'" unless the reader clearly gets a concrete payoff in return. If there is no payoff, rewrite that CTA into something natural and non-gimmicky.`;
    case "revision":
      return `Do NOT introduce empty engagement-bait CTAs like "reply 'FOCUS'" or "comment 'X'" unless the reader clearly gets something concrete in return (DM, template, checklist, link, copy, or access). If there is no real payoff, use a more natural CTA.`;
    default:
      return `Do NOT use empty engagement-bait CTAs like "reply 'FOCUS'" or "comment 'X'" unless the reader clearly gets something specific in return (for example: a DM, a template, a checklist, a link, a copy, or access). If there is no real payoff, use a more natural CTA like asking for their take or asking them to try it and report back.`;
  }
}

export function buildThreadFramingRequirement(args: {
  threadFramingStyle: ThreadFramingStyle | null;
  mode: "draft" | "revision";
} | null): string {
  if (!args) {
    return "";
  }

  switch (args.threadFramingStyle) {
    case "numbered":
      return args.mode === "revision"
        ? " If this is a thread revision, preserve or apply numbered framing like 1/5, 2/5, 3/5 across the posts, but keep the opener readable and avoid dense bullet blocks."
        : " Use numbered framing. Prefix each post with a clear marker like 1/5, 2/5, 3/5 so readers instantly know this is a thread. Even then, keep the opener readable and avoid turning the first post into a credential dump or dense bullet block.";
    case "soft_signal":
      return args.mode === "revision"
        ? " If this is a thread revision, make the opener feel naturally threaded through a clean opening sentence or short setup paragraph. Avoid x/x numbering unless the user explicitly asks for it, and avoid canned prefixes like here's what happened unless they genuinely fit."
        : " Use soft thread framing. The first post should make it naturally obvious the reader is entering a thread through a clean opening sentence or short setup paragraph. Do NOT add x/x numbering unless the user explicitly asked for it. Avoid canned prefixes like here's what happened unless they genuinely fit the voice and content. Keep the opener in clean prose, not a dense bullet list or stacked credential block.";
    case "none":
      return args.mode === "revision"
        ? " If this is a thread revision, keep the framing natural and avoid x/x numbering or explicit thread labels unless the user explicitly asks for them. Avoid a list-heavy opener."
        : " Keep the thread natural. Do not add x/x numbering or explicit thread labels unless the user explicitly asked for them. Avoid a list-heavy opener; start with a clean sentence or short paragraph.";
    default:
      return "";
  }
}
