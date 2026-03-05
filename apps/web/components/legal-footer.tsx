"use client";

import Link from "next/link";

interface LegalFooterProps {
  className?: string;
}

export function LegalFooter({ className }: LegalFooterProps) {
  return (
    <footer
      className={[
        "border-t border-white/10 pt-6 text-xs text-zinc-500",
        className ?? "",
      ].join(" ")}
    >
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
    </footer>
  );
}
