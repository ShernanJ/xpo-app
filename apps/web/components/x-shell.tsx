import type { ReactNode } from "react";
import Link from "next/link";
import { isMonetizationEnabled } from "@/lib/billing/monetization";

const scanlineStyle = {
  backgroundImage:
    "linear-gradient(to bottom, rgba(255,255,255,0.035) 1px, transparent 1px)",
  backgroundSize: "100% 6px",
};

interface XShellProps {
  children: ReactNode;
  footerContent?: ReactNode;
  backgroundOverlay?: ReactNode;
}

export function XShell({ children, footerContent, backgroundOverlay }: XShellProps) {
  const monetizationEnabled = isMonetizationEnabled();

  return (
    <main className="min-h-app-screen bg-black text-white">
      <div className="app-shell-inset mx-auto flex min-h-app-screen max-w-7xl flex-col sm:px-4 sm:py-4">
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[#050505]">
          <div className="pointer-events-none absolute inset-0 opacity-20" style={scanlineStyle} />
          {backgroundOverlay ? (
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              {backgroundOverlay}
            </div>
          ) : null}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/10" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-white/10" />
          <div className="relative flex-1">{children}</div>
          <footer className="relative border-t border-white/10 px-6 py-4">
            <div className="flex flex-col items-center gap-3 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-0">
              <p className="text-center text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500 sm:text-left sm:text-[11px]">
                built by{" "}
                <a
                  href="https://www.x.com/shernanjavier"
                  target="_blank"
                  rel="noreferrer"
                  className="text-zinc-400 underline-offset-4 transition-colors hover:text-white hover:underline"
                >
                  shernan javier
                </a>
              </p>
              {footerContent ?? (
                <nav className="flex w-full max-w-5xl flex-wrap items-center justify-center gap-x-5 gap-y-3 text-xs text-zinc-500">
                  {monetizationEnabled ? (
                    <Link href="/pricing" className="px-1.5 py-1 transition hover:text-zinc-200">
                      Pricing
                    </Link>
                  ) : null}
                  {monetizationEnabled ? (
                    <Link href="/refund-policy" className="px-1.5 py-1 transition hover:text-zinc-200">
                      Refund Policy
                    </Link>
                  ) : null}
                  <Link href="/terms" className="px-1.5 py-1 transition hover:text-zinc-200">
                    Terms
                  </Link>
                  <Link href="/privacy" className="px-1.5 py-1 transition hover:text-zinc-200">
                    Privacy
                  </Link>
                </nav>
              )}
              <div className="hidden sm:block" aria-hidden />
            </div>
          </footer>
        </div>
      </div>
    </main>
  );
}
