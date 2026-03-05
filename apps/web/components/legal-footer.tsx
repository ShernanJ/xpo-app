"use client";

import Link from "next/link";

interface LegalFooterProps {
  className?: string;
}

const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "shernanjavier@gmail.com";

export function LegalFooter({ className }: LegalFooterProps) {
  return (
    <footer
      className={[
        "border-t border-white/10 pt-6 text-xs text-zinc-500",
        className ?? "",
      ].join(" ")}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href="/pricing" className="transition hover:text-zinc-200">
            Pricing
          </Link>
          <Link href="/refund-policy" className="transition hover:text-zinc-200">
            Refund Policy
          </Link>
          <Link href="/terms" className="transition hover:text-zinc-200">
            Terms
          </Link>
          <Link href="/privacy" className="transition hover:text-zinc-200">
            Privacy
          </Link>
        </nav>
        <a href={`mailto:${supportEmail}`} className="transition hover:text-zinc-200">
          Billing support: {supportEmail}
        </a>
      </div>
    </footer>
  );
}
