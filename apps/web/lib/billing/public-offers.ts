import { BILLING_OFFER_CONFIG, type BillingOffer, STRIPE_PRICE_IDS } from "@/lib/billing/config";
import type { BillingStatePayload } from "@/lib/billing/types";

export type PublicBillingOffer = BillingStatePayload["offers"][number];

export function getPublicBillingOffers(): PublicBillingOffer[] {
  return (Object.entries(BILLING_OFFER_CONFIG) as Array<
    [BillingOffer, (typeof BILLING_OFFER_CONFIG)[BillingOffer]]
  >).map(([offer, config]) => ({
    offer,
    label: config.label,
    amountCents: config.amountCents,
    cadence: config.cadence,
    productCopy: config.productCopy,
    enabled: Boolean(STRIPE_PRICE_IDS[offer]),
  }));
}
