"use client";

import { buildPostHogHeaders } from "@/lib/posthog/client";

export function buildPostLoginDestination(callbackUrl: string, xHandle: string | null): string {
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

export async function attachXHandleToAuthenticatedUser(
  xHandle: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const normalizedHandle = xHandle?.trim().replace(/^@/, "").toLowerCase() ?? "";
  if (!normalizedHandle) {
    return { ok: true };
  }

  try {
    const handleResponse = await fetch("/api/creator/profile/handles", {
      method: "POST",
      headers: buildPostHogHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ handle: normalizedHandle }),
    });
    if (!handleResponse.ok) {
      throw new Error("Could not attach this X handle to your account.");
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not finish setting up your account.",
    };
  }
}

export function navigateToPostLoginDestination(destination: string) {
  window.location.assign(destination);
}
