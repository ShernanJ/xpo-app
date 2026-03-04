import type { DraftPreference } from "../contracts/chat";

interface BuildDraftReplyArgs {
  userMessage: string;
  draftPreference: DraftPreference;
  isEdit: boolean;
  issuesFixed?: string[];
}

function mentionsTrim(issuesFixed: string[]): boolean {
  return issuesFixed.some((issue) => issue.toLowerCase().includes("trimmed"));
}

export function buildDraftReply(args: BuildDraftReplyArgs): string {
  const normalized = args.userMessage.trim().toLowerCase();
  const issuesFixed = args.issuesFixed || [];
  const isRevisionRequest =
    args.isEdit ||
    [
      "edit",
      "change",
      "tweak",
      "revise",
      "rewrite",
      "fix",
      "make it",
      "update",
    ].some((cue) => normalized.includes(cue));

  if (isRevisionRequest) {
    if (args.draftPreference === "voice_first") {
      return "made the edit and kept it close to your voice. take a look.";
    }

    if (args.draftPreference === "growth_first") {
      return "made the edit and kept the hook sharper. take a look.";
    }

    if (mentionsTrim(issuesFixed)) {
      return "made the edit and tightened it to fit. take a look.";
    }

    return "made the edit. take a look.";
  }

  if (args.draftPreference === "voice_first") {
    return "kept it natural and close to your voice. take a look.";
  }

  if (args.draftPreference === "growth_first") {
    return "leaned into a sharper hook for growth. take a look.";
  }

  if (mentionsTrim(issuesFixed)) {
    return "kept it tight enough to post. take a look.";
  }

  if (
    ["looks good", "write it", "draft it", "go ahead", "ship it"].some((cue) =>
      normalized.includes(cue),
    )
  ) {
    return "here's the draft. take a look.";
  }

  return "here's a draft. take a look.";
}
