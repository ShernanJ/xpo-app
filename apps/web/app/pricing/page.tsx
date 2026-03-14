import { notFound } from "next/navigation";
import PricingPageContent from "./_components/PricingPageContent";
import { isMonetizationEnabled } from "@/lib/billing/monetization";

export default function PricingPage() {
  if (!isMonetizationEnabled()) {
    notFound();
  }

  return <PricingPageContent />;
}
