import type { Metadata } from "next";
import OnboardingLanding from "./OnboardingLanding";

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
  return <OnboardingLanding />;
}
