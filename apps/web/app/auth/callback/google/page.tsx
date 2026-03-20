"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import {
  buildGoogleOAuthStartPath,
  normalizeAuthCallbackUrl,
  normalizePostLoginXHandle,
} from "@/lib/auth/oauth";
import {
  buildPostHogHeaders,
  capturePostHogEvent,
  capturePostHogException,
} from "@/lib/posthog/client";
import {
  attachXHandleToAuthenticatedUser,
  buildPostLoginDestination,
  navigateToPostLoginDestination,
} from "@/app/login/_components/loginNavigation";

type CallbackState =
  | { kind: "loading"; message: string }
  | { kind: "error"; message: string };

const GOOGLE_OAUTH_SESSION_REQUEST_TIMEOUT_MS = 15_000;

function isAbortError(error: unknown): boolean {
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    return error.name === "AbortError";
  }

  return error instanceof Error && error.name === "AbortError";
}

function GoogleOAuthCallbackContent() {
  const searchParams = useSearchParams();
  const hasStartedFinalizationRef = useRef(false);
  const [callbackState, setCallbackState] = useState<CallbackState>({
    kind: "loading",
    message: "Finishing Google sign-in...",
  });

  const callbackUrl = normalizeAuthCallbackUrl(searchParams.get("callbackUrl"));
  const xHandle = normalizePostLoginXHandle(searchParams.get("xHandle"));
  const flowState = searchParams.get("state")?.trim() ?? "";
  const queryError =
    searchParams.get("error_description") ??
    searchParams.get("error") ??
    "";
  const retryLoginParams = new URLSearchParams();
  retryLoginParams.set("callbackUrl", callbackUrl);
  if (xHandle) {
    retryLoginParams.set("xHandle", xHandle);
  }
  const retryLoginUrl = `/login?${retryLoginParams.toString()}`;

  useEffect(() => {
    let cancelled = false;

    async function finalizeGoogleSignIn() {
      if (queryError) {
        setCallbackState({
          kind: "error",
          message: queryError,
        });
        return;
      }

      if (hasStartedFinalizationRef.current) {
        return;
      }
      hasStartedFinalizationRef.current = true;

      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const hashError =
        hashParams.get("error_description") ??
        hashParams.get("error") ??
        "";
      if (hashError) {
        setCallbackState({
          kind: "error",
          message: hashError,
        });
        return;
      }

      const accessToken = hashParams.get("access_token")?.trim() ?? "";
      if (!accessToken || !flowState) {
        setCallbackState({
          kind: "error",
          message: "Google sign-in could not be completed. Please try again.",
        });
        return;
      }

      window.history.replaceState(null, "", window.location.pathname + window.location.search);

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => {
        controller.abort();
      }, GOOGLE_OAUTH_SESSION_REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch("/api/auth/oauth/google/session", {
          method: "POST",
          headers: buildPostHogHeaders({ "Content-Type": "application/json" }),
          credentials: "same-origin",
          signal: controller.signal,
          body: JSON.stringify({
            accessToken,
            state: flowState,
          }),
        });
        const payload = (await response.json().catch(() => null)) as
          | { ok?: boolean; error?: string }
          | null;

        if (!response.ok || !payload?.ok) {
          setCallbackState({
            kind: "error",
            message: payload?.error ?? "Could not complete Google sign-in.",
          });
          return;
        }

        if (xHandle) {
          const attachResult = await attachXHandleToAuthenticatedUser(xHandle);
          if (!attachResult.ok) {
            setCallbackState({
              kind: "error",
              message: attachResult.error,
            });
            return;
          }
        }

        capturePostHogEvent("xpo_login_google_completed", {
          callback_url: callbackUrl,
          has_x_handle: Boolean(xHandle),
          source: "google_oauth_callback",
        });

        if (!cancelled) {
          navigateToPostLoginDestination(
            buildPostLoginDestination(callbackUrl, xHandle),
          );
        }
      } catch (error) {
        if (isAbortError(error)) {
          if (!cancelled) {
            setCallbackState({
              kind: "error",
              message: "Google sign-in is taking too long. Please try again.",
            });
          }
          return;
        }

        capturePostHogException(error, {
          callback_url: callbackUrl,
          has_x_handle: Boolean(xHandle),
          source: "google_oauth_callback",
        });
        if (!cancelled) {
          setCallbackState({
            kind: "error",
            message: "Could not complete Google sign-in right now.",
          });
        }
      } finally {
        window.clearTimeout(timeoutId);
      }
    }

    void finalizeGoogleSignIn();

    return () => {
      cancelled = true;
    };
  }, [callbackUrl, flowState, queryError, xHandle]);

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-xl flex-col justify-center px-6 py-16">
      <div className="rounded-[1.75rem] border border-white/10 bg-[#050505] p-6 text-zinc-200 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
          Google Sign-In
        </p>
        <h1 className="mt-4 font-mono text-3xl font-semibold tracking-tight text-white">
          {callbackState.kind === "loading" ? "Connecting your account" : "Sign-in needs another try"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          {callbackState.message}
        </p>

        {callbackState.kind === "loading" ? (
          <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-1/3 animate-[oauthProgress_1.2s_ease-in-out_infinite] rounded-full bg-white" />
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <a
              href={buildGoogleOAuthStartPath({ callbackUrl, xHandle })}
              className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:border-white/35 hover:bg-white/10"
            >
              Try Google again
            </a>
            <a
              href={retryLoginUrl}
              className="inline-flex items-center justify-center rounded-xl border border-white/12 px-4 py-3 text-sm font-semibold text-zinc-300 transition hover:border-white/25 hover:text-white"
            >
              Back to login
            </a>
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes oauthProgress {
          0% {
            transform: translateX(-120%);
          }
          50% {
            transform: translateX(60%);
          }
          100% {
            transform: translateX(260%);
          }
        }
      `}</style>
    </div>
  );
}

export default function GoogleOAuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-[70vh] w-full max-w-xl flex-col justify-center px-6 py-16">
          <div className="h-48 animate-pulse rounded-[1.75rem] border border-white/10 bg-white/[0.02]" />
        </div>
      }
    >
      <GoogleOAuthCallbackContent />
    </Suspense>
  );
}
