"use client";

import type { ComponentProps } from "react";
import dynamic from "next/dynamic";

import type { ProfileAnalysisDialogProps } from "../analysis/ProfileAnalysisDialog";
import type { BillingDialogsProps } from "../billing/BillingDialogs";
import type { ContentHubDialogProps } from "../content-hub/ContentHubDialog";
import type { DraftQueueModalsProps } from "../draft-queue/DraftQueueModals";
import type { FeedbackDialogProps } from "../feedback/FeedbackDialog";
import type { GrowthGuideDialogProps } from "../growth-guide/GrowthGuideDialog";
import type { PreferencesDialogProps } from "../preferences/PreferencesDialog";
import type { SourceMaterialsDialogProps } from "../source-materials/SourceMaterialsDialog";
import { AddAccountDialog } from "./AddAccountDialog";
import { ExtensionDialog } from "./ExtensionDialog";
import { ThreadDeleteDialog } from "./ThreadDeleteDialog";

const ContentHubDialog = dynamic(() =>
  import("../content-hub/ContentHubDialog").then((mod) => mod.ContentHubDialog),
  { loading: () => null },
);
const DraftQueueModals = dynamic(() =>
  import("../draft-queue/DraftQueueModals").then((mod) => mod.DraftQueueModals),
  { loading: () => null },
);
const BillingDialogs = dynamic(() =>
  import("../billing/BillingDialogs").then((mod) => mod.BillingDialogs),
  { loading: () => null },
);
const FeedbackDialog = dynamic(() =>
  import("../feedback/FeedbackDialog").then((mod) => mod.FeedbackDialog),
  { loading: () => null },
);
const SourceMaterialsDialog = dynamic(() =>
  import("../source-materials/SourceMaterialsDialog").then((mod) => mod.SourceMaterialsDialog),
  { loading: () => null },
);
const PreferencesDialog = dynamic(() =>
  import("../preferences/PreferencesDialog").then((mod) => mod.PreferencesDialog),
  { loading: () => null },
);
const GrowthGuideDialog = dynamic(() =>
  import("../growth-guide/GrowthGuideDialog").then((mod) => mod.GrowthGuideDialog),
  { loading: () => null },
);
const ProfileAnalysisDialog = dynamic(() =>
  import("../analysis/ProfileAnalysisDialog").then((mod) => mod.ProfileAnalysisDialog),
  { loading: () => null },
);

export interface ChatOverlaysProps {
  contentHubDialogProps: ContentHubDialogProps;
  draftQueueModalsProps: DraftQueueModalsProps;
  billingDialogsProps: BillingDialogsProps;
  feedbackDialogProps: FeedbackDialogProps;
  extensionDialogProps: ComponentProps<typeof ExtensionDialog>;
  sourceMaterialsDialogProps: SourceMaterialsDialogProps;
  preferencesDialogProps: PreferencesDialogProps | null;
  growthGuideDialogProps: GrowthGuideDialogProps | null;
  profileAnalysisDialogKey?: string;
  profileAnalysisDialogProps: ProfileAnalysisDialogProps | null;
  addAccountDialogProps: ComponentProps<typeof AddAccountDialog>;
  threadDeleteDialogProps: ComponentProps<typeof ThreadDeleteDialog>;
}

export function ChatOverlays(props: ChatOverlaysProps) {
  const {
    draftQueueModalsProps,
    contentHubDialogProps,
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
      {contentHubDialogProps.open ? <ContentHubDialog {...contentHubDialogProps} /> : null}
      {draftQueueModalsProps.draftQueueDialogProps.open || draftQueueModalsProps.observedMetricsOpen ? (
        <DraftQueueModals {...draftQueueModalsProps} />
      ) : null}
      {billingDialogsProps.settingsDialogProps.open || billingDialogsProps.pricingDialogProps.open ? (
        <BillingDialogs {...billingDialogsProps} />
      ) : null}
      {feedbackDialogProps.open ? <FeedbackDialog {...feedbackDialogProps} /> : null}
      <ExtensionDialog {...extensionDialogProps} />
      {sourceMaterialsDialogProps.open ? (
        <SourceMaterialsDialog {...sourceMaterialsDialogProps} />
      ) : null}
      {preferencesDialogProps?.open ? <PreferencesDialog {...preferencesDialogProps} /> : null}
      {growthGuideDialogProps?.open ? <GrowthGuideDialog {...growthGuideDialogProps} /> : null}
      {profileAnalysisDialogProps?.open ? (
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
