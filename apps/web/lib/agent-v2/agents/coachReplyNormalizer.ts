export interface CoachReplyShape {
  response: string;
  probingQuestion: string | null;
}
import { scrubXpoPleasantries } from "../core/sparringPartnerTone.ts";

const COACH_WORKFLOW_TAIL_PATTERNS = [
  /\s*if this lands,\s*i can draft (?:it|that|this)(?: now)?\s*[-,]?\s*or we can tweak (?:it|the angle) first\.?\s*/i,
  /\s*say the word and i'll draft (?:it|that|this)(?:,?\s*or tell me what to tweak)?\.?\s*/i,
  /\s*want me to draft (?:it|that|this)(?: as-is)?(?: now)?(?:,?\s*or tweak (?:the angle|it) first)?\?\s*/i,
  /\s*or we can tweak (?:it|the angle) first\.?\s*/i,
];

function normalizeCoachWhitespace(value: string): string {
  return value
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+/g, " ")
    .trim();
}

function stripCoachWorkflowTail(response: string): string {
  let nextResponse = response.trim();

  for (const pattern of COACH_WORKFLOW_TAIL_PATTERNS) {
    nextResponse = nextResponse.replace(pattern, "");
  }

  return nextResponse.trim();
}

function stripQuestionPrefix(question: string): string {
  return question.replace(/^(?:quick check|one more thing)\s*:\s*/i, "").trim();
}

function normalizeCoachQuestion(question: string | null): string | null {
  if (!question) {
    return null;
  }

  const stripped = normalizeCoachWhitespace(stripQuestionPrefix(question));
  if (!stripped) {
    return null;
  }

  return /[?]$/.test(stripped) ? stripped : `${stripped}?`;
}

function removeTrailingQuestions(response: string): string {
  let nextResponse = response.trim();

  while (/\?/.test(nextResponse)) {
    const stripped = nextResponse.replace(/\s*[^.?!]*\?\s*$/i, "").trim();
    if (!stripped || stripped === nextResponse) {
      break;
    }
    nextResponse = stripped;
  }

  return nextResponse.trim();
}

export function finalizeCoachReplyForSurface(
  reply: CoachReplyShape,
): CoachReplyShape {
  const probingQuestion = normalizeCoachQuestion(reply.probingQuestion);
  let response = normalizeCoachWhitespace(reply.response);
  response = stripCoachWorkflowTail(response);

  if (probingQuestion) {
    const baseResponse = removeTrailingQuestions(response);
    if (baseResponse) {
      const punctuatedBase = /[.?!]$/.test(baseResponse)
        ? baseResponse
        : `${baseResponse}.`;
      response = `${punctuatedBase} ${probingQuestion}`;
    } else {
      response = probingQuestion;
    }
  }

  response = normalizeCoachWhitespace(response);
  response = scrubXpoPleasantries(response) || response;

  return {
    response: response || probingQuestion || reply.response.trim(),
    probingQuestion,
  };
}
