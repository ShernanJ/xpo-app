"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { AppSession, AppSessionStatus } from "./types";

const AUTH_CHANGED_EVENT = "sx-auth-changed";

interface SessionResponse {
  ok: true;
  session: AppSession | null;
}

function emitAuthChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
  }
}

async function fetchSession(): Promise<AppSession | null> {
  const response = await fetch("/api/auth/session", {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as SessionResponse;
  return payload.session;
}

export async function signIn(
  _provider: "credentials",
  options: {
    email?: string;
    password?: string;
    redirect?: boolean;
    callbackUrl?: string;
  },
): Promise<{ code?: string; error?: string; ok: boolean; status: number; url: string | null }> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      email: options.email ?? "",
      password: options.password ?? "",
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; error?: string; code?: string }
    | null;

  if (!response.ok || !payload?.ok) {
    return {
      ok: false,
      status: response.status,
      code: payload?.code,
      error: payload?.error ?? "Sign-in failed.",
      url: null,
    };
  }

  emitAuthChanged();

  const callbackUrl = options.callbackUrl ?? null;
  const shouldRedirect = options.redirect !== false && Boolean(callbackUrl);
  if (shouldRedirect && callbackUrl) {
    window.location.assign(callbackUrl);
  }

  return {
    ok: true,
    status: response.status,
    url: callbackUrl,
  };
}

export async function signOut(options?: {
  callbackUrl?: string;
  redirect?: boolean;
}): Promise<{ url: string | null }> {
  await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "same-origin",
  });

  emitAuthChanged();

  const callbackUrl = options?.callbackUrl ?? "/";
  const shouldRedirect = options?.redirect !== false;
  if (shouldRedirect) {
    window.location.assign(callbackUrl);
  }

  return { url: callbackUrl };
}

export function useSession(): {
  data: AppSession | null;
  status: AppSessionStatus;
  update: (
    data?: Partial<Pick<AppSession["user"], "activeXHandle" | "handle">>,
  ) => Promise<AppSession | null>;
} {
  const [session, setSession] = useState<AppSession | null>(null);
  const [status, setStatus] = useState<AppSessionStatus>("loading");

  const hydrate = useCallback(async () => {
    const nextSession = await fetchSession();
    setSession(nextSession);
    setStatus(nextSession ? "authenticated" : "unauthenticated");
    return nextSession;
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void hydrate();
    }, 0);

    const handler = () => {
      void hydrate();
    };

    window.addEventListener(AUTH_CHANGED_EVENT, handler);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(AUTH_CHANGED_EVENT, handler);
    };
  }, [hydrate]);

  const update = useCallback(
    async (data?: Partial<Pick<AppSession["user"], "activeXHandle" | "handle">>) => {
      if (!data || Object.keys(data).length === 0) {
        return hydrate();
      }

      const response = await fetch("/api/auth/session", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const next = await hydrate();
        return next;
      }

      const payload = (await response.json()) as SessionResponse;
      setSession(payload.session);
      setStatus(payload.session ? "authenticated" : "unauthenticated");
      emitAuthChanged();
      return payload.session;
    },
    [hydrate],
  );

  return useMemo(
    () => ({
      data: session,
      status,
      update,
    }),
    [session, status, update],
  );
}
