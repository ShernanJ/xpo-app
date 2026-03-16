import {
  isFullPromptEcho,
  repairAbruptEnding,
  stripThreadishLeadLabel,
  stripTrailingPromptEcho,
} from "../../agents/draftCompletion.ts";
import type { DraftFormatPreference } from "../../contracts/chat.ts";
import {
  hasSerializedThreadSeparator,
  joinSerializedThreadPosts,
  splitSerializedThreadPosts,
} from "../../../onboarding/shared/draftArtifacts.ts";

export type DeliveryValidationIssueCode =
  | "truncation"
  | "prompt_echo"
  | "artifact_mismatch"
  | "thread_separator_cleanup"
  | "thread_post_shape_mismatch"
  | "thread_hook_summary";

export interface DeliveryValidationIssue {
  code: DeliveryValidationIssueCode;
  message: string;
  retryConstraint: string;
  corrected: boolean;
}

export interface DeliveryValidationRequest {
  draft: string;
  formatPreference: DraftFormatPreference;
  sourceUserMessage?: string | null;
}

export interface DeliveryValidationResult {
  issues: DeliveryValidationIssue[];
  correctedDraft: string;
  retryConstraints: string[];
}

function buildTruncationRetryConstraint(): string {
  return "Finish the draft with a complete ending. Do not stop on a connector, stub, or cut-off closing fragment.";
}

function buildPromptEchoRetryConstraint(): string {
  return "Do not echo or restate the user's literal instruction language in the draft. Deliver the content directly.";
}

function buildArtifactMismatchRetryConstraint(formatPreference: DraftFormatPreference): string {
  return formatPreference === "thread"
    ? "Return a thread draft, not a single standalone post."
    : "Return one standalone post, not a thread or labeled post sequence.";
}

function buildThreadShapeRetryConstraint(): string {
  return "Return a real thread with distinct posts separated cleanly, and make sure each post is complete.";
}

function buildThreadSeparatorCleanupConstraint(): string {
  return "Return a clean thread with separator lines only between substantive posts, never as the opening hook.";
}

function buildThreadHookRetryConstraint(): string {
  return "Rewrite the opener as a sharp thread hook. Open a loop or clear tension, keep it native to X, and do not summarize the whole thread in the first post.";
}

function hasMalformedThreadOpener(posts: string[]): boolean {
  const firstPost = posts[0]?.trim() || "";
  return !firstPost || /^[-–—]{3,}$/.test(firstPost);
}

function looksLikeSummaryHeavyThreadOpener(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) {
    return false;
  }

  const sentences = normalized
    .split(/[.!?…]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const lowered = normalized.toLowerCase();
  const summaryMarkerCount = [
    "we all assume",
    "everyone thinks",
    "at first",
    "the real tension",
    "the impact",
    "the takeaway",
    "the result",
    "in short",
    "what this means",
    "what you need",
    "the framework",
    "the playbook",
    "the lesson",
    "the lessons",
    "if you're",
  ].filter((marker) => lowered.includes(marker)).length;

  if (sentences.length >= 4 && normalized.length >= 360) {
    return true;
  }

  if (sentences.length >= 4 && normalized.length >= 240 && summaryMarkerCount >= 2) {
    return true;
  }

  return sentences.length >= 3 && normalized.length >= 220 && summaryMarkerCount >= 3;
}

export function validateDelivery(
  args: DeliveryValidationRequest,
): DeliveryValidationResult {
  const trimmedDraft = args.draft.trim();
  let correctedDraft = trimmedDraft;
  const issues: DeliveryValidationIssue[] = [];

  const repairedEnding = repairAbruptEnding(correctedDraft);
  if (repairedEnding !== correctedDraft) {
    correctedDraft = repairedEnding;
    issues.push({
      code: "truncation",
      message: "Draft appears cut off before a complete ending.",
      retryConstraint: buildTruncationRetryConstraint(),
      corrected: true,
    });
  }

  const strippedPromptEcho = stripTrailingPromptEcho(
    correctedDraft,
    args.sourceUserMessage,
  );
  if (strippedPromptEcho !== correctedDraft) {
    correctedDraft = strippedPromptEcho;
    issues.push({
      code: "prompt_echo",
      message: "Draft ends by echoing the user's prompt instead of finishing the delivery.",
      retryConstraint: buildPromptEchoRetryConstraint(),
      corrected: true,
    });
  } else if (isFullPromptEcho(correctedDraft, args.sourceUserMessage)) {
    issues.push({
      code: "prompt_echo",
      message: "Draft only restates the user's prompt instead of delivering content.",
      retryConstraint: buildPromptEchoRetryConstraint(),
      corrected: false,
    });
  }

  if (args.formatPreference !== "thread") {
    const strippedThreadLead = stripThreadishLeadLabel(correctedDraft);
    const hadThreadishLead = strippedThreadLead !== correctedDraft;
    if (hadThreadishLead || hasSerializedThreadSeparator(correctedDraft)) {
      correctedDraft = strippedThreadLead;
      issues.push({
        code: "artifact_mismatch",
        message: "Draft shape looks like a thread even though a single post was requested.",
        retryConstraint: buildArtifactMismatchRetryConstraint(args.formatPreference),
        corrected: hadThreadishLead,
      });
    }
  }

  if (args.formatPreference === "thread") {
    const posts = splitSerializedThreadPosts(correctedDraft);
    const normalizedThreadDraft =
      posts.length > 1 ? joinSerializedThreadPosts(posts) : correctedDraft;

    if (posts.length > 1 && normalizedThreadDraft !== correctedDraft) {
      correctedDraft = normalizedThreadDraft;
      issues.push({
        code: "thread_separator_cleanup",
        message: "Thread draft had malformed separator scaffolding around the opener or between posts.",
        retryConstraint: buildThreadSeparatorCleanupConstraint(),
        corrected: true,
      });
    }

    if (hasMalformedThreadOpener(posts)) {
      issues.push({
        code: "thread_post_shape_mismatch",
        message: "Thread draft opener is malformed or missing substantive hook text.",
        retryConstraint: buildThreadShapeRetryConstraint(),
        corrected: false,
      });
    }

    if (posts.length < 3) {
      issues.push({
        code: "thread_post_shape_mismatch",
        message: "Thread draft does not contain enough distinct posts.",
        retryConstraint: buildThreadShapeRetryConstraint(),
        corrected: false,
      });
    }

    if (posts.length > 0 && looksLikeSummaryHeavyThreadOpener(posts[0] || "")) {
      issues.push({
        code: "thread_hook_summary",
        message: "Thread opener reads like a summary block instead of a sharp hook.",
        retryConstraint: buildThreadHookRetryConstraint(),
        corrected: false,
      });
    }
  }

  return {
    issues,
    correctedDraft,
    retryConstraints: Array.from(
      new Set(issues.map((issue) => issue.retryConstraint)),
    ),
  };
}
