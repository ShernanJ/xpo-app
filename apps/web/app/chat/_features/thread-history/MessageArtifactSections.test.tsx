import { render, screen, within } from "@testing-library/react";
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

test("retry quick replies render as an icon action instead of a duplicate chip", async () => {
  const user = userEvent.setup();
  const onQuickReplySelect = vi.fn();

  render(
    <MessageArtifactSections
      message={{
        id: "assistant-retry-1",
        role: "assistant",
        content:
          "that draft came back malformed twice. want me to regenerate it cleanly with the same direction?",
        outputShape: "coach_question",
        quickReplies: [
          {
            kind: "retry_action",
            value: "retry",
            label: "Retry this draft",
            formatPreference: "thread",
          },
          {
            kind: "clarification_choice",
            value: "keep the same angle",
            label: "Keep same angle",
          },
        ],
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
      shouldShowOptionArtifacts={() => false}
      shouldShowDraftOutput={() => false}
      onOpenSourceMaterialEditor={() => {}}
      onUndoAutoSavedSourceMaterials={() => {}}
      onSubmitAssistantMessageFeedback={() => {}}
      onOpenScopedFeedback={() => {}}
      onQuickReplySelect={onQuickReplySelect}
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

  expect(screen.getByRole("button", { name: /Retry draft/i })).toBeInTheDocument();
  expect(screen.queryByText("Retry this draft")).not.toBeInTheDocument();
  expect(screen.getByText("Keep same angle")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /Retry draft/i }));

  expect(onQuickReplySelect).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "retry_action",
      value: "retry",
      formatPreference: "thread",
    }),
  );
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

test("reply candidates render the dedicated reply preview and use draft revisions for inline chips", async () => {
  const user = userEvent.setup();
  const onRequestDraftCardRevision = vi.fn();
  const onCopyPreviewDraft = vi.fn();

  render(
    <MessageArtifactSections
      message={{
        id: "assistant-reply-1",
        role: "assistant",
        content: "drafted one grounded reply from that post.",
        outputShape: "reply_candidate",
        draft: "holy that's the kind of detail that makes you double-check every brand asset.",
        drafts: [
          "holy that's the kind of detail that makes you double-check every brand asset.",
        ],
        draftArtifacts: [
          {
            id: "reply-artifact-1",
            title: "Reply draft",
            kind: "reply_candidate",
            content:
              "holy that's the kind of detail that makes you double-check every brand asset.",
            posts: [],
            characterCount: 73,
            weightedCharacterCount: 73,
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
            replySourcePreview: {
              postId: "2034751673290350617",
              sourceUrl: "https://x.com/elkelk/status/2034751673290350617",
              author: {
                displayName: "elkelk",
                username: "elkelk",
                avatarUrl: null,
                isVerified: false,
              },
              text: "Perfect algo pull",
              media: [],
              quotedPost: {
                postId: "quoted-1",
                sourceUrl: "https://x.com/thejustinguo/status/1",
                author: {
                  displayName: "Justin Guo",
                  username: "thejustinguo",
                  avatarUrl: null,
                  isVerified: false,
                },
                text: "founder mode but the screenshot is doing half the work",
                media: [],
              },
            },
          },
        ],
        draftVersions: [
          {
            id: "reply-version-1",
            content:
              "holy that's the kind of detail that makes you double-check every brand asset.",
            source: "assistant_generated",
            createdAt: "2026-03-19T10:00:00.000Z",
            basedOnVersionId: null,
            weightedCharacterCount: 73,
            maxCharacterLimit: 280,
            supportAsset: null,
          },
        ],
        activeDraftVersionId: "reply-version-1",
        feedbackValue: null,
        replyArtifacts: {
          kind: "reply_draft",
          sourceText: "Perfect algo pull",
          sourceUrl: "https://x.com/elkelk/status/2034751673290350617",
          authorHandle: "elkelk",
          replySourcePreview: {
            postId: "2034751673290350617",
            sourceUrl: "https://x.com/elkelk/status/2034751673290350617",
            author: {
              displayName: "elkelk",
              username: "elkelk",
              avatarUrl: null,
              isVerified: false,
            },
            text: "Perfect algo pull",
            media: [],
          },
          options: [
            {
              id: "safe",
              label: "safe",
              text: "holy that's the kind of detail that makes you double-check every brand asset.",
            },
          ],
          notes: [],
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
        username: "stan",
        displayName: "Stan",
        avatarUrl: null,
      }}
      getRevealClassName={() => ""}
      shouldAnimateRevealLines={() => false}
      shouldShowQuickReplies={() => false}
      shouldShowOptionArtifacts={() => false}
      shouldShowDraftOutput={() => true}
      onOpenSourceMaterialEditor={() => {}}
      onUndoAutoSavedSourceMaterials={() => {}}
      onSubmitAssistantMessageFeedback={() => {}}
      onOpenScopedFeedback={() => {}}
      onQuickReplySelect={() => {}}
      onAngleSelect={() => {}}
      onReplyOptionSelect={() => {}}
      onSelectDraftBundleOption={() => {}}
      onOpenDraftEditor={() => {}}
      onRequestDraftCardRevision={onRequestDraftCardRevision}
      onToggleExpandedInlineThreadPreview={() => {}}
      onCopyPreviewDraft={onCopyPreviewDraft}
      onShareDraftEditor={() => {}}
    />,
  );

  expect(screen.getByText("Replying to")).toBeVisible();
  expect(screen.getByRole("link", { name: "@elkelk" })).toHaveAttribute(
    "href",
    "https://x.com/elkelk/status/2034751673290350617",
  );
  const sourceToggle = screen.getByRole("button", {
    name: "Collapse source post preview",
  });
  expect(sourceToggle).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText("Perfect algo pull")).toBeVisible();
  expect(screen.queryByText("Reply Drafts")).toBeNull();

  await user.click(screen.getByRole("button", { name: "Make it bolder" }));

  expect(onRequestDraftCardRevision).toHaveBeenCalledWith("make it bolder");

  await user.click(screen.getByRole("button", { name: "Copy reply draft" }));

  expect(onCopyPreviewDraft).toHaveBeenCalledWith(
    "assistant-reply-1",
    "holy that's the kind of detail that makes you double-check every brand asset.",
  );
});

test("reply draft revisions collapse the inline source preview by default", () => {
  render(
    <MessageArtifactSections
      message={{
        id: "assistant-reply-revision-1",
        role: "assistant",
        content: "updated the reply and kept it grounded to the same post.",
        outputShape: "reply_candidate",
        draft: "this is a tighter revision of the reply.",
        drafts: ["this is a tighter revision of the reply."],
        draftArtifacts: [
          {
            id: "reply-artifact-revision-1",
            title: "Reply draft",
            kind: "reply_candidate",
            content: "this is a tighter revision of the reply.",
            posts: [],
            characterCount: 40,
            weightedCharacterCount: 40,
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
            replySourcePreview: {
              postId: "2034751673290350617",
              sourceUrl: "https://x.com/elkelk/status/2034751673290350617",
              author: {
                displayName: "elkelk",
                username: "elkelk",
                avatarUrl: null,
                isVerified: false,
              },
              text: "Perfect algo pull\nwith extra detail that should stay hidden initially",
              media: [],
            },
          },
        ],
        draftVersions: [
          {
            id: "reply-version-revision-1",
            content: "this is a tighter revision of the reply.",
            source: "assistant_revision",
            createdAt: "2026-03-20T10:00:00.000Z",
            basedOnVersionId: "reply-version-1",
            weightedCharacterCount: 40,
            maxCharacterLimit: 280,
            supportAsset: null,
          },
        ],
        activeDraftVersionId: "reply-version-revision-1",
        feedbackValue: null,
        replyArtifacts: {
          kind: "reply_draft",
          sourceText: "Perfect algo pull",
          sourceUrl: "https://x.com/elkelk/status/2034751673290350617",
          authorHandle: "elkelk",
          options: [
            {
              id: "rev-1",
              label: "rev-1",
              text: "this is a tighter revision of the reply.",
            },
          ],
          notes: [],
        },
        replyParse: {
          detected: true,
          confidence: "high",
          needsConfirmation: false,
          parseReason: "reply_draft_revised",
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
        username: "stan",
        displayName: "Stan",
        avatarUrl: null,
      }}
      getRevealClassName={() => ""}
      shouldAnimateRevealLines={() => false}
      shouldShowQuickReplies={() => false}
      shouldShowOptionArtifacts={() => false}
      shouldShowDraftOutput={() => true}
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

  expect(
    screen.getByRole("button", { name: "Expand source post preview" }),
  ).toHaveAttribute("aria-expanded", "false");
  expect(
    screen.queryByText("with extra detail that should stay hidden initially"),
  ).toBeNull();
});

test("reply candidates keep the legacy footer quick-reply rail hidden", () => {
  render(
    <AssistantResultFooter
      message={{
        id: "assistant-reply-footer",
        role: "assistant",
        content: "pushed the reply bolder without inventing anything.",
        outputShape: "reply_candidate",
        quickReplies: [
          {
            kind: "planner_action",
            value: "make it bolder",
            label: "Make it bolder",
          },
          {
            kind: "planner_action",
            value: "make it less harsh",
            label: "Less harsh",
          },
        ],
        feedbackValue: null,
      }}
      isLatestMessage={true}
      isMainChatLocked={false}
      messageFeedbackPending={false}
      canRunReplyActions={true}
      shouldShowQuickReplies={() => true}
      onSubmitAssistantMessageFeedback={() => {}}
      onOpenScopedFeedback={() => {}}
      onQuickReplySelect={() => {}}
    />,
  );

  expect(screen.queryByRole("button", { name: "Make it bolder" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Less harsh" })).toBeNull();
  expect(screen.getByLabelText("Thumbs up")).toBeVisible();
});
