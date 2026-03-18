"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useId, useState } from "react";
import { signIn } from "@/lib/auth/client";
import type { AppSession } from "@/lib/auth/types";
import { navigateToPostLoginDestination } from "./loginNavigation";
import {
  buildPostHogHeaders,
  capturePostHogEvent,
  capturePostHogException,
  identifyPostHogUser,
} from "@/lib/posthog/client";

function resolveEmailDomain(email: string): string | null {
  const domain = email.split("@")[1]?.trim().toLowerCase();
  return domain || null;
}

function buildPostLoginDestination(callbackUrl: string, xHandle: string | null): string {
  if (!xHandle) {
    return callbackUrl;
  }

  try {
    const url = new URL(callbackUrl, window.location.origin);
    if (!url.pathname.startsWith("/chat")) {
      return callbackUrl;
    }

    if (!url.searchParams.get("xHandle")) {
      url.searchParams.set("xHandle", xHandle);
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return callbackUrl;
  }
}

function LoginFormContent() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingState, setLoadingState] = useState<"idle" | "signin" | "verify" | "resend" | "setup">(
    "idle",
  );
  const [focusedField, setFocusedField] = useState<"email" | "password" | "code" | null>(null);
  const searchParams = useSearchParams();
  const xHandle = searchParams.get("xHandle");
  const callbackUrlRaw = searchParams.get("callbackUrl");
  const callbackUrl =
    callbackUrlRaw && callbackUrlRaw.startsWith("/") ? callbackUrlRaw : "/chat";
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
  const emailInputId = useId();
  const passwordInputId = useId();
  const codeInputId = useId();

  const completeLogin = async () => {
    const normalizedHandle = xHandle?.trim().replace(/^@/, "").toLowerCase() ?? "";

    try {
      if (normalizedHandle) {
        setLoadingState("setup");
        setError(null);

        const handleResponse = await fetch("/api/creator/profile/handles", {
          method: "POST",
          headers: buildPostHogHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ handle: normalizedHandle }),
        });
        if (!handleResponse.ok) {
          throw new Error("Could not attach this X handle to your account.");
        }
      }

      navigateToPostLoginDestination(
        buildPostLoginDestination(callbackUrl, normalizedHandle || null),
      );
    } catch (setupError) {
      capturePostHogException(setupError, {
        account: normalizedHandle || null,
        source: "login_setup",
      });
      setLoadingState("idle");
      setError(
        setupError instanceof Error
          ? setupError.message
          : "Could not finish setting up your account.",
      );
    }
  };

  const handleCredentialSubmit = async () => {
    setLoadingState("signin");
    setError(null);

    const normalizedEmail = email.trim().toLowerCase();
    capturePostHogEvent("xpo_login_submitted", {
      callback_url: callbackUrl,
      email_domain: resolveEmailDomain(normalizedEmail),
      has_x_handle: Boolean(xHandle),
      source: "login_form",
    });

    const res = await signIn("credentials", {
      email: normalizedEmail,
      password,
      redirect: false,
    });

    if (res?.error) {
      if (res.code === "verification_code_required") {
        setPendingVerificationEmail(normalizedEmail);
        setVerificationCode("");
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
    capturePostHogEvent("xpo_login_verification_submitted", {
      callback_url: callbackUrl,
      email_domain: resolveEmailDomain(normalizedEmail),
      has_x_handle: Boolean(xHandle),
      source: "login_form",
    });

    const response = await fetch("/api/auth/email-code/verify", {
      method: "POST",
      headers: buildPostHogHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        email: normalizedEmail,
        code: verificationCode.trim(),
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | { ok?: boolean; error?: string; user?: AppSession["user"] }
      | null;

    if (!response.ok || !payload?.ok) {
      setError(payload?.error ?? "Could not verify your code.");
      setLoadingState("idle");
      return;
    }

    identifyPostHogUser(payload.user);
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

    const response = await fetch("/api/auth/email-code/request", {
      method: "POST",
      headers: buildPostHogHeaders({ "Content-Type": "application/json" }),
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
              <label
                htmlFor={codeInputId}
                className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500"
              >
                Verification Code
              </label>
              <div className={`login-input-shell ${codeInputState}`}>
                <input
                  id={codeInputId}
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
                  className="login-input-field focus-visible:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isBusy}
              className="inline-flex w-full items-center justify-center rounded-xl border border-emerald-200/80 bg-emerald-100 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-emerald-950 transition hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-100/60 disabled:cursor-not-allowed disabled:border-zinc-600 disabled:bg-zinc-700 disabled:text-zinc-400"
            >
              {loadingState === "setup"
                ? "Setting things up..."
                : loadingState === "verify"
                  ? "Verifying..."
                  : "Verify code"}
            </button>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleResendCode}
                disabled={isBusy}
                className="inline-flex items-center justify-center rounded-xl border border-white/25 bg-transparent px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-300 transition hover:border-white/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 disabled:cursor-not-allowed disabled:border-zinc-700 disabled:text-zinc-500"
              >
                {loadingState === "resend" ? "Sending..." : "Resend code"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingVerificationEmail(null);
                  setVerificationCode("");
                  setError(null);
                }}
                disabled={isBusy}
                className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-transparent px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400 transition hover:border-white/35 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 disabled:cursor-not-allowed disabled:border-zinc-700 disabled:text-zinc-500"
              >
                Change email
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-2 text-left">
              <label
                htmlFor={emailInputId}
                className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500"
              >
                Email
              </label>
              <div className={`login-input-shell ${emailInputState}`}>
                <input
                  id={emailInputId}
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  onFocus={() => setFocusedField("email")}
                  onBlur={() => setFocusedField((current) => (current === "email" ? null : current))}
                  required
                  placeholder="hello@xpo.lol"
                  autoComplete="email"
                  className="login-input-field focus-visible:outline-none"
                />
              </div>
            </div>

            <div className="space-y-2 text-left">
              <label
                htmlFor={passwordInputId}
                className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500"
              >
                Password
              </label>
              <div className={`login-input-shell ${passwordInputState}`}>
                <input
                  id={passwordInputId}
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onFocus={() => setFocusedField("password")}
                  onBlur={() => setFocusedField((current) => (current === "password" ? null : current))}
                  required
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="login-input-field pr-20 focus-visible:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400 transition hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isBusy}
              className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-white/85 bg-white px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-black transition hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:cursor-not-allowed disabled:border-zinc-600 disabled:bg-zinc-700 disabled:text-zinc-400"
            >
              {loadingState === "setup"
                ? "Setting things up..."
                : loadingState === "signin"
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
          font-size: 1rem;
          line-height: 1.5;
          outline: none;
        }

        .login-input-field::placeholder {
          color: rgb(113 113 122);
        }

        @media (min-width: 640px) {
          .login-input-field {
            font-size: 0.95rem;
            line-height: 1.4;
          }
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
