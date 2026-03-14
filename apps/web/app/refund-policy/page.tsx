import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackHomeButton } from "@/components/back-home-button";
import { LegalFooter } from "@/components/legal-footer";
import { isMonetizationEnabled } from "@/lib/billing/monetization";

const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "shernanjavier@gmail.com";

export const metadata: Metadata = {
  title: "Refund Policy",
  description: "Refund policy for Stanley for X plans and purchases.",
  alternates: {
    canonical: "/refund-policy",
  },
};

export default function RefundPolicyPage() {
  if (!isMonetizationEnabled()) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-black px-6 py-12 text-white">
      <div className="mx-auto w-full max-w-3xl">
        <BackHomeButton className="mb-5" />
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
          Refund Policy
        </p>
        <h1 className="mt-3 text-4xl font-semibold">Refund policy</h1>
        <p className="mt-3 text-sm text-zinc-400">Last updated: March 5, 2026</p>

        <div className="mt-8 space-y-6 text-sm leading-7 text-zinc-300">
          <section>
            <h2 className="text-lg font-semibold text-white">Subscriptions</h2>
            <p className="mt-2">
              Refunds are available within 7 days of first subscription purchase if total usage is
              120 credits or less.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">Founder Pass</h2>
            <p className="mt-2">
              Founder Pass purchases are refundable within 72 hours if total usage is 60 credits or
              less.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">Support</h2>
            <p className="mt-2">
              Contact <a className="underline" href={`mailto:${supportEmail}`}>{supportEmail}</a> with your billing email, Xpo username, reason, and optional Stripe invoice link.
            </p>
          </section>
        </div>

        <LegalFooter className="mt-10" />
      </div>
    </main>
  );
}
