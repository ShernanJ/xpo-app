import type { DraftRevisionChangeKind } from "../capabilities/revision/draftRevision.ts";

function looksLikeRevisionRequestMessage(normalized: string): boolean {
  if (!normalized) {
    return false;
  }

  const normalizedCompact = normalized.replace(/[.?!,]+$/g, "").trim();
  if (!normalizedCompact) {
    return false;
  }

  return [
    /^(?:make|change|fix|rewrite|remove|delete|cut|drop|add|swap|replace|rephrase|update)\b/,
    /^(?:tighten|trim|shorten|expand|soften)\b/,
    /^(?:tone|dial)\s+(?:it\s+)?down\b/,
    /^(?:keep|make)\s+it\b/,
    /^(?:same idea|keep the same idea|start over)\b/,
    /\b(?:less harsh|less aggressive|less salesy|less hype|less cringe|more like me|sound like me|stronger hook|better hook)\b/,
    /\b(?:too harsh|too aggressive|too long|too short|too generic|too salesy|too polished|too forced)\b/,
    /\b(?:feels|sounds)\s+too\s+\w+\b/,
  ].some((pattern) => pattern.test(normalizedCompact));
}

function looksLikeExplicitTrimRequestMessage(normalized: string): boolean {
  if (!normalized) {
    return false;
  }

  return [
    /\b(?:make|keep)\s+it\s+(?:short|shorter|tight|tighter)\b/,
    /\b(?:tighten|trim|shorten|condense|compress)\b/,
    /\bcut\s+it\s+down\b/,
    /\breads\s+fast\b/,
  ].some((pattern) => pattern.test(normalized));
}

function looksLikeExplicitExpandRequestMessage(normalized: string): boolean {
  if (!normalized) {
    return false;
  }

  return [
    /\b(?:make|keep)\s+it\s+(?:long|longer|fuller)\b/,
    /\b(?:expand|elongate|deepen|develop|broaden)\b/,
    /\bmore\s+detailed\b/,
    /\badd\s+more\s+detail\b/,
    /\bflesh\s+it\s+out\b/,
    /\bopen\s+it\s+up\b/,
    /\bgo\s+deeper\b/,
  ].some((pattern) => pattern.test(normalized));
}

function looksLikeExplicitSpecificityRequestMessage(normalized: string): boolean {
  if (!normalized) {
    return false;
  }

  return [
    /\bmore\s+specific\b/,
    /\bless\s+generic\b/,
    /\bless\s+vague\b/,
    /\badd\s+specificity\b/,
    /\bsharper\b/,
    /\btighten\s+the\s+point\b/,
  ].some((pattern) => pattern.test(normalized));
}

export function mentionsTrim(issuesFixed: string[]): boolean {
  return issuesFixed.some((issue) => issue.toLowerCase().includes("trimmed"));
}

export function resolveDraftReplyIntent(args: {
  normalizedMessage: string;
  isEdit: boolean;
  revisionChangeKind?: DraftRevisionChangeKind;
}) {
  return {
    isRevisionRequest:
      args.isEdit || looksLikeRevisionRequestMessage(args.normalizedMessage),
    canUseTrimSpecificCopy:
      args.revisionChangeKind === "length_trim" ||
      looksLikeExplicitTrimRequestMessage(args.normalizedMessage),
    canUseExpandSpecificCopy:
      args.revisionChangeKind === "length_expand" ||
      looksLikeExplicitExpandRequestMessage(args.normalizedMessage),
    canUseSpecificityCopy:
      args.revisionChangeKind === "specificity_tune" ||
      looksLikeExplicitSpecificityRequestMessage(args.normalizedMessage),
  };
}
