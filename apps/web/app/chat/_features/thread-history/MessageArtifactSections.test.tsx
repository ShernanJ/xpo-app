import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import { MessageArtifactSections } from "./MessageArtifactSections";

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
