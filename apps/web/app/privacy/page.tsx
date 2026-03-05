import type { Metadata } from "next";
import Link from "next/link";
import { BackHomeButton } from "@/components/back-home-button";
import { LegalFooter } from "@/components/legal-footer";

const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "shernanjavier@gmail.com";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Privacy Policy for Stanley for X.",
  alternates: {
    canonical: "/privacy",
  },
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-black px-6 py-12 text-white">
      <div className="mx-auto w-full max-w-3xl">
        <BackHomeButton />
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
          Privacy Policy
        </p>
        <h1 className="mt-3 text-4xl font-semibold">Privacy Policy</h1>
        <p className="mt-3 text-sm text-zinc-400">Last updated: March 5, 2026</p>

        <div className="mt-8 space-y-6 text-sm leading-7 text-zinc-300">
          <section>
            <h2 className="text-lg font-semibold text-white">1. Information we collect</h2>
            <p className="mt-2">
              We collect account details (such as email and profile identifiers), usage data (feature
              events, credits usage, logs), and workspace data you provide. For paid plans, payment
              processing data is handled by Stripe.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">2. Data from connected platforms</h2>
            <p className="mt-2">
              If you submit an X handle or connect social profile context, we process publicly
              available profile/content metadata and your selected workspace inputs to generate
              insights and recommendations.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">3. How we use information</h2>
            <p className="mt-2">
              We use data to operate the Service, enforce limits, prevent abuse, improve model
              quality, provide support, and process billing/refunds.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">4. Sharing of information</h2>
            <p className="mt-2">
              We share data with service providers needed to run the product (for example hosting,
              authentication, AI processing, and Stripe billing). We do not sell personal information.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">5. Retention</h2>
            <p className="mt-2">
              We retain data for as long as needed to provide the Service, comply with legal
              obligations, resolve disputes, and enforce agreements. Retention windows may vary by
              data category.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">6. Security</h2>
            <p className="mt-2">
              We use administrative, technical, and organizational safeguards designed to protect your
              information. No system is completely secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">7. Your choices and rights</h2>
            <p className="mt-2">
              You can request account/data updates or deletion by contacting support. Depending on your
              location, you may have rights to access, correct, delete, restrict, or object to certain
              processing.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">8. Cookies and analytics</h2>
            <p className="mt-2">
              We may use cookies and similar technologies for session management, security, and product
              analytics. You can control cookies through browser settings.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">9. Children&apos;s privacy</h2>
            <p className="mt-2">
              The Service is not directed to children under 13, and we do not knowingly collect
              personal information from children under 13.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">10. Changes to this policy</h2>
            <p className="mt-2">
              We may update this Privacy Policy. If we make material changes, we will update the
              effective date and post the revised version here.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">11. Contact</h2>
            <p className="mt-2">
              Privacy or billing questions:{" "}
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
