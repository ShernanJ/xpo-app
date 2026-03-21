"use client";

import type { ComponentProps } from "react";

import { PricingDialog } from "./PricingDialog";
import { ScrapeDebugDialog } from "./ScrapeDebugDialog";
import { SettingsDialog } from "./SettingsDialog";

export interface BillingDialogsProps {
  monetizationEnabled: boolean;
  supportEmail: string;
  onOpenPricingPage: () => void;
  onSignOut: () => void;
  pricingDialogProps: Omit<
    ComponentProps<typeof PricingDialog>,
    "supportEmail" | "onOpenPricingPage"
  >;
  settingsDialogProps: Omit<
    ComponentProps<typeof SettingsDialog>,
    "monetizationEnabled" | "supportEmail" | "onSignOut"
  >;
  scrapeDebugDialogProps: ComponentProps<typeof ScrapeDebugDialog>;
}

export function BillingDialogs(props: BillingDialogsProps) {
  const {
    monetizationEnabled,
    supportEmail,
    onOpenPricingPage,
    onSignOut,
    pricingDialogProps,
    settingsDialogProps,
    scrapeDebugDialogProps,
  } = props;

  return (
    <>
      <SettingsDialog
        {...settingsDialogProps}
        monetizationEnabled={monetizationEnabled}
        supportEmail={supportEmail}
        onSignOut={onSignOut}
      />

      <ScrapeDebugDialog {...scrapeDebugDialogProps} />

      {monetizationEnabled ? (
        <PricingDialog
          {...pricingDialogProps}
          onOpenPricingPage={onOpenPricingPage}
          supportEmail={supportEmail}
        />
      ) : null}
    </>
  );
}
