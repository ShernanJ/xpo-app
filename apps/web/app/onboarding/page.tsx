import type { Metadata } from "next";
import OnboardingLanding from "./OnboardingLanding";
import { getPublicBillingOffers } from "@/lib/billing/public-offers";

export const metadata: Metadata = {
  title: "Onboarding",
  alternates: {
    canonical: "/",
  },
  robots: {
    index: false,
    follow: true,
  },
};

export default function OnboardingPage() {
  return <OnboardingLanding pricingOffers={getPublicBillingOffers()} />;
}
