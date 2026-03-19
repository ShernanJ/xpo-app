import type {
  ExtensionReplyTone,
  ReplyDraftPreflightResult,
} from "../extension/types.ts";

import type { ReplySourceContext } from "./types.ts";

export interface ReplySourceMode {
  isPlayful: boolean;
  shouldContinueMetaphor: boolean;
}

function computeHeuristicReplySourceMode(sourceContext: ReplySourceContext): ReplySourceMode {
  const primaryText = sourceContext.primaryPost.text.trim().toLowerCase();
  const combinedText = [sourceContext.primaryPost.text, sourceContext.quotedPost?.text || ""]
    .join("\n")
    .toLowerCase();
  const hasQuotedPunchline = /["“][^"”]{6,}["”]/.test(sourceContext.primaryPost.text);
  const hasAnalogy =
    /\b(like|as if|feels like|market themselves like|basically)\b/.test(primaryText);
  const hasCasualJokeSignal =
    /\b(lwk|lol|lmao|lmfao|haha|roast|meme|bit|joke|funny|drop out|dropped out of)\b/.test(
      combinedText,
    );
  const hasPlayfulConstruction =
    /\bshould market\b/.test(primaryText) || /\bdesigned to be\b/.test(primaryText);

  const isPlayful =
    (hasQuotedPunchline && hasAnalogy) || hasCasualJokeSignal || (hasAnalogy && hasPlayfulConstruction);

  return {
    isPlayful,
    shouldContinueMetaphor: isPlayful && hasAnalogy,
  };
}

export function inferReplySourceMode(args: {
  sourceContext: ReplySourceContext;
  preflightResult?: ReplyDraftPreflightResult | null;
}): ReplySourceMode {
  const heuristicMode = computeHeuristicReplySourceMode(args.sourceContext);
  const primaryText = args.sourceContext.primaryPost.text.trim().toLowerCase();
  const hasAnalogy =
    /\b(like|as if|feels like|market themselves like|basically)\b/.test(primaryText);

  if (!args.preflightResult) {
    return heuristicMode;
  }

  const isPlayful =
    args.preflightResult.recommended_reply_mode === "joke_riff" ||
    args.preflightResult.source_shape === "joke_setup";
  return {
    isPlayful,
    shouldContinueMetaphor: isPlayful && hasAnalogy,
  };
}

export function resolveReplyToneDirection(tone: ExtensionReplyTone) {
  switch (tone) {
    case "playful":
      return "Be witty, lean into the joke or meme, and keep it extremely casual. Do NOT give serious advice, operator frameworks, or over-explain the post.";
    case "dry":
      return "Be crisp, understated, and analytical.";
    case "warm":
      return "Be human and encouraging without sounding soft or generic.";
    case "bold":
      return "Be sharp and high-conviction without turning hostile.";
    case "builder":
    default:
      return "Sound like an experienced operator giving a practical next layer.";
  }
}
