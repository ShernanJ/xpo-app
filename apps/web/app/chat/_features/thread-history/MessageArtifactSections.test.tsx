import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import { AssistantResultFooter, MessageArtifactSections } from "./MessageArtifactSections";

test("angle picks use the durable ideation format hint instead of parsing reply copy", async () => {
  const user = userEvent.setup();
  const onAngleSelect = vi.fn();

  render(
    <MessageArtifactSections
      message={{
        id: "assistant-1",
        role: "assistant",
        content: "here are a few directions.",
        outputShape: "ideation_angles",
        angles: [{ title: "The hiring metric that keeps lean teams fast" }],
        ideationFormatHint: "thread",
        feedbackValue: null,
      }}
      index={0}
      messagesLength={1}
      composerCharacterLimit={280}
      isVerifiedAccount={false}
      isMainChatLocked={false}
      showDevTools={false}
      selectedDraftMessageId={null}
      selectedDraftVersionId={null}
      selectedThreadPreviewPostIndex={undefined}
      expandedInlineThreadPreviewId={null}
      copiedPreviewDraftMessageId={null}
      dismissedAutoSavedSource={false}
      autoSavedSourceUndoPending={false}
      messageFeedbackPending={false}
      canRunReplyActions={true}
      contextIdentity={{
        username: "vitddnv",
        displayName: "Vitalii Dodonov",
        avatarUrl: null,
      }}
      getRevealClassName={() => ""}
      shouldAnimateRevealLines={() => false}
      shouldShowQuickReplies={() => false}
      shouldShowOptionArtifacts={() => true}
      shouldShowDraftOutput={() => false}
      onOpenSourceMaterialEditor={() => {}}
      onUndoAutoSavedSourceMaterials={() => {}}
      onSubmitAssistantMessageFeedback={() => {}}
      onOpenScopedFeedback={() => {}}
      onQuickReplySelect={() => {}}
      onAngleSelect={onAngleSelect}
      onReplyOptionSelect={() => {}}
      onSelectDraftBundleOption={() => {}}
      onOpenDraftEditor={() => {}}
      onRequestDraftCardRevision={() => {}}
      onToggleExpandedInlineThreadPreview={() => {}}
      onCopyPreviewDraft={() => {}}
      onShareDraftEditor={() => {}}
    />,
  );

  await user.click(
    screen.getByRole("button", {
      name: /The hiring metric that keeps lean teams fast/i,
    }),
  );

  expect(onAngleSelect).toHaveBeenCalledWith(
    "The hiring metric that keeps lean teams fast",
    "thread",
  );
});

test("selected draft direction renders highlighted and disables the ideation options", () => {
  render(
    <MessageArtifactSections
      message={{
        id: "assistant-1",
        role: "assistant",
        content: "here are a few directions.",
        outputShape: "ideation_angles",
        angles: [
          { title: "The hiring metric that keeps lean teams fast" },
          { title: "The leadership lesson behind smaller teams" },
        ],
        ideationFormatHint: "post",
        feedbackValue: null,
      }}
      index={0}
      messagesLength={1}
      selectedIdeationAngleTitle="The leadership lesson behind smaller teams"
      composerCharacterLimit={280}
      isVerifiedAccount={false}
      isMainChatLocked={false}
      showDevTools={false}
      selectedDraftMessageId={null}
      selectedDraftVersionId={null}
      selectedThreadPreviewPostIndex={undefined}
      expandedInlineThreadPreviewId={null}
      copiedPreviewDraftMessageId={null}
      dismissedAutoSavedSource={false}
      autoSavedSourceUndoPending={false}
      messageFeedbackPending={false}
      canRunReplyActions={true}
      contextIdentity={{
        username: "vitddnv",
        displayName: "Vitalii Dodonov",
        avatarUrl: null,
      }}
      getRevealClassName={() => ""}
      shouldAnimateRevealLines={() => false}
      shouldShowQuickReplies={() => false}
      shouldShowOptionArtifacts={() => true}
      shouldShowDraftOutput={() => false}
      onOpenSourceMaterialEditor={() => {}}
      onUndoAutoSavedSourceMaterials={() => {}}
      onSubmitAssistantMessageFeedback={() => {}}
      onOpenScopedFeedback={() => {}}
      onQuickReplySelect={() => {}}
      onAngleSelect={() => {}}
      onReplyOptionSelect={() => {}}
      onSelectDraftBundleOption={() => {}}
      onOpenDraftEditor={() => {}}
      onRequestDraftCardRevision={() => {}}
      onToggleExpandedInlineThreadPreview={() => {}}
      onCopyPreviewDraft={() => {}}
      onShareDraftEditor={() => {}}
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
  expect(selectedOption.className).toContain("bg-white/[0.07]");
  expect(unselectedOption).toBeDisabled();
  expect(unselectedOption).toHaveAttribute("aria-pressed", "false");
  expect(unselectedOption.className).toContain("opacity-60");
});

test("primary ideation angle chips replace the duplicate angle list", async () => {
  const user = userEvent.setup();
  const onQuickReplySelect = vi.fn();
  const onAngleSelect = vi.fn();

  render(
    <>
      <MessageArtifactSections
        message={{
          id: "assistant-1",
          role: "assistant",
          content: "i pulled three post directions.\n\npick one and i'll draft it.",
          outputShape: "ideation_angles",
          angles: [{ title: "The hiring filter that kept our team lean" }],
          quickReplies: [
            {
              kind: "ideation_angle",
              value: "The hiring filter that kept our team lean",
              label: "The hiring filter that kept our team lean",
              angle: "The hiring filter that kept our team lean",
              formatHint: "post",
            },
          ],
          ideationFormatHint: "post",
          feedbackValue: null,
        }}
        index={0}
        messagesLength={1}
        composerCharacterLimit={280}
        isVerifiedAccount={false}
        isMainChatLocked={false}
        showDevTools={false}
        selectedDraftMessageId={null}
        selectedDraftVersionId={null}
        selectedThreadPreviewPostIndex={undefined}
        expandedInlineThreadPreviewId={null}
        copiedPreviewDraftMessageId={null}
        dismissedAutoSavedSource={false}
        autoSavedSourceUndoPending={false}
        messageFeedbackPending={false}
        canRunReplyActions={true}
        contextIdentity={{
          username: "vitddnv",
          displayName: "Vitalii Dodonov",
          avatarUrl: null,
        }}
        getRevealClassName={() => ""}
        shouldAnimateRevealLines={() => false}
        shouldShowQuickReplies={() => true}
        shouldShowOptionArtifacts={() => true}
        shouldShowDraftOutput={() => false}
        onOpenSourceMaterialEditor={() => {}}
        onUndoAutoSavedSourceMaterials={() => {}}
        onSubmitAssistantMessageFeedback={() => {}}
        onOpenScopedFeedback={() => {}}
        onQuickReplySelect={onQuickReplySelect}
        onAngleSelect={onAngleSelect}
        onReplyOptionSelect={() => {}}
        onSelectDraftBundleOption={() => {}}
        onOpenDraftEditor={() => {}}
        onRequestDraftCardRevision={() => {}}
        onToggleExpandedInlineThreadPreview={() => {}}
        onCopyPreviewDraft={() => {}}
        onShareDraftEditor={() => {}}
      />
      <AssistantResultFooter
        message={{
          id: "assistant-1",
          role: "assistant",
          content: "i pulled three post directions.\n\npick one and i'll draft it.",
          outputShape: "ideation_angles",
          quickReplies: [
            {
              kind: "ideation_angle",
              value: "The hiring filter that kept our team lean",
              label: "The hiring filter that kept our team lean",
              angle: "The hiring filter that kept our team lean",
              formatHint: "post",
            },
          ],
          angles: [{ title: "The hiring filter that kept our team lean" }],
          feedbackValue: null,
        }}
        isLatestMessage={true}
        isMainChatLocked={false}
        messageFeedbackPending={false}
        canRunReplyActions={true}
        shouldShowQuickReplies={() => true}
        onSubmitAssistantMessageFeedback={() => {}}
        onOpenScopedFeedback={() => {}}
        onQuickReplySelect={onQuickReplySelect}
      />
    </>,
  );

  await user.click(
    screen.getByRole("button", {
      name: /The hiring filter that kept our team lean/i,
    }),
  );

  expect(onQuickReplySelect).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "ideation_angle",
      angle: "The hiring filter that kept our team lean",
    }),
  );
  expect(onAngleSelect).not.toHaveBeenCalled();
  expect(screen.queryByText("1.")).not.toBeInTheDocument();
});

test("generated result messages keep footer controls out of the artifact section", () => {
  render(
    <MessageArtifactSections
      message={{
        id: "assistant-1",
        role: "assistant",
        content: "here is your profile analysis.",
        outputShape: "profile_analysis",
        quickReplies: [{ kind: "planner_action", value: "rewrite bio", label: "Rewrite bio" }],
        feedbackValue: null,
        profileAnalysisArtifact: {
          kind: "profile_analysis",
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
          pinnedPost: null,
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
              status: "warn",
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
              status: "pass",
              score: 80,
              summary: "Banner supports the positioning.",
              findings: [],
              hasHeaderImage: false,
              headerImageUrl: null,
              headerClarity: null,
              headerClarityResolved: true,
            },
            pinnedTweetCheck: {
              status: "pass",
              score: 80,
              summary: "Pinned post is a strong authority asset.",
              findings: [],
              pinnedPost: null,
              category: "authority_asset",
              ageDays: 10,
              isStale: false,
              promptSuggestions: {
                originStory: "origin",
                coreThesis: "core",
              },
            },
          },
          bannerAnalysis: null,
        },
      }}
      index={0}
      messagesLength={1}
      composerCharacterLimit={280}
      isVerifiedAccount={false}
      isMainChatLocked={false}
      showDevTools={false}
      selectedDraftMessageId={null}
      selectedDraftVersionId={null}
      selectedThreadPreviewPostIndex={undefined}
      expandedInlineThreadPreviewId={null}
      copiedPreviewDraftMessageId={null}
      dismissedAutoSavedSource={false}
      autoSavedSourceUndoPending={false}
      messageFeedbackPending={false}
      canRunReplyActions={true}
      contextIdentity={{
        username: "vitddnv",
        displayName: "Vitalii Dodonov",
        avatarUrl: null,
      }}
      getRevealClassName={() => ""}
      shouldAnimateRevealLines={() => false}
      shouldShowQuickReplies={() => true}
      shouldShowOptionArtifacts={() => false}
      shouldShowDraftOutput={() => false}
      onOpenSourceMaterialEditor={() => {}}
      onUndoAutoSavedSourceMaterials={() => {}}
      onSubmitAssistantMessageFeedback={() => {}}
      onOpenScopedFeedback={() => {}}
      onQuickReplySelect={() => {}}
      onAngleSelect={() => {}}
      onReplyOptionSelect={() => {}}
      onSelectDraftBundleOption={() => {}}
      onOpenDraftEditor={() => {}}
      onRequestDraftCardRevision={() => {}}
      onToggleExpandedInlineThreadPreview={() => {}}
      onCopyPreviewDraft={() => {}}
      onShareDraftEditor={() => {}}
    />,
  );

  expect(screen.queryByLabelText("Thumbs up")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /rewrite bio/i })).not.toBeInTheDocument();
  expect(screen.getByText("Conversion Score")).toBeInTheDocument();
});

test("report action opens scoped feedback for assistant messages", async () => {
  const user = userEvent.setup();
  const onOpenScopedFeedback = vi.fn();

  render(
    <MessageArtifactSections
      message={{
        id: "assistant-1",
        role: "assistant",
        content: "This answer missed the point.",
        outputShape: "coach_question",
        feedbackValue: null,
      }}
      index={0}
      messagesLength={1}
      composerCharacterLimit={280}
      isVerifiedAccount={false}
      isMainChatLocked={false}
      showDevTools={false}
      selectedDraftMessageId={null}
      selectedDraftVersionId={null}
      selectedThreadPreviewPostIndex={undefined}
      expandedInlineThreadPreviewId={null}
      copiedPreviewDraftMessageId={null}
      dismissedAutoSavedSource={false}
      autoSavedSourceUndoPending={false}
      messageFeedbackPending={false}
      canRunReplyActions={true}
      contextIdentity={{
        username: "vitddnv",
        displayName: "Vitalii Dodonov",
        avatarUrl: null,
      }}
      getRevealClassName={() => ""}
      shouldAnimateRevealLines={() => false}
      shouldShowQuickReplies={() => false}
      shouldShowOptionArtifacts={() => false}
      shouldShowDraftOutput={() => false}
      onOpenSourceMaterialEditor={() => {}}
      onUndoAutoSavedSourceMaterials={() => {}}
      onSubmitAssistantMessageFeedback={() => {}}
      onOpenScopedFeedback={onOpenScopedFeedback}
      onQuickReplySelect={() => {}}
      onAngleSelect={() => {}}
      onReplyOptionSelect={() => {}}
      onSelectDraftBundleOption={() => {}}
      onOpenDraftEditor={() => {}}
      onRequestDraftCardRevision={() => {}}
      onToggleExpandedInlineThreadPreview={() => {}}
      onCopyPreviewDraft={() => {}}
      onShareDraftEditor={() => {}}
    />,
  );

  await user.click(screen.getByRole("button", { name: /report response/i }));

  expect(onOpenScopedFeedback).toHaveBeenCalledTimes(1);
});
