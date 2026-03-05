"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { signIn } from "@/lib/auth/client";

function LoginFormContent() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadingState, setLoadingState] = useState<"idle" | "signin" | "verify" | "resend">(
    "idle",
  );
  const [focusedField, setFocusedField] = useState<"email" | "password" | "code" | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const xHandle = searchParams.get("xHandle");
  const emailInputState =
    focusedField === "email" ? "is-focused" : email.trim() ? "is-filled" : "is-idle";
  const passwordInputState =
    focusedField === "password" ? "is-focused" : password.trim() ? "is-filled" : "is-idle";
  const codeInputState =
    focusedField === "code"
      ? "is-focused"
      : verificationCode.trim()
        ? "is-filled"
        : "is-idle";

  const completeLogin = async () => {
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
  };

  const handleCredentialSubmit = async () => {
    setLoadingState("signin");
    setError(null);
    setNotice(null);

    const normalizedEmail = email.trim().toLowerCase();

    const res = await signIn("credentials", {
      email: normalizedEmail,
      password,
      redirect: false,
    });

    if (res?.error) {
      if (res.code === "verification_code_required") {
        setPendingVerificationEmail(normalizedEmail);
        setVerificationCode("");
        setNotice(res.error);
      } else {
        setPendingVerificationEmail(null);
        setError(res.error);
      }
      setLoadingState("idle");
      return;
    }

    await completeLogin();
  };

  const handleVerifyCode = async () => {
    const normalizedEmail = (pendingVerificationEmail ?? email).trim().toLowerCase();
    if (!normalizedEmail || !verificationCode.trim()) {
      setError("Email and verification code are required.");
      return;
    }

    setLoadingState("verify");
    setError(null);
    setNotice(null);

    const response = await fetch("/api/auth/email-code/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: normalizedEmail,
        code: verificationCode.trim(),
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | { ok?: boolean; error?: string }
      | null;

    if (!response.ok || !payload?.ok) {
      setError(payload?.error ?? "Could not verify your code.");
      setLoadingState("idle");
      return;
    }

    await completeLogin();
  };

  const handleResendCode = async () => {
    const normalizedEmail = (pendingVerificationEmail ?? email).trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Email is required.");
      return;
    }

    setLoadingState("resend");
    setError(null);
    setNotice(null);

    const response = await fetch("/api/auth/email-code/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizedEmail }),
    });

    const payload = (await response.json().catch(() => null)) as
      | { ok?: boolean; error?: string }
      | null;

    if (!response.ok || !payload?.ok) {
      setError(payload?.error ?? "Could not resend verification code.");
      setLoadingState("idle");
      return;
    }

    setNotice("A new verification code was sent to your email.");
    setLoadingState("idle");
  };

  const isVerificationStep = Boolean(pendingVerificationEmail);
  const isBusy = loadingState !== "idle";

  return (
    <>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (isVerificationStep) {
            await handleVerifyCode();
            return;
          }

          await handleCredentialSubmit();
        }}
        className="mt-8 flex w-full max-w-md flex-col gap-4"
      >
        {error ? (
          <div className="rounded-xl border border-rose-400/35 bg-rose-500/10 px-4 py-3 text-left">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-rose-200">
              Auth Error
            </p>
            <p className="mt-1 text-sm text-rose-100">{error}</p>
          </div>
        ) : null}

        {notice ? (
          <div className="rounded-xl border border-emerald-400/35 bg-emerald-500/10 px-4 py-3 text-left">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-200">
              Auth Update
            </p>
            <p className="mt-1 text-sm text-emerald-100">{notice}</p>
          </div>
        ) : null}

        {isVerificationStep ? (
          <>
            <div className="rounded-xl border border-white/12 bg-white/[0.02] px-4 py-3 text-left">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                Verify Email
              </p>
              <p className="mt-1 text-sm text-zinc-200">
                Enter the code sent to{" "}
                <strong className="text-white">{pendingVerificationEmail}</strong>.
              </p>
            </div>

            <div className="space-y-2 text-left">
              <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                Verification Code
              </label>
              <div className={`login-input-shell ${codeInputState}`}>
                <input
                  type="text"
                  value={verificationCode}
                  onChange={(event) =>
                    setVerificationCode(event.target.value.replace(/\s+/g, "").toUpperCase())
                  }
                  onFocus={() => setFocusedField("code")}
                  onBlur={() => setFocusedField((current) => (current === "code" ? null : current))}
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  className="login-input-field"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isBusy}
              className="inline-flex w-full items-center justify-center rounded-xl border border-emerald-200/80 bg-emerald-100 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-emerald-950 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-zinc-600 disabled:bg-zinc-700 disabled:text-zinc-400"
            >
              {loadingState === "verify" ? "Verifying..." : "Verify code"}
            </button>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleResendCode}
                disabled={isBusy}
                className="inline-flex items-center justify-center rounded-xl border border-white/25 bg-transparent px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-300 transition hover:border-white/40 hover:text-white disabled:cursor-not-allowed disabled:border-zinc-700 disabled:text-zinc-500"
              >
                {loadingState === "resend" ? "Sending..." : "Resend code"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingVerificationEmail(null);
                  setVerificationCode("");
                  setNotice(null);
                  setError(null);
                }}
                disabled={isBusy}
                className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-transparent px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400 transition hover:border-white/35 hover:text-zinc-100 disabled:cursor-not-allowed disabled:border-zinc-700 disabled:text-zinc-500"
              >
                Change email
              </button>
            </div>
          </>
        ) : (
          <>
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
                  placeholder="hello@xpo.lol"
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
              disabled={isBusy}
              className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-white/85 bg-white px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-black transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:border-zinc-600 disabled:bg-zinc-700 disabled:text-zinc-400"
            >
              {loadingState === "signin"
                ? "Signing in..."
                : xHandle
                  ? `Continue as @${xHandle}`
                  : "Login"}
            </button>

            <p className="mt-2 text-center text-xs leading-6 text-zinc-500">
              New account? Enter your email + password and confirm with the email code.
            </p>
          </>
        )}
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
