"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useId, useState } from "react";
import { buildGoogleOAuthStartPath, normalizeAuthCallbackUrl, normalizePostLoginXHandle } from "@/lib/auth/oauth";
import { requestEmailCode, verifyEmailCode } from "@/lib/auth/client";
import {
  attachXHandleToAuthenticatedUser,
  buildPostLoginDestination,
  navigateToPostLoginDestination,
} from "./loginNavigation";
import {
  capturePostHogEvent,
  capturePostHogException,
} from "@/lib/posthog/client";

function resolveEmailDomain(email: string): string | null {
  const domain = email.split("@")[1]?.trim().toLowerCase();
  return domain || null;
}

function GoogleMark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0"
    >
      <path
        fill="#4285F4"
        d="M21.64 12.204c0-.638-.057-1.251-.163-1.84H12v3.481h5.41a4.626 4.626 0 0 1-2.006 3.037v2.523h3.24c1.897-1.747 2.996-4.324 2.996-7.2Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.964-.896 6.619-2.595l-3.24-2.523c-.896.6-2.044.955-3.379.955-2.596 0-4.794-1.753-5.578-4.11H3.073v2.602A9.997 9.997 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC04"
        d="M6.422 13.727A5.997 5.997 0 0 1 6.11 11.999c0-.6.106-1.181.312-1.728V7.669H3.073A9.998 9.998 0 0 0 2 12c0 1.61.386 3.135 1.073 4.331l3.349-2.604Z"
      />
      <path
        fill="#EA4335"
        d="M12 6.163c1.468 0 2.786.505 3.823 1.497l2.867-2.867C16.959 3.18 14.695 2 12 2a9.997 9.997 0 0 0-8.927 5.669l3.349 2.602c.784-2.357 2.982-4.108 5.578-4.108Z"
      />
    </svg>
  );
}

function LoginFormContent() {
  const searchParams = useSearchParams();
  const initialAuthError = searchParams.get("authError")?.trim() || null;
  const [email, setEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialAuthError);
  const [loadingState, setLoadingState] = useState<"idle" | "request" | "verify" | "resend" | "setup">(
    "idle",
  );
  const [focusedField, setFocusedField] = useState<"email" | "code" | null>(null);
  const xHandle = searchParams.get("xHandle");
  const callbackUrl = normalizeAuthCallbackUrl(searchParams.get("callbackUrl"));
  const normalizedXHandle = normalizePostLoginXHandle(xHandle);
  const googleOAuthStartPath = buildGoogleOAuthStartPath({
    callbackUrl,
    xHandle: normalizedXHandle,
  });
  const emailInputState =
    focusedField === "email" ? "is-focused" : email.trim() ? "is-filled" : "is-idle";
  const codeInputState =
    focusedField === "code"
      ? "is-focused"
      : verificationCode.trim()
        ? "is-filled"
        : "is-idle";
  const emailInputId = useId();
  const codeInputId = useId();

  const completeLogin = async () => {
    try {
      setLoadingState("setup");
      setError(null);
      const attachResult = await attachXHandleToAuthenticatedUser(normalizedXHandle);
      if (!attachResult.ok) {
        throw new Error(attachResult.error);
      }

      navigateToPostLoginDestination(
        buildPostLoginDestination(callbackUrl, normalizedXHandle),
      );
    } catch (setupError) {
      capturePostHogException(setupError, {
        account: normalizedXHandle,
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

  const handleEmailSubmit = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Email is required.");
      return;
    }

    setLoadingState("request");
    setError(null);

    capturePostHogEvent("xpo_login_submitted", {
      callback_url: callbackUrl,
      email_domain: resolveEmailDomain(normalizedEmail),
      has_x_handle: Boolean(xHandle),
      source: "login_form",
    });

    const result = await requestEmailCode({ email: normalizedEmail });

    if (result.error) {
      setPendingVerificationEmail(null);
      setError(result.error);
      setLoadingState("idle");
      return;
    }

    setEmail(normalizedEmail);
    setPendingVerificationEmail(normalizedEmail);
    setVerificationCode("");
    setLoadingState("idle");
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

    const result = await verifyEmailCode({
      email: normalizedEmail,
      code: verificationCode.trim(),
    });

    if (result.error) {
      setError(result.error);
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

    const result = await requestEmailCode({ email: normalizedEmail });

    if (result.error) {
      setError(result.error);
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

          await handleEmailSubmit();
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

            <button
              type="submit"
              disabled={isBusy}
              className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-white/85 bg-white px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-black transition hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:cursor-not-allowed disabled:border-zinc-600 disabled:bg-zinc-700 disabled:text-zinc-400"
            >
              {loadingState === "setup"
                ? "Setting things up..."
                : loadingState === "request"
                  ? "Sending code..."
                  : "Send code"}
            </button>

            <div className="flex items-center gap-3 py-1">
              <span className="h-px flex-1 bg-white/10" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                Or continue with Google
              </span>
              <span className="h-px flex-1 bg-white/10" />
            </div>

            <div className="space-y-2 text-left">
              <a
                href={googleOAuthStartPath}
                onClick={() =>
                  capturePostHogEvent("xpo_login_google_requested", {
                    callback_url: callbackUrl,
                    has_x_handle: Boolean(normalizedXHandle),
                    source: "login_form",
                  })
                }
                className="inline-flex w-full items-center justify-center gap-3 rounded-xl border border-white/16 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white transition hover:border-white/28 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
              >
                <GoogleMark />
                <span>Continue with Google</span>
              </a>
            </div>

            <p className="mt-2 text-center text-xs leading-6 text-zinc-500">
              Continue with Google, or enter your email and we&apos;ll send a one-time code to sign you in.
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
