import type { DraftFormatPreference } from "../../../../lib/agent-v2/contracts/chat";
import type { ChatArtifactContext } from "../../../../lib/agent-v2/contracts/turnContract";
import { isStandaloneXStatusUrl } from "../../../../lib/agent-v2/capabilities/reply/replyStatusUrl.ts";

import type {
  ComposerCommandId,
  SlashCommandDefinition,
} from "./composerTypes";

export interface ComposerCommandProfileContext {
  knownFor: string | null;
  targetAudience: string | null;
  primaryPillar: string | null;
  secondaryPillar: string | null;
  handle: string | null;
}

interface ComposerCommandRequest {
  prompt: string;
  intentOverride?:
    | "coach"
    | "ideate"
    | "plan"
    | "planner_feedback"
    | "draft"
    | "review"
    | "edit";
  formatPreferenceOverride?: DraftFormatPreference | null;
  artifactContext?: ChatArtifactContext | null;
}

export type ComposerCommandSubmitResult =
  | {
      status: "blocked";
      inlineNotice: string;
    }
  | {
      status: "ready";
      request: ComposerCommandRequest;
    };

const COMMAND_DEFINITIONS: readonly SlashCommandDefinition[] = [
  {
    id: "thread",
    command: "/thread",
    label: "/thread",
    description: "Draft a multi-post X thread in your voice.",
    modeLabel: "/thread",
  },
  {
    id: "idea",
    command: "/idea",
    label: "/idea",
    description: "Generate niche-matched post ideas before drafting.",
    modeLabel: "/idea",
  },
  {
    id: "post",
    command: "/post",
    label: "/post",
    description: "Draft a short-form post in your voice.",
    modeLabel: "/post",
  },
  {
    id: "draft",
    command: "/draft",
    label: "/draft",
    description: "Alias for /post when you want a ready-to-edit draft.",
    modeLabel: "/draft",
  },
  {
    id: "reply",
    command: "/reply",
    label: "/reply",
    description: "Paste a tweet or X link and get one grounded reply in your voice.",
    modeLabel: "/reply",
  },
] as const;

function isRandomCommandInput(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return !normalized || normalized === "random";
}

function buildThreadPrompt(input: string): string {
  if (isRandomCommandInput(input)) {
    return "give me a random thread i would use";
  }

  return `turn this topic into a thread in my voice: ${input.trim()}`;
}

function buildPostPrompt(input: string): string {
  if (isRandomCommandInput(input)) {
    return "give me a random post i would use";
  }

  return `turn this topic into a post in my voice: ${input.trim()}`;
}

function buildIdeaPrompt(input: string): string {
  if (isRandomCommandInput(input)) {
    return "give me 3 post ideas i would actually use in my niche";
  }

  return `give me 3 post ideas about this topic that fit my niche: ${input.trim()}`;
}

function isObviouslyTooShortReply(value: string): boolean {
  const normalized = value.trim().replace(/\s+/g, " ");
  const alphanumericCount = normalized.replace(/[^a-z0-9]/gi, "").length;
  const wordCount = normalized ? normalized.split(/\s+/).length : 0;
  return alphanumericCount < 12 && wordCount < 3;
}

export function getComposerSlashCommands(): SlashCommandDefinition[] {
  return [...COMMAND_DEFINITIONS];
}

export function getComposerSlashCommand(
  commandId: ComposerCommandId,
): SlashCommandDefinition {
  const match = COMMAND_DEFINITIONS.find((command) => command.id === commandId);
  if (!match) {
    return COMMAND_DEFINITIONS[0]!;
  }

  return match;
}

export function resolveComposerCommandModeLabel(
  commandId: ComposerCommandId,
): string {
  return getComposerSlashCommand(commandId).modeLabel;
}

export function buildComposerCommandPlaceholderPrompts(args: {
  commandId: ComposerCommandId;
  profile: ComposerCommandProfileContext;
}): string[] {
  const threadTopic =
    args.profile.primaryPillar || args.profile.knownFor || "one of my core topics";
  const postTopic =
    args.profile.knownFor || args.profile.primaryPillar || "my niche";
  const targetAudience = args.profile.targetAudience || "my audience";

  switch (args.commandId) {
    case "thread":
      return [
        `break down ${threadTopic} into 5 posts`,
        "turn one lesson from my recent posts into a thread",
        `write a contrarian thread for ${targetAudience}`,
        "make a thread that teaches my playbook step by step",
      ];
    case "idea":
      return [
        `give me 3 ideas about ${postTopic}`,
        `what should i post next about ${threadTopic}?`,
        `brainstorm angles for ${targetAudience}`,
      ];
    case "post":
    case "draft":
      return [
        `turn ${postTopic} into a post`,
        "draft a post from one of my recent lessons",
        `write a post for ${targetAudience}`,
      ];
    case "reply":
      return [
        "paste the tweet text or x link you want to reply to",
        "paste an x post link and i'll draft one grounded reply",
        "paste the post and i'll write a reply in your voice",
      ];
    default:
      return [];
  }
}

export function resolveComposerCommandImageNotice(
  commandId: ComposerCommandId,
): string {
  if (commandId === "reply") {
    return "Slash commands are text-only here. Remove the image and paste the tweet text or x link instead.";
  }

  return "Slash commands are text-only here. Remove the image and try again.";
}

export function resolveComposerCommandSubmitResult(args: {
  commandId: ComposerCommandId;
  input: string;
}): ComposerCommandSubmitResult {
  const trimmedInput = args.input.trim();

  switch (args.commandId) {
    case "thread":
      return {
        status: "ready",
        request: {
          prompt: buildThreadPrompt(trimmedInput),
          intentOverride: "draft",
          formatPreferenceOverride: "thread",
        },
      };
    case "post":
    case "draft":
      return {
        status: "ready",
        request: {
          prompt: buildPostPrompt(trimmedInput),
          intentOverride: "draft",
          formatPreferenceOverride: "shortform",
        },
      };
    case "idea":
      return {
        status: "ready",
        request: {
          prompt: buildIdeaPrompt(trimmedInput),
          intentOverride: "ideate",
        },
      };
    case "reply":
      if (!trimmedInput) {
        return {
          status: "blocked",
          inlineNotice: "Paste the tweet text or x link you want to reply to.",
        };
      }

      if (!isStandaloneXStatusUrl(trimmedInput) && isObviouslyTooShortReply(trimmedInput)) {
        return {
          status: "blocked",
          inlineNotice:
            "Paste a little more of the tweet so I have enough context to draft the reply.",
        };
      }

      return {
        status: "ready",
        request: {
          prompt: trimmedInput,
          artifactContext: {
            kind: "reply_request",
            responseMode: "direct_draft",
          },
        },
      };
    default:
      return {
        status: "blocked",
        inlineNotice: "That slash command is not available yet.",
      };
  }
}
