import { act, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import {
  buildPendingStatusPlan,
  completeAgentProgressRun,
  createAgentProgressRun,
} from "../composer/pendingStatus";
import { ChatMessageStream, type ChatMessageStreamMessage } from "./ChatMessageStream";

function createArtifactSectionProps() {
  return {
    composerCharacterLimit: 280,
    isVerifiedAccount: false,
    isMainChatLocked: false,
    showDevTools: false,
    selectedDraftMessageId: null,
    selectedDraftVersionId: null,
    selectedThreadPreviewPostIndex: undefined,
    expandedInlineThreadPreviewId: null,
    copiedPreviewDraftMessageId: null,
    dismissedAutoSavedSource: false,
    autoSavedSourceUndoPending: false,
    messageFeedbackPending: false,
    canRunReplyActions: true,
    contextIdentity: {
      username: "stan",
      displayName: "Stan",
      avatarUrl: null,
    },
    shouldShowQuickReplies: () => false,
    shouldShowOptionArtifacts: () => false,
    shouldShowDraftOutput: () => false,
    onOpenSourceMaterialEditor: () => {},
    onUndoAutoSavedSourceMaterials: () => {},
    onSubmitAssistantMessageFeedback: () => {},
    onQuickReplySelect: () => {},
    onAngleSelect: () => {},
    onReplyOptionSelect: () => {},
    onSelectDraftBundleOption: () => {},
    onOpenDraftEditor: () => {},
    onRequestDraftCardRevision: () => {},
    onToggleExpandedInlineThreadPreview: () => {},
    onCopyPreviewDraft: () => {},
    onShareDraftEditor: () => {},
  };
}

test("shows active progress inline and keeps the completed summary on the assistant message", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-16T12:00:10.000Z"));
  const activeProgress = createAgentProgressRun({
    plan: buildPendingStatusPlan({
      message: "draft a post about retention",
      turnSource: "free_text",
    }),
    startedAtMs: new Date("2026-03-16T12:00:00.000Z").getTime(),
  });

  const { rerender } = render(
    <ChatMessageStream<ChatMessageStreamMessage>
      messages={[]}
      latestAssistantMessageId={null}
      typedAssistantLengths={{}}
      registerMessageRef={() => {}}
      activeDraftRevealByMessageId={{}}
      activeAgentProgress={activeProgress}
      resolveArtifactSectionProps={() => createArtifactSectionProps()}
    />,
  );

  expect(screen.getByText("Understanding the request")).toBeInTheDocument();
  expect(screen.getByText("0:10")).toBeInTheDocument();

  const completedProgress = completeAgentProgressRun(
    activeProgress,
    "completed",
    new Date("2026-03-16T12:00:10.000Z").getTime(),
  );

  rerender(
    <ChatMessageStream<ChatMessageStreamMessage & { agentProgress?: typeof completedProgress }>
      messages={[
        {
          id: "assistant-1",
          role: "assistant",
          content: "Here is a tighter draft you can post.",
          feedbackValue: null,
          agentProgress: completedProgress,
        },
      ]}
      latestAssistantMessageId="assistant-1"
      typedAssistantLengths={{ "assistant-1": "Here is a tighter draft you can post.".length }}
      registerMessageRef={() => {}}
      activeDraftRevealByMessageId={{}}
      activeAgentProgress={null}
      resolveArtifactSectionProps={() => createArtifactSectionProps()}
    />,
  );

  expect(screen.getByRole("button", { name: /Thought for 10s/i })).toBeInTheDocument();
  expect(screen.getByText("Here is a tighter draft you can post.")).toBeInTheDocument();

  act(() => {
    screen.getByRole("button", { name: /Thought for 10s/i }).click();
  });

  expect(screen.getByText("Drafting the post")).toBeInTheDocument();

  vi.useRealTimers();
});
