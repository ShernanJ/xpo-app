export type ChatRenderSurface =
  | "assistant_message"
  | "assistant_streaming_preview"
  | "feedback_preview"
  | "draft_artifact"
  | "thread_preview_post"
  | "draft_bundle_preview";

export type ChatRenderMode = "markdown" | "literal";

export function getChatRenderMode(surface: ChatRenderSurface): ChatRenderMode {
  switch (surface) {
    case "assistant_message":
    case "assistant_streaming_preview":
    case "feedback_preview":
      return "markdown";
    case "draft_artifact":
    case "thread_preview_post":
    case "draft_bundle_preview":
      return "literal";
    default: {
      const exhaustiveCheck: never = surface;
      return exhaustiveCheck;
    }
  }
}
