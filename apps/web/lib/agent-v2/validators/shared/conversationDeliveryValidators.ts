import {
  repairAbruptEnding,
  stripTrailingPromptEcho,
} from "../../agents/draftCompletion.ts";

export type ConversationDeliveryValidationIssueCode =
  | "truncation"
  | "prompt_echo";

export interface ConversationDeliveryValidationIssue {
  code: ConversationDeliveryValidationIssueCode;
  message: string;
  retryConstraint: string;
  corrected: boolean;
}

export interface ConversationDeliveryValidationRequest {
  response: string;
  sourceUserMessage?: string | null;
}

export interface ConversationDeliveryValidationResult {
  issues: ConversationDeliveryValidationIssue[];
  correctedResponse: string;
  retryConstraints: string[];
}

function buildTruncationRetryConstraint(): string {
  return "Finish the reply with a complete ending. Do not stop on a connector, stub, or cut-off closing fragment.";
}

function buildPromptEchoRetryConstraint(): string {
  return "Do not echo or restate the user's literal instruction language in the reply. Answer directly and naturally.";
}

export function validateConversationalDelivery(
  args: ConversationDeliveryValidationRequest,
): ConversationDeliveryValidationResult {
  let correctedResponse = args.response.trim();
  const issues: ConversationDeliveryValidationIssue[] = [];

  const repairedEnding = repairAbruptEnding(correctedResponse);
  if (repairedEnding !== correctedResponse) {
    correctedResponse = repairedEnding;
    issues.push({
      code: "truncation",
      message: "Reply appears cut off before a complete ending.",
      retryConstraint: buildTruncationRetryConstraint(),
      corrected: true,
    });
  }

  const strippedPromptEcho = stripTrailingPromptEcho(
    correctedResponse,
    args.sourceUserMessage,
  );
  if (strippedPromptEcho !== correctedResponse) {
    correctedResponse = strippedPromptEcho;
    issues.push({
      code: "prompt_echo",
      message: "Reply ends by echoing the user's prompt instead of finishing the delivery.",
      retryConstraint: buildPromptEchoRetryConstraint(),
      corrected: true,
    });
  }

  return {
    issues,
    correctedResponse,
    retryConstraints: Array.from(
      new Set(issues.map((issue) => issue.retryConstraint)),
    ),
  };
}
