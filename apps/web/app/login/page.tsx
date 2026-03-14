import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { XShell } from "@/components/x-shell";
import { LoginForm } from "./_components/LoginForm";

export const metadata: Metadata = {
  title: "Login",
  description: "Sign in to access your Stanley for X workspace.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function LoginPage() {
  return (
    <XShell>
      <div className="login-root relative mx-auto flex min-h-full w-full max-w-6xl flex-col justify-center px-6 py-10 sm:py-14">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <span className="login-infra-grid" />
          <span className="login-infra-vignette" />
          <span className="login-infra-rail" />
          <span className="login-ambient-glow login-ambient-glow-left" />
          <span className="login-ambient-glow login-ambient-glow-right" />
        </div>

        <section className="relative mx-auto w-full max-w-3xl">
          <div className="login-hero-shell overflow-hidden rounded-[2rem] border border-white/12 bg-[#060606] shadow-[0_24px_90px_rgba(0,0,0,0.45)]">
            <div className="relative flex items-center border-b border-white/10 px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-zinc-500/70" />
                <span className="h-3 w-3 rounded-full bg-zinc-500/70" />
                <span className="h-3 w-3 rounded-full bg-zinc-500/70" />
              </div>
              <p className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">
                secure access
              </p>
            </div>

            <div className="px-6 pb-10 pt-10 sm:px-10 sm:pb-12 sm:pt-12">
              <div className="mx-auto flex w-full max-w-md flex-col items-center text-center">
                <Image
                  src="/xpo-logo-white.webp"
                  alt="Xpo logo"
                  width={80}
                  height={80}
                  className="h-20 w-20 object-contain"
                />
                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.28em] text-zinc-500">
                  X Growth Engine
                </p>
                <h1 className="mt-5 font-mono text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  Welcome
                </h1>
                <p className="mt-3 text-sm leading-6 text-zinc-400 sm:text-base">
                  Sign in and lets grow Xponentially
                </p>

                <LoginForm />
              </div>
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-zinc-500">
            First time here?{" "}
            <Link
              href="/"
              className="font-semibold uppercase tracking-[0.14em] text-zinc-400 transition hover:text-white"
            >
              Go to landing page
            </Link>
          </p>
        </section>
      </div>
    </XShell>
  );
}
