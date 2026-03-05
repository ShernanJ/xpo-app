"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { FormEvent, Suspense, useState } from "react";

function LoginFormContent() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<"email" | "password" | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const xHandle = searchParams.get("xHandle");
  const emailInputState =
    focusedField === "email" ? "is-focused" : email.trim() ? "is-filled" : "is-idle";
  const passwordInputState =
    focusedField === "password" ? "is-focused" : password.trim() ? "is-filled" : "is-idle";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (res?.error) {
      setError("Invalid email or password");
      setLoading(false);
    } else {
      if (xHandle) {
        // Automatically save this onboarding handle as the active context
        await fetch("/api/creator/profile/handles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handle: xHandle }),
        });
      }
      router.push("/chat");
      router.refresh();
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="mt-8 flex w-full max-w-md flex-col gap-4">
        {error ? (
          <div className="rounded-xl border border-rose-400/35 bg-rose-500/10 px-4 py-3 text-left">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-rose-200">
              Auth Error
            </p>
            <p className="mt-1 text-sm text-rose-100">{error}</p>
          </div>
        ) : null}

        {xHandle ? (
          <div className="rounded-xl border border-emerald-300/30 bg-emerald-300/[0.06] px-4 py-3 text-left">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-200/90">
              Workspace Context
            </p>
            <p className="mt-1 text-sm font-medium text-zinc-200">
              Sign in to secure your workspace for{" "}
              <strong className="text-white">@{xHandle}</strong>.
            </p>
          </div>
        ) : null}

        <div className="space-y-2 text-left">
          <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Email
          </label>
          <div className={`login-input-shell ${emailInputState}`}>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onFocus={() => setFocusedField("email")}
              onBlur={() => setFocusedField((current) => (current === "email" ? null : current))}
              required
              placeholder="maker@xpo.dev"
              autoComplete="email"
              className="login-input-field"
            />
          </div>
        </div>

        <div className="space-y-2 text-left">
          <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Password
          </label>
          <div className={`login-input-shell ${passwordInputState}`}>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onFocus={() => setFocusedField("password")}
              onBlur={() => setFocusedField((current) => (current === "password" ? null : current))}
              required
              placeholder="••••••••"
              autoComplete="current-password"
              className="login-input-field"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-white/85 bg-white px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-black transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:border-zinc-600 disabled:bg-zinc-700 disabled:text-zinc-400"
        >
          {loading ? "Signing in..." : xHandle ? `Continue as @${xHandle}` : "Login"}
        </button>

        <p className="mt-2 text-center text-xs leading-6 text-zinc-500">
          Don&apos;t have an account? Enter a new email and password to auto-register.
        </p>
      </form>

      <style jsx global>{`
        @keyframes loginInputShimmer {
          0% {
            transform: translateX(-140%);
            opacity: 0;
          }
          20% {
            opacity: 0.18;
          }
          46% {
            opacity: 0.24;
          }
          100% {
            transform: translateX(140%);
            opacity: 0;
          }
        }

        .login-input-shell {
          position: relative;
          overflow: hidden;
          border-radius: 0.85rem;
          border: 1px solid rgba(148, 163, 184, 0.5);
          background: linear-gradient(180deg, rgba(14, 18, 28, 0.98), rgba(10, 14, 24, 0.98));
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.05),
            inset 0 -1px 0 rgba(255, 255, 255, 0.03),
            0 0 0 1px rgba(255, 255, 255, 0.08);
          transition:
            border-color 220ms ease,
            box-shadow 220ms ease,
            background-color 220ms ease;
        }

        .login-input-shell::after {
          content: "";
          pointer-events: none;
          position: absolute;
          inset: 0;
          z-index: 1;
          background: linear-gradient(
            110deg,
            transparent 20%,
            rgba(226, 232, 240, 0.1) 44%,
            rgba(226, 232, 240, 0.22) 50%,
            rgba(226, 232, 240, 0.1) 56%,
            transparent 80%
          );
          transform: translateX(-140%);
          opacity: 0;
        }

        .login-input-shell.is-idle {
          border-color: rgba(148, 163, 184, 0.5);
        }

        .login-input-shell.is-idle::after {
          animation: loginInputShimmer 5.2s linear infinite;
        }

        .login-input-shell.is-focused {
          border-color: rgba(226, 232, 240, 0.62);
          background: linear-gradient(180deg, rgba(12, 17, 30, 0.96), rgba(8, 12, 22, 0.98));
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.08),
            inset 0 -1px 0 rgba(255, 255, 255, 0.04),
            0 0 0 1px rgba(226, 232, 240, 0.22),
            0 0 22px rgba(148, 163, 184, 0.16);
        }

        .login-input-shell.is-focused::after {
          animation: loginInputShimmer 2.1s linear infinite;
        }

        .login-input-shell.is-filled:not(.is-focused) {
          border-color: rgba(148, 163, 184, 0.44);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.06),
            inset 0 -1px 0 rgba(255, 255, 255, 0.04),
            0 0 0 1px rgba(148, 163, 184, 0.18);
        }

        .login-input-shell.is-filled:not(.is-focused)::after {
          animation: loginInputShimmer 3.6s linear infinite;
        }

        .login-input-field {
          position: relative;
          z-index: 2;
          width: 100%;
          background: transparent;
          padding: 0.78rem 0.95rem;
          color: rgb(250 250 250);
          font-size: 0.95rem;
          line-height: 1.4;
          outline: none;
        }

        .login-input-field::placeholder {
          color: rgb(113 113 122);
        }

        @media (prefers-reduced-motion: reduce) {
          .login-input-shell,
          .login-input-shell::after {
            animation: none !important;
            transition: none !important;
          }

          .login-input-shell::after {
            opacity: 0 !important;
          }
        }
      `}</style>
    </>
  );
}

export function LoginForm() {
  return (
    <Suspense
      fallback={
        <div className="mt-8 h-72 w-full max-w-md animate-pulse rounded-2xl border border-white/10 bg-white/[0.02]" />
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}
