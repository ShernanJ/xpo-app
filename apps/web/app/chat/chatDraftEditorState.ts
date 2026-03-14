import type { DraftArtifactDetails } from "../../lib/onboarding/draftArtifacts.ts";

type DraftArtifact = DraftArtifactDetails;

interface ThreadPostMutationResult {
  posts: string[];
  selectedIndex: number;
}

function getArtifactPosts(artifact: DraftArtifact | null | undefined): string[] {
  if (!artifact) {
    return [];
  }

  if (artifact.kind === "thread_seed" && Array.isArray(artifact.posts)) {
    return artifact.posts.map((post) => post.content);
  }

  return artifact.content ? [artifact.content] : [];
}

export function splitThreadContent(content: string): string[] {
  return content
    .split(/\n\s*---\s*\n/g)
    .map((post) => post.trim())
    .filter(Boolean);
}

export function joinThreadPosts(posts: string[]): string {
  return posts
    .map((post) => post.trim())
    .filter(Boolean)
    .join("\n\n---\n\n");
}

export function splitThreadPostAtBoundary(content: string): [string, string] | null {
  const normalized = content.trim();
  if (!normalized) {
    return null;
  }

  const paragraphParts = normalized.split(/\n{2,}/).filter(Boolean);
  if (paragraphParts.length > 1) {
    const pivot = Math.ceil(paragraphParts.length / 2);
    return [
      paragraphParts.slice(0, pivot).join("\n\n").trim(),
      paragraphParts.slice(pivot).join("\n\n").trim(),
    ];
  }

  const sentenceParts = normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentenceParts.length > 1) {
    const pivot = Math.ceil(sentenceParts.length / 2);
    return [
      sentenceParts.slice(0, pivot).join(" ").trim(),
      sentenceParts.slice(pivot).join(" ").trim(),
    ];
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length < 8) {
    return null;
  }

  const pivot = Math.ceil(words.length / 2);
  return [
    words.slice(0, pivot).join(" ").trim(),
    words.slice(pivot).join(" ").trim(),
  ];
}

export function buildEditableThreadPosts(
  artifact: DraftArtifact | null | undefined,
  content: string,
): string[] {
  const artifactPosts = getArtifactPosts(artifact)
    .map((post) => post.trim())
    .filter(Boolean);

  if (artifactPosts.length > 0) {
    return artifactPosts;
  }

  const contentPosts = splitThreadContent(content);
  if (contentPosts.length > 0) {
    return contentPosts;
  }

  const normalizedContent = content.trim();
  return normalizedContent ? [normalizedContent] : [""];
}

export function ensureEditableThreadPosts(posts: string[]): string[] {
  const normalized = posts.map((post) => post.replace(/\r\n/g, "\n"));
  return normalized.length > 0 ? normalized : [""];
}

export function clampThreadPostIndex(rawIndex: number, postCount: number): number {
  if (postCount <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(postCount - 1, rawIndex));
}

export function buildDraftEditorSerializedContent(args: {
  isThreadDraft: boolean;
  editorDraftPosts: string[];
  editorDraftText: string;
}): string {
  return args.isThreadDraft
    ? joinThreadPosts(
        ensureEditableThreadPosts(args.editorDraftPosts)
          .map((post) => post.trim())
          .filter(Boolean),
      )
    : args.editorDraftText;
}

export function buildDraftEditorHydrationState(args: {
  selectedDraftVersionId: string | null;
  isThreadDraft: boolean;
  artifact: DraftArtifact | null | undefined;
  content: string;
}): {
  editorDraftText: string;
  editorDraftPosts: string[];
} {
  if (!args.selectedDraftVersionId) {
    return {
      editorDraftText: "",
      editorDraftPosts: [],
    };
  }

  return {
    editorDraftText: args.content,
    editorDraftPosts: args.isThreadDraft
      ? ensureEditableThreadPosts(buildEditableThreadPosts(args.artifact, args.content))
      : [],
  };
}

export function moveThreadDraftPost(args: {
  posts: string[];
  index: number;
  direction: "up" | "down";
}): ThreadPostMutationResult | null {
  const targetIndex = args.direction === "up" ? args.index - 1 : args.index + 1;
  if (
    args.index < 0 ||
    args.index >= args.posts.length ||
    targetIndex < 0 ||
    targetIndex >= args.posts.length
  ) {
    return null;
  }

  const next = [...args.posts];
  const [movedPost] = next.splice(args.index, 1);
  next.splice(targetIndex, 0, movedPost);
  return {
    posts: next,
    selectedIndex: targetIndex,
  };
}

export function splitThreadDraftPost(args: {
  posts: string[];
  index: number;
}): ThreadPostMutationResult | null {
  const target = args.posts[args.index] ?? "";
  const split = splitThreadPostAtBoundary(target);
  if (!split) {
    return null;
  }

  const next = [...args.posts];
  next.splice(args.index, 1, split[0], split[1]);
  return {
    posts: next,
    selectedIndex: args.index,
  };
}

export function mergeThreadDraftPostDown(args: {
  posts: string[];
  index: number;
}): ThreadPostMutationResult | null {
  if (args.index < 0 || args.index >= args.posts.length - 1) {
    return null;
  }

  const currentPost = args.posts[args.index]?.trim() ?? "";
  const nextPost = args.posts[args.index + 1]?.trim() ?? "";
  const merged = [currentPost, nextPost].filter(Boolean).join("\n\n");
  const next = [...args.posts];
  next.splice(args.index, 2, merged);
  return {
    posts: ensureEditableThreadPosts(next),
    selectedIndex: args.index,
  };
}

export function addThreadDraftPost(args: {
  posts: string[];
  index?: number;
}): ThreadPostMutationResult {
  const next = [...args.posts];
  const insertionIndex =
    typeof args.index === "number" && Number.isFinite(args.index)
      ? Math.max(0, Math.min(next.length, args.index))
      : next.length;
  next.splice(insertionIndex, 0, "");
  return {
    posts: ensureEditableThreadPosts(next),
    selectedIndex: insertionIndex,
  };
}

export function removeThreadDraftPost(args: {
  posts: string[];
  index: number;
}): ThreadPostMutationResult {
  if (args.posts.length <= 1) {
    return {
      posts: [""],
      selectedIndex: 0,
    };
  }

  return {
    posts: ensureEditableThreadPosts(
      args.posts.filter((_, postIndex) => postIndex !== args.index),
    ),
    selectedIndex: Math.max(0, args.index - 1),
  };
}
