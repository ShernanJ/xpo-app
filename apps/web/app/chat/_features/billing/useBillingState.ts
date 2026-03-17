"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildPostHogHeaders,
  capturePostHogEvent,
  capturePostHogException,
} from "@/lib/posthog/client";

import {
  resolveBillingViewState,
  type BillingSnapshotPayload,
  type BillingStatePayload,
} from "./billingViewState";

interface ValidationError {
  message: string;
}

interface BillingStateSuccess {
  ok: true;
  data: BillingStatePayload;
}

interface BillingStateFailure {
  ok: false;
  code?:
    | "INSUFFICIENT_CREDITS"
    | "PLAN_REQUIRED"
    | "RATE_LIMITED"
    | "SOLD_OUT"
    | "ALREADY_SUBSCRIBED"
    | "PLAN_SWITCH_IN_PORTAL";
  errors: ValidationError[];
  data?: {
    billing?: BillingSnapshotPayload;
  };
}

type BillingStateResponse = BillingStateSuccess | BillingStateFailure;

interface UseBillingStateOptions {
  monetizationEnabled: boolean;
  sessionUserId: string | null | undefined;
  billingQueryStatus: string;
  billingQuerySessionId: string;
  onErrorMessage: (message: string | null) => void;
}

export function useBillingState(options: UseBillingStateOptions) {
  const {
    monetizationEnabled,
    sessionUserId,
    billingQueryStatus,
    billingQuerySessionId,
    onErrorMessage,
  } = options;

  const [billingState, setBillingState] = useState<BillingStatePayload | null>(null);
  const [isBillingLoading, setIsBillingLoading] = useState(false);
  const [dismissedBillingWarningLevel, setDismissedBillingWarningLevel] = useState<
    "low" | "critical" | null
  >(null);
  const [pricingModalOpen, setPricingModalOpen] = useState(false);
  const [checkoutLoadingOffer, setCheckoutLoadingOffer] = useState<
    "pro_monthly" | "pro_annual" | "lifetime" | null
  >(null);
  const [isOpeningBillingPortal, setIsOpeningBillingPortal] = useState(false);
  const [selectedModalProCadence, setSelectedModalProCadence] = useState<"monthly" | "annual">(
    "monthly",
  );
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  const loadBillingState = useCallback(
    async (loadOptions?: { openModalIfFirstVisit?: boolean; checkoutSessionId?: string }) => {
      if (!monetizationEnabled) {
        setBillingState(null);
        setPricingModalOpen(false);
        return;
      }

      if (!sessionUserId) {
        return;
      }

      setIsBillingLoading(true);
      try {
        const checkoutSessionId = loadOptions?.checkoutSessionId?.trim();
        const query = checkoutSessionId
          ? `?session_id=${encodeURIComponent(checkoutSessionId)}`
          : "";
        const response = await fetch(`/api/billing/state${query}`, {
          headers: buildPostHogHeaders(),
          method: "GET",
        });
        const data = (await response.json()) as BillingStateResponse;

        if (!response.ok || !data.ok) {
          return;
        }

        setBillingState(data.data);
        if (loadOptions?.openModalIfFirstVisit && data.data.billing.showFirstPricingModal) {
          setPricingModalOpen(true);
        }
      } catch (error) {
        console.error("Failed to load billing state", error);
      } finally {
        setIsBillingLoading(false);
      }
    },
    [monetizationEnabled, sessionUserId],
  );

  const acknowledgePricingModal = useCallback(async () => {
    if (!monetizationEnabled) {
      return;
    }

    try {
      const response = await fetch("/api/billing/ack-pricing-modal", {
        headers: buildPostHogHeaders(),
        method: "POST",
      });
      const data = (await response.json()) as BillingStateResponse;
      if (response.ok && data.ok) {
        setBillingState(data.data);
      }
    } catch (error) {
      console.error("Failed to acknowledge pricing modal", error);
    }
  }, [monetizationEnabled]);

  const handlePricingModalOpenChange = useCallback(
    (open: boolean) => {
      setPricingModalOpen(open);
      if (!open) {
        void acknowledgePricingModal();
      }
    },
    [acknowledgePricingModal],
  );

  const openCheckoutForOffer = useCallback(
    async (offer: "pro_monthly" | "pro_annual" | "lifetime") => {
      if (!monetizationEnabled) {
        return;
      }

      setCheckoutLoadingOffer(offer);
      try {
        capturePostHogEvent("xpo_checkout_started", {
          offer,
          source: "chat_pricing_modal",
        });
        const response = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: buildPostHogHeaders({
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({
            offer,
            successPath: "/chat",
            cancelPath: "/chat",
          }),
        });

        const data = (await response.json()) as
          | {
              ok: true;
              data: { checkoutUrl?: string | null };
            }
          | BillingStateFailure;

        if (!response.ok || !data.ok) {
          const failed = data as BillingStateFailure;
          onErrorMessage(failed.errors?.[0]?.message || "Failed to initialize checkout.");
          if (failed.data?.billing && billingState) {
            setBillingState({
              ...billingState,
              billing: failed.data.billing,
            });
          } else if (failed.data?.billing) {
            void loadBillingState();
          }
          return;
        }

        if (data.data.checkoutUrl) {
          window.location.href = data.data.checkoutUrl;
          return;
        }

        onErrorMessage("Checkout did not return a valid URL.");
      } catch (error) {
        capturePostHogException(error, {
          offer,
          source: "chat_pricing_modal",
        });
        onErrorMessage(
          error instanceof Error ? error.message : "Failed to initialize checkout.",
        );
      } finally {
        setCheckoutLoadingOffer(null);
      }
    },
    [billingState, loadBillingState, monetizationEnabled, onErrorMessage],
  );

  const openBillingPortal = useCallback(async () => {
    if (!monetizationEnabled) {
      return;
    }

    setIsOpeningBillingPortal(true);
    try {
      const response = await fetch("/api/billing/portal", {
        headers: buildPostHogHeaders(),
        method: "POST",
      });
      const data = (await response.json()) as
        | { ok: true; data: { url?: string } }
        | { ok: false; errors?: ValidationError[] };

      if (!response.ok || !data.ok || !data.data?.url) {
        const message =
          !data.ok && data.errors?.[0]?.message
            ? data.errors[0].message
            : "Failed to open billing portal.";
        onErrorMessage(message);
        return;
      }

      capturePostHogEvent("xpo_billing_portal_opened", {
        source: "chat_settings",
      });
      window.open(data.data.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      capturePostHogException(error, {
        source: "chat_settings",
      });
      onErrorMessage(
        error instanceof Error ? error.message : "Failed to open billing portal.",
      );
    } finally {
      setIsOpeningBillingPortal(false);
    }
  }, [monetizationEnabled, onErrorMessage]);

  const applyBillingSnapshot = useCallback((snapshot: BillingSnapshotPayload | null | undefined) => {
    if (!snapshot) {
      return;
    }

    setBillingState((current) =>
      current
        ? {
            ...current,
            billing: snapshot,
          }
        : current,
    );
  }, []);

  const billingViewState = useMemo(
    () =>
      resolveBillingViewState({
        monetizationEnabled,
        billingState,
        dismissedBillingWarningLevel,
        isBillingLoading,
        selectedModalProCadence,
      }),
    [
      billingState,
      dismissedBillingWarningLevel,
      isBillingLoading,
      monetizationEnabled,
      selectedModalProCadence,
    ],
  );

  const lifetimeOffer = billingState?.offers.find((offer) => offer.offer === "lifetime");
  const isSelectedModalProCheckoutLoading =
    checkoutLoadingOffer === billingViewState.selectedModalProOffer;
  const planStatusLabel =
    billingViewState.activeBillingSnapshot?.status === "past_due"
      ? "Past due"
      : billingViewState.activeBillingSnapshot?.status === "blocked_fair_use"
        ? "Fair use review"
        : billingViewState.activeBillingSnapshot?.status === "canceled"
          ? "Canceled"
          : "Active";
  const supportEmail = billingState?.supportEmail ?? "shernanjavier@gmail.com";

  useEffect(() => {
    if (!sessionUserId) {
      return;
    }

    void loadBillingState({
      openModalIfFirstVisit: true,
      checkoutSessionId:
        billingQueryStatus === "success" && billingQuerySessionId
          ? billingQuerySessionId
          : undefined,
    });
  }, [
    billingQuerySessionId,
    billingQueryStatus,
    loadBillingState,
    sessionUserId,
  ]);

  useEffect(() => {
    if (!monetizationEnabled || !billingQueryStatus || !sessionUserId) {
      return;
    }

    if (billingQueryStatus === "success") {
      setPricingModalOpen(false);
      onErrorMessage(null);
      void loadBillingState({
        checkoutSessionId: billingQuerySessionId || undefined,
      });
    }
  }, [
    billingQuerySessionId,
    billingQueryStatus,
    loadBillingState,
    monetizationEnabled,
    onErrorMessage,
    sessionUserId,
  ]);

  useEffect(() => {
    if (!monetizationEnabled) {
      setDismissedBillingWarningLevel(null);
      return;
    }

    const lowCreditWarning = billingState?.billing?.lowCreditWarning ?? false;
    const criticalCreditWarning = billingState?.billing?.criticalCreditWarning ?? false;

    if (!lowCreditWarning && !criticalCreditWarning) {
      setDismissedBillingWarningLevel(null);
    }
  }, [
    billingState?.billing?.criticalCreditWarning,
    billingState?.billing?.lowCreditWarning,
    monetizationEnabled,
  ]);

  useEffect(() => {
    if (!monetizationEnabled) {
      return;
    }

    const billingPlan = billingState?.billing?.plan ?? null;
    const billingCycle = billingState?.billing?.billingCycle ?? null;

    if (!billingPlan) {
      return;
    }

    if (billingPlan === "pro") {
      setSelectedModalProCadence(billingCycle === "annual" ? "annual" : "monthly");
    }
  }, [billingState?.billing?.billingCycle, billingState?.billing?.plan, monetizationEnabled]);

  return {
    billingState,
    setBillingState,
    applyBillingSnapshot,
    billingViewState,
    lifetimeOffer,
    supportEmail,
    planStatusLabel,
    pricingModalOpen,
    setPricingModalOpen,
    handlePricingModalOpenChange,
    settingsModalOpen,
    setSettingsModalOpen,
    selectedModalProCadence,
    setSelectedModalProCadence,
    isOpeningBillingPortal,
    openBillingPortal,
    openCheckoutForOffer,
    isSelectedModalProCheckoutLoading,
    dismissedBillingWarningLevel,
    setDismissedBillingWarningLevel,
    acknowledgePricingModal,
  };
}
