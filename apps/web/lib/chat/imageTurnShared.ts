import type { CreatorChatQuickReply } from "@/lib/agent-v2/contracts/chat";
import type { ImageVisionContext } from "@/lib/creator/imagePostGeneration";

export function buildImagePostSupportAsset(
  visualContext: ImageVisionContext,
): string {
  const lines = [
    `Image anchor: ${visualContext.primary_subject} in ${visualContext.setting}.`,
    `Mood: ${visualContext.lighting_and_mood}.`,
    visualContext.any_readable_text
      ? `Readable text: ${visualContext.any_readable_text}.`
      : null,
    visualContext.key_details.length > 0
      ? `Key details: ${visualContext.key_details.slice(0, 4).join(", ")}.`
      : null,
  ].filter((line): line is string => Boolean(line));

  return lines.join("\n");
}

export function buildImageAssistantDescription(
  visualContext: ImageVisionContext,
): string {
  const readableTextLine = visualContext.any_readable_text.trim()
    ? ` I can also read "${visualContext.any_readable_text.trim()}".`
    : "";
  const detailLine =
    visualContext.key_details.length > 0
      ? ` A few details that stand out: ${visualContext.key_details
          .slice(0, 3)
          .join(", ")}.`
      : "";

  return `I see you sent an image of ${visualContext.primary_subject} in ${visualContext.setting}. The overall mood looks ${visualContext.lighting_and_mood}.${readableTextLine}${detailLine}\n\nDid you want to write a post on this image?`;
}

export function buildImageIdeationQuickReplies(args: {
  angles: readonly string[];
  supportAsset: string;
  imageAssetId?: string;
}): CreatorChatQuickReply[] {
  return args.angles
    .map((angle) => angle.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((angle) => ({
      kind: "ideation_angle" as const,
      value: angle,
      label: angle,
      angle,
      formatHint: "post" as const,
      supportAsset: args.supportAsset,
      ...(args.imageAssetId ? { imageAssetId: args.imageAssetId } : {}),
    }));
}

export function buildImagePostConfirmationQuickReplies(args: {
  imageAssetId: string;
}): CreatorChatQuickReply[] {
  return [
    {
      kind: "image_post_confirmation",
      value: "yes, write a post",
      label: "yes, write a post",
      decision: "confirm",
      imageAssetId: args.imageAssetId,
    },
    {
      kind: "image_post_confirmation",
      value: "not now",
      label: "not now",
      decision: "decline",
      imageAssetId: args.imageAssetId,
    },
  ];
}
