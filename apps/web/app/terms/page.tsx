import type { Metadata } from "next";
import Link from "next/link";
import { BackHomeButton } from "@/components/back-home-button";
import { LegalFooter } from "@/components/legal-footer";

const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "shernanjavier@gmail.com";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms of Service for Stanley for X.",
  alternates: {
    canonical: "/terms",
  },
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-black px-6 py-12 text-white">
      <div className="mx-auto w-full max-w-3xl">
        <BackHomeButton className="mb-5" />
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
          Terms of Service
        </p>
        <h1 className="mt-3 text-4xl font-semibold">Terms of Service</h1>
        <p className="mt-3 text-sm text-zinc-400">Last updated: March 5, 2026</p>

        <div className="mt-8 space-y-6 text-sm leading-7 text-zinc-300">
          <section>
            <h2 className="text-lg font-semibold text-white">1. Agreement to terms</h2>
            <p className="mt-2">
              These Terms govern your use of Stanley for X (&quot;Service&quot;). By creating an account or
              using the Service, you agree to these Terms and our Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">2. Eligibility and account</h2>
            <p className="mt-2">
              You must provide accurate information and keep your login credentials secure. You are
              responsible for activity under your account.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">3. Plans, billing, and credits</h2>
            <p className="mt-2">
              We offer Free, Pro, and Founder Pass plans. Paid access is billed through Stripe.
              Credits reset on the active cycle and do not roll over unless we state otherwise.
            </p>
            <p className="mt-2">
              Pro early pricing remains locked while your subscription stays active. If a subscription
              lapses or is canceled, reactivation may use then-current pricing.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">4. Founder Pass and fair use</h2>
            <p className="mt-2">
              Founder Pass includes Pro plan limits and monthly Pro credits while Xpo and this plan
              are offered. We may apply temporary limits or request manual review for extreme or
              automated usage that risks platform stability or abuse.
            </p>
            <p className="mt-2">
              If Xpo is acquired or this plan is retired, we will honor your purchase with an
              equivalent plan or account credit.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">5. Refunds</h2>
            <p className="mt-2">
              Subscription purchases may be refundable within 7 days of first purchase if usage is
              120 credits or less. Founder Pass purchases may be refundable within 72 hours if usage
              is 60 credits or less. Full details are on the{" "}
              <Link href="/refund-policy" className="underline">
                Refund Policy
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">6. Acceptable use</h2>
            <p className="mt-2">
              You agree not to abuse the Service, reverse engineer protected systems, bypass plan
              limits, submit unlawful content, or interfere with platform operations.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">7. Third-party services</h2>
            <p className="mt-2">
              The Service relies on third parties, including Stripe for billing and model providers
              for AI processing. Third-party availability or policy changes may affect functionality.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">8. Disclaimer and limitation</h2>
            <p className="mt-2">
              The Service is provided &quot;as is&quot; and &quot;as available.&quot; To the maximum extent permitted
              by law, we disclaim warranties and are not liable for indirect, incidental, special, or
              consequential damages from use of the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">9. Termination</h2>
            <p className="mt-2">
              We may suspend or terminate accounts that violate these Terms or create security,
              compliance, or abuse risk.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">10. Changes to terms</h2>
            <p className="mt-2">
              We may update these Terms from time to time. Continued use after updates means you
              accept the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">11. Contact</h2>
            <p className="mt-2">
              Billing or policy questions:{" "}
              <a className="underline" href={`mailto:${supportEmail}`}>
                {supportEmail}
              </a>
            </p>
          </section>
        </div>

        <LegalFooter className="mt-10" />
      </div>
    </main>
  );
}
