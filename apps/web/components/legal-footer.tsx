"use client";

import Link from "next/link";
import { isMonetizationEnabled } from "@/lib/billing/monetization";

interface LegalFooterProps {
  className?: string;
}

export function LegalFooter({ className }: LegalFooterProps) {
  const monetizationEnabled = isMonetizationEnabled();

  return (
    <footer
      className={[
        "border-t border-white/10 pt-6 text-xs text-zinc-500",
        className ?? "",
      ].join(" ")}
    >
      <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3 text-center sm:justify-start sm:text-left">
        {monetizationEnabled ? (
          <Link href="/pricing" className="px-1.5 py-1 transition hover:text-zinc-200">
            Pricing
          </Link>
        ) : null}
        <Link href="/refund-policy" className="px-1.5 py-1 transition hover:text-zinc-200">
          Refund Policy
        </Link>
        <Link href="/terms" className="px-1.5 py-1 transition hover:text-zinc-200">
          Terms
        </Link>
        <Link href="/privacy" className="px-1.5 py-1 transition hover:text-zinc-200">
          Privacy
        </Link>
      </nav>
    </footer>
  );
}
