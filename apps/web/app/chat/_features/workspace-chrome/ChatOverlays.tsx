"use client";

import type { ComponentProps } from "react";

import { ProfileAnalysisDialog } from "../analysis/ProfileAnalysisDialog";
import { BillingDialogs } from "../billing/BillingDialogs";
import { DraftQueueModals } from "../draft-queue/DraftQueueModals";
import { FeedbackDialog } from "../feedback/FeedbackDialog";
import { GrowthGuideDialog } from "../growth-guide/GrowthGuideDialog";
import { PreferencesDialog } from "../preferences/PreferencesDialog";
import { SourceMaterialsDialog } from "../source-materials/SourceMaterialsDialog";
import { AddAccountDialog } from "./AddAccountDialog";
import { ExtensionDialog } from "./ExtensionDialog";
import { ThreadDeleteDialog } from "./ThreadDeleteDialog";

interface ChatOverlaysProps {
  draftQueueModalsProps: ComponentProps<typeof DraftQueueModals>;
  billingDialogsProps: ComponentProps<typeof BillingDialogs>;
  feedbackDialogProps: ComponentProps<typeof FeedbackDialog>;
  extensionDialogProps: ComponentProps<typeof ExtensionDialog>;
  sourceMaterialsDialogProps: ComponentProps<typeof SourceMaterialsDialog>;
  preferencesDialogProps: ComponentProps<typeof PreferencesDialog> | null;
  growthGuideDialogProps: ComponentProps<typeof GrowthGuideDialog> | null;
  profileAnalysisDialogKey?: string;
  profileAnalysisDialogProps: ComponentProps<typeof ProfileAnalysisDialog> | null;
  addAccountDialogProps: ComponentProps<typeof AddAccountDialog>;
  threadDeleteDialogProps: ComponentProps<typeof ThreadDeleteDialog>;
}

export function ChatOverlays(props: ChatOverlaysProps) {
  const {
    draftQueueModalsProps,
    billingDialogsProps,
    feedbackDialogProps,
    extensionDialogProps,
    sourceMaterialsDialogProps,
    preferencesDialogProps,
    growthGuideDialogProps,
    profileAnalysisDialogKey,
    profileAnalysisDialogProps,
    addAccountDialogProps,
    threadDeleteDialogProps,
  } = props;

  return (
    <>
      <DraftQueueModals {...draftQueueModalsProps} />
      <BillingDialogs {...billingDialogsProps} />
      <FeedbackDialog {...feedbackDialogProps} />
      <ExtensionDialog {...extensionDialogProps} />
      <SourceMaterialsDialog {...sourceMaterialsDialogProps} />
      {preferencesDialogProps ? <PreferencesDialog {...preferencesDialogProps} /> : null}
      {growthGuideDialogProps ? <GrowthGuideDialog {...growthGuideDialogProps} /> : null}
      {profileAnalysisDialogProps ? (
        <ProfileAnalysisDialog
          key={profileAnalysisDialogKey}
          {...profileAnalysisDialogProps}
        />
      ) : null}
      <AddAccountDialog {...addAccountDialogProps} />
      <ThreadDeleteDialog {...threadDeleteDialogProps} />
    </>
  );
}
