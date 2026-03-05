import OnboardingLanding from "./onboarding/OnboardingLanding";
import { getServerSession } from "@/lib/auth/serverSession";
import { redirect } from "next/navigation";
import { getPublicBillingOffers } from "@/lib/billing/public-offers";

export default async function HomePage() {
  const session = await getServerSession();

  if (session?.user) {
    redirect("/chat");
  }

  return <OnboardingLanding pricingOffers={getPublicBillingOffers()} />;
}
