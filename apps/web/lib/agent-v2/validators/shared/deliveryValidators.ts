import {
  repairAbruptEnding,
  stripThreadishLeadLabel,
  stripTrailingPromptEcho,
} from "../../agents/draftCompletion.ts";
import type { DraftFormatPreference } from "../../contracts/chat.ts";

export type DeliveryValidationIssueCode =
  | "truncation"
  | "prompt_echo"
  | "artifact_mismatch"
  | "thread_post_shape_mismatch";

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

const THREAD_SEPARATOR = /\n\s*---\s*\n/;

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

function splitThreadPosts(value: string): string[] {
  return value
    .split(THREAD_SEPARATOR)
    .map((entry) => entry.trim())
    .filter(Boolean);
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
  }

  if (args.formatPreference !== "thread") {
    const strippedThreadLead = stripThreadishLeadLabel(correctedDraft);
    const hadThreadishLead = strippedThreadLead !== correctedDraft;
    if (hadThreadishLead || THREAD_SEPARATOR.test(correctedDraft)) {
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
    const posts = splitThreadPosts(correctedDraft);
    if (posts.length < 3) {
      issues.push({
        code: "thread_post_shape_mismatch",
        message: "Thread draft does not contain enough distinct posts.",
        retryConstraint: buildThreadShapeRetryConstraint(),
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
