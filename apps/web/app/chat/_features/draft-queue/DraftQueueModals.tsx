"use client";

import type { ComponentProps } from "react";

import { ObservedMetricsModal } from "../../_dialogs/ObservedMetricsModal";
import { DraftQueueDialog } from "./DraftQueueDialog";

export interface DraftQueueModalsProps {
  draftQueueDialogProps: ComponentProps<typeof DraftQueueDialog>;
  observedMetricsOpen: boolean;
  observedMetricsCandidateTitle: string | null;
  observedMetricsValue: ComponentProps<typeof ObservedMetricsModal>["value"];
  observedMetricsSubmitting: boolean;
  observedMetricsErrorMessage: string | null;
  onObservedMetricsChange: ComponentProps<typeof ObservedMetricsModal>["onChange"];
  onObservedMetricsOpenChange: (open: boolean) => void;
  onSubmitObservedMetrics: () => void;
}

export function DraftQueueModals(props: DraftQueueModalsProps) {
  const {
    draftQueueDialogProps,
    observedMetricsOpen,
    observedMetricsCandidateTitle,
    observedMetricsValue,
    observedMetricsSubmitting,
    observedMetricsErrorMessage,
    onObservedMetricsChange,
    onObservedMetricsOpenChange,
    onSubmitObservedMetrics,
  } = props;

  return (
    <>
      <DraftQueueDialog {...draftQueueDialogProps} />
      <ObservedMetricsModal
        open={observedMetricsOpen}
        candidateTitle={observedMetricsCandidateTitle}
        value={observedMetricsValue}
        isSubmitting={observedMetricsSubmitting}
        errorMessage={observedMetricsErrorMessage}
        onChange={onObservedMetricsChange}
        onOpenChange={onObservedMetricsOpenChange}
        onSubmit={onSubmitObservedMetrics}
      />
    </>
  );
}
