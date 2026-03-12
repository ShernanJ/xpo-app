"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  type ChromeRuntimeLike,
  handoffExtensionAuthToken,
  resolveCurrentAppBaseUrl,
} from "@/lib/extension/connect";

type ConnectState = "idle" | "issuing" | "sending" | "success" | "error";

interface ConnectClientProps {
  extensionId: string;
}

function getChromeRuntime() {
  const runtime = (globalThis as typeof globalThis & {
    chrome?: { runtime?: ChromeRuntimeLike };
  }).chrome?.runtime;

  return runtime && typeof runtime.sendMessage === "function" ? runtime : null;
}

export function ExtensionConnectClient(props: ConnectClientProps) {
  const [state, setState] = useState<ConnectState>("idle");
  const [message, setMessage] = useState<string>("Preparing extension handoff...");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  const instructions = useMemo(
    () => [
      "Keep the Xpo companion installed and enabled in Chromium.",
      "If this page says the extension was not found, reopen the popup and confirm the environment is set to the same app URL.",
      "After success, open x.com and use the sidepanel to generate backend replies.",
    ],
    [],
  );

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      setState("issuing");
      setMessage("Issuing a scoped extension token...");

      try {
        const tokenResponse = await fetch("/api/extension/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: "xpo-companion" }),
        });
        const tokenPayload = (await tokenResponse.json().catch(() => null)) as
          | { ok?: boolean; token?: string; expiresAt?: string; errors?: Array<{ message?: string }> }
          | null;

        if (!tokenResponse.ok || !tokenPayload?.ok || !tokenPayload.token) {
          throw new Error(
            tokenPayload?.errors?.[0]?.message || "Could not mint an extension token.",
          );
        }

        if (cancelled) {
          return;
        }

        setExpiresAt(tokenPayload.expiresAt || null);
        setState("sending");
        setMessage("Sending token to the Xpo companion...");

        await handoffExtensionAuthToken({
          runtime: getChromeRuntime(),
          extensionId: props.extensionId,
          apiToken: tokenPayload.token,
          appBaseUrl: resolveCurrentAppBaseUrl(window.location),
        });

        if (cancelled) {
          return;
        }

        setState("success");
        setMessage("The extension is connected. Backend reply generation is ready.");
      } catch (error) {
        if (cancelled) {
          return;
        }

        setState("error");
        setMessage(error instanceof Error ? error.message : "Failed to connect the extension.");
      }
    }

    void connect();

    return () => {
      cancelled = true;
    };
  }, [props.extensionId]);

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-2xl flex-col justify-center px-6 py-16">
      <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#050505] shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
        <div className="border-b border-white/10 px-6 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
            Extension Connect
          </p>
          <h1 className="mt-3 font-mono text-3xl font-semibold tracking-tight text-white">
            Connect Xpo Companion
          </h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            This page issues an extension-scoped token and hands it to your installed Xpo
            companion. It does not share your app session cookie with the extension.
          </p>
        </div>

        <div className="space-y-6 px-6 py-6">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
              Status
            </p>
            <p
              className={`mt-3 text-sm leading-6 ${
                state === "success"
                  ? "text-emerald-300"
                  : state === "error"
                    ? "text-rose-300"
                    : "text-zinc-200"
              }`}
            >
              {message}
            </p>
            {expiresAt ? (
              <p className="mt-3 text-xs text-zinc-500">Token expires: {expiresAt}</p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
              What To Check
            </p>
            <ul className="mt-3 space-y-3 text-sm leading-6 text-zinc-300">
              {instructions.map((instruction) => (
                <li key={instruction}>{instruction}</li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/chat"
              className="inline-flex items-center justify-center rounded-xl border border-white/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-200 transition hover:border-white/30 hover:text-white"
            >
              Open Chat
            </Link>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center rounded-xl border border-emerald-200/70 bg-emerald-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-950 transition hover:bg-emerald-50"
            >
              Retry Connect
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
