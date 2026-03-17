import { expect, test } from "vitest";

import { resolveCurrentChatDraft } from "@/lib/content/contentHub";

function buildArtifact(args: {
  id: string;
  title: string;
  content: string;
}) {
  return {
    id: args.id,
    title: args.title,
    kind: "short_form_post" as const,
    content: args.content,
    posts: [
      {
        id: `${args.id}-post`,
        content: args.content,
        weightedCharacterCount: args.content.length,
        maxCharacterLimit: 280,
        isWithinXLimit: true,
      },
    ],
    characterCount: args.content.length,
    weightedCharacterCount: args.content.length,
    maxCharacterLimit: 280,
    isWithinXLimit: true,
    supportAsset: null,
    groundingSources: [],
    groundingMode: null,
    groundingExplanation: null,
    betterClosers: [],
    replyPlan: [],
    voiceTarget: null,
    noveltyNotes: [],
    threadFramingStyle: null,
  };
}

test("resolveCurrentChatDraft follows the persisted active bundle version", () => {
  const firstArtifact = buildArtifact({
    id: "artifact-1",
    title: "First option",
    content: "Option one copy",
  });
  const secondArtifact = buildArtifact({
    id: "artifact-2",
    title: "Second option",
    content: "Option two copy",
  });

  const resolved = resolveCurrentChatDraft({
    outputShape: "short_form_post",
    activeDraftVersionId: "version-2",
    revisionChainId: "revision-chain-1",
    previousVersionSnapshot: {
      versionId: "version-1",
      revisionChainId: "revision-chain-1",
    },
    draftVersions: [
      {
        id: "version-1",
        basedOnVersionId: null,
        artifact: firstArtifact,
      },
      {
        id: "version-2",
        basedOnVersionId: "version-1",
        artifact: secondArtifact,
      },
    ],
    draftBundle: {
      selectedOptionId: "bundle-2",
      options: [
        {
          id: "bundle-1",
          label: "Option one",
          versionId: "version-1",
          artifact: firstArtifact,
        },
        {
          id: "bundle-2",
          label: "Option two",
          versionId: "version-2",
          artifact: secondArtifact,
        },
      ],
    },
    draftArtifacts: [firstArtifact, secondArtifact],
  });

  expect(resolved).toEqual({
    title: "Option two",
    outputShape: "short_form_post",
    artifact: secondArtifact,
    voiceTarget: null,
    noveltyNotes: [],
    draftVersionId: "version-2",
    basedOnVersionId: "version-1",
    revisionChainId: "revision-chain-1",
  });
});

test("resolveCurrentChatDraft falls back to the single persisted draft artifact", () => {
  const artifact = buildArtifact({
    id: "artifact-single",
    title: "Saved thread",
    content: "A saved current post",
  });

  const resolved = resolveCurrentChatDraft({
    outputShape: "short_form_post",
    draftArtifacts: [artifact],
    previousVersionSnapshot: {
      versionId: "version-base",
      revisionChainId: "revision-chain-9",
    },
  });

  expect(resolved).toEqual({
    title: "Saved thread",
    outputShape: "short_form_post",
    artifact,
    voiceTarget: null,
    noveltyNotes: [],
    draftVersionId: null,
    basedOnVersionId: "version-base",
    revisionChainId: "revision-chain-9",
  });
});
