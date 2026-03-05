import Link from "next/link";

import { XShell } from "@/components/x-shell";

export default function NotFoundPage() {
  return (
    <XShell>
      <section className="mx-auto flex min-h-full w-full max-w-4xl items-center justify-center px-6 py-12 sm:py-16">
        <div className="w-full max-w-2xl rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-8 text-center shadow-[0_20px_80px_rgba(0,0,0,0.45)] sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-zinc-500">
            Route Not Found
          </p>
          <h1 className="mt-4 font-mono text-6xl font-semibold tracking-tight text-white sm:text-7xl">
            404
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-zinc-400 sm:text-base">
            The page you requested doesn&apos;t exist or may have moved.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/"
              className="inline-flex min-w-[180px] items-center justify-center rounded-2xl border border-white/15 bg-white px-6 py-3 text-sm font-semibold uppercase tracking-[0.22em] text-black transition hover:bg-zinc-200"
            >
              Back to Home
            </Link>
            <Link
              href="/login"
              className="inline-flex min-w-[180px] items-center justify-center rounded-2xl border border-white/15 bg-black/30 px-6 py-3 text-sm font-semibold uppercase tracking-[0.22em] text-white transition hover:bg-white/[0.08]"
            >
              Go to Login
            </Link>
          </div>
        </div>
      </section>
    </XShell>
  );
}
