import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import {
  buildPendingStatusPlan,
  completeAgentProgressRun,
  createAgentProgressRun,
} from "../composer/pendingStatus";
import { ChatMessageStream, type ChatMessageStreamMessage } from "./ChatMessageStream";

function createArtifactSectionProps(overrides = {}) {
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
    onOpenScopedFeedback: () => {},
    onQuickReplySelect: () => {},
    onAngleSelect: () => {},
    onReplyOptionSelect: () => {},
    onSelectDraftBundleOption: () => {},
    onOpenDraftEditor: () => {},
    onRequestDraftCardRevision: () => {},
    onToggleExpandedInlineThreadPreview: () => {},
    onCopyPreviewDraft: () => {},
    onShareDraftEditor: () => {},
    ...overrides,
  };
}

function createStreamProps(overrides = {}) {
  return {
    latestAssistantMessageId: null,
    typedAssistantLengths: {},
    copiedUserMessageId: null,
    editingUserMessageId: null,
    registerMessageRef: () => {},
    activeDraftRevealByMessageId: {},
    activeAgentProgress: null,
    onCopyUserMessage: () => {},
    onEditUserMessage: () => {},
    resolveArtifactSectionProps: () => createArtifactSectionProps(),
    ...overrides,
  };
}

function createProfileAnalysisArtifact() {
  return {
    kind: "profile_analysis" as const,
    profile: {
      username: "vitddnv",
      name: "Vitalii Dodonov",
      bio: "Scaling Stan in public.",
      avatarUrl: null,
      headerImageUrl: null,
      isVerified: true,
      followersCount: 7927,
      followingCount: 482,
      createdAt: "2015-09-01T00:00:00.000Z",
    },
    pinnedPost: {
      id: "pin-1",
      text: "Pinned proof post.",
      createdAt: "2026-01-11T00:00:00.000Z",
      metrics: {
        likeCount: 10,
        replyCount: 2,
        repostCount: 1,
        quoteCount: 0,
      },
      url: "https://x.com/vitddnv/status/1",
    },
    audit: {
      score: 86,
      headline: "Profile conversion is mostly aligned with startups and growth through built.",
      fingerprint: "fp-1",
      shouldAutoOpen: true,
      steps: [],
      strengths: [],
      gaps: [],
      unknowns: [],
      bioFormulaCheck: {
        status: "warn" as const,
        score: 70,
        summary: "Bio needs a tighter hook.",
        findings: [],
        bio: "Scaling Stan in public.",
        charCount: 23,
        matchesFormula: {
          what: true,
          who: false,
          proofOrCta: false,
        },
        alternatives: [],
      },
      visualRealEstateCheck: {
        status: "pass" as const,
        score: 80,
        summary: "Banner supports the positioning.",
        findings: [],
        hasHeaderImage: false,
        headerImageUrl: null,
        headerClarity: null,
        headerClarityResolved: true,
      },
      pinnedTweetCheck: {
        status: "pass" as const,
        score: 80,
        summary: "Pinned post is a strong authority asset.",
        findings: [],
        pinnedPost: {
          id: "pin-1",
          text: "Pinned proof post.",
          createdAt: "2026-01-11T00:00:00.000Z",
          metrics: {
            likeCount: 10,
            replyCount: 2,
            repostCount: 1,
            quoteCount: 0,
          },
          url: "https://x.com/vitddnv/status/1",
        },
        category: "authority_asset" as const,
        ageDays: 10,
        isStale: false,
        promptSuggestions: {
          originStory: "origin",
          coreThesis: "core",
        },
      },
    },
    bannerAnalysis: null,
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
      {...createStreamProps({
        activeAgentProgress: activeProgress,
      })}
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
      {...createStreamProps({
        latestAssistantMessageId: "assistant-1",
        typedAssistantLengths: {
          "assistant-1": "Here is a tighter draft you can post.".length,
        },
      })}
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

test("renders the profile analysis preview before the markdown analysis body", () => {
  render(
    <ChatMessageStream<ChatMessageStreamMessage>
      messages={[
        {
          id: "assistant-1",
          role: "assistant",
          content: "## Profile Snapshot\n\nThis analysis should render after the preview card.",
          feedbackValue: null,
          profileAnalysisArtifact: createProfileAnalysisArtifact(),
        },
      ]}
      {...createStreamProps({
        latestAssistantMessageId: "assistant-1",
        typedAssistantLengths: {
          "assistant-1":
            "## Profile Snapshot\n\nThis analysis should render after the preview card.".length,
        },
      })}
    />,
  );

  const previewLabel = screen.getByText("Vitalii Dodonov");
  const analysisHeading = screen.getByRole("heading", { name: "Profile Snapshot" });

  expect(
    previewLabel.compareDocumentPosition(analysisHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

test("renders result feedback and follow-up chips after the full result body", () => {
  render(
    <ChatMessageStream<ChatMessageStreamMessage>
      messages={[
        {
          id: "assistant-1",
          role: "assistant",
          content: "## Profile Snapshot\n\nThis analysis should render before the footer.",
          feedbackValue: null,
          outputShape: "profile_analysis",
          quickReplies: [
            {
              kind: "planner_action",
              value: "rewrite my bio",
              label: "Rewrite bio",
            },
          ],
          profileAnalysisArtifact: createProfileAnalysisArtifact(),
        },
      ]}
      {...createStreamProps({
        latestAssistantMessageId: "assistant-1",
        typedAssistantLengths: {
          "assistant-1":
            "## Profile Snapshot\n\nThis analysis should render before the footer.".length,
        },
        resolveArtifactSectionProps: () =>
          createArtifactSectionProps({
            shouldShowQuickReplies: () => true,
          }),
      })}
    />,
  );

  const analysisHeading = screen.getByRole("heading", { name: "Profile Snapshot" });
  const thumbsUp = screen.getByLabelText("Thumbs up");
  const reportButton = screen.getByRole("button", { name: /report response/i });
  const followUpChip = screen.getByRole("button", { name: /rewrite bio/i });

  expect(
    analysisHeading.compareDocumentPosition(thumbsUp) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    thumbsUp.compareDocumentPosition(reportButton) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    reportButton.compareDocumentPosition(followUpChip) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

test("locks and highlights the selected ideation direction once the quoted pick is appended", () => {
  render(
    <ChatMessageStream<ChatMessageStreamMessage>
      messages={[
        {
          id: "assistant-1",
          role: "assistant",
          content: "Here are a few directions.",
          outputShape: "ideation_angles",
          angles: [
            { title: "The hiring metric that keeps lean teams fast" },
            { title: "The leadership lesson behind smaller teams" },
          ],
          ideationFormatHint: "post",
          feedbackValue: null,
        },
        {
          id: "user-1",
          role: "user",
          content: "> The leadership lesson behind smaller teams",
        },
      ]}
      {...createStreamProps({
        latestAssistantMessageId: "assistant-1",
        typedAssistantLengths: { "assistant-1": "Here are a few directions.".length },
        resolveArtifactSectionProps: () =>
          createArtifactSectionProps({
            shouldShowOptionArtifacts: () => true,
          }),
      })}
    />,
  );

  const selectedOption = screen.getByRole("button", {
    name: /The leadership lesson behind smaller teams/i,
  });
  const unselectedOption = screen.getByRole("button", {
    name: /The hiring metric that keeps lean teams fast/i,
  });

  expect(selectedOption).toBeDisabled();
  expect(selectedOption).toHaveAttribute("aria-pressed", "true");
  expect(unselectedOption).toBeDisabled();
  expect(unselectedOption).toHaveAttribute("aria-pressed", "false");
});

test("renders copy and edit controls for user messages", async () => {
  const user = userEvent.setup();
  const onCopyUserMessage = vi.fn();
  const onEditUserMessage = vi.fn();

  render(
    <ChatMessageStream<ChatMessageStreamMessage>
      messages={[
        {
          id: "user-1",
          role: "user",
          content: "Tighten this opener",
        },
      ]}
      {...createStreamProps({
        onCopyUserMessage,
        onEditUserMessage,
      })}
    />,
  );

  await user.click(screen.getByLabelText("Copy message"));
  await user.click(screen.getByLabelText("Edit message"));

  expect(onCopyUserMessage).toHaveBeenCalledWith("user-1", "Tighten this opener");
  expect(onEditUserMessage).toHaveBeenCalledWith("user-1", "Tighten this opener");
});
