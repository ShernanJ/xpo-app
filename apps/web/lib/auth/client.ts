"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { AppSession, AppSessionStatus } from "./types";
import {
  buildPostHogHeaders,
  identifyPostHogUser,
  resetPostHogUser,
} from "@/lib/posthog/client";

const AUTH_CHANGED_EVENT = "sx-auth-changed";

interface SessionResponse {
  ok: true;
  session: AppSession | null;
}

interface AuthResponseSuccess {
  ok: true;
  user?: AppSession["user"];
}

interface AuthValidationError {
  field?: string;
  message?: string;
}

interface AuthResponseFailure {
  ok?: false;
  error?: string;
  code?: string;
  errors?: AuthValidationError[];
}

type AuthResponsePayload = AuthResponseSuccess | AuthResponseFailure | null;

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
    headers: buildPostHogHeaders(),
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as SessionResponse;
  return payload.session;
}

async function parseAuthResponse(response: Response): Promise<{
  payload: AuthResponsePayload;
  normalizedFallback: string;
}> {
  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const payload = (isJson ? await response.json().catch(() => null) : null) as AuthResponsePayload;
  const textFallback = !isJson ? await response.text().catch(() => "") : "";
  const normalizedFallback =
    typeof textFallback === "string" &&
    textFallback.trim().length > 0 &&
    !textFallback.includes("<!DOCTYPE")
      ? textFallback.trim()
      : "";

  return { payload, normalizedFallback };
}

function resolveAuthFailureMessage(
  payload: AuthResponseFailure | null,
  normalizedFallback: string,
  defaultClientMessage: string,
  defaultServerMessage: string,
  status: number,
): string {
  const structuredError =
    typeof payload?.error === "string" && payload.error.trim().length > 0
      ? payload.error.trim()
      : typeof payload?.errors?.[0]?.message === "string" &&
          payload.errors[0].message.trim().length > 0
        ? payload.errors[0].message.trim()
        : "";

  if (structuredError.length > 0) {
    return structuredError;
  }

  if (normalizedFallback.length > 0) {
    return normalizedFallback;
  }

  return status >= 500 ? defaultServerMessage : defaultClientMessage;
}

type AuthMutationResult = {
  code?: string;
  error?: string;
  ok: boolean;
  status: number;
  user?: AppSession["user"];
};

export async function requestEmailCode(options: {
  email: string;
}): Promise<AuthMutationResult> {
  const response = await fetch("/api/auth/email-code/request", {
    method: "POST",
    headers: buildPostHogHeaders({ "Content-Type": "application/json" }),
    credentials: "same-origin",
    body: JSON.stringify({
      email: options.email,
    }),
  });

  const { payload, normalizedFallback } = await parseAuthResponse(response);
  const failurePayload =
    payload && (!("ok" in payload) || payload.ok !== true)
      ? (payload as AuthResponseFailure)
      : null;

  if (!response.ok || !payload?.ok) {
    const resolvedError = resolveAuthFailureMessage(
      failurePayload,
      normalizedFallback,
      "Could not send a verification code.",
      "Email sign-in is temporarily unavailable. Try again in a moment.",
      response.status,
    );

    return {
      ok: false,
      status: response.status,
      code: failurePayload?.code,
      error: resolvedError,
      user: undefined,
    };
  }

  return {
    ok: true,
    status: response.status,
    user: undefined,
  };
}

export async function verifyEmailCode(options: {
  email: string;
  code: string;
}): Promise<AuthMutationResult> {
  const response = await fetch("/api/auth/email-code/verify", {
    method: "POST",
    headers: buildPostHogHeaders({ "Content-Type": "application/json" }),
    credentials: "same-origin",
    body: JSON.stringify({
      email: options.email,
      code: options.code,
    }),
  });

  const { payload, normalizedFallback } = await parseAuthResponse(response);
  const failurePayload =
    payload && (!("ok" in payload) || payload.ok !== true)
      ? (payload as AuthResponseFailure)
      : null;

  if (!response.ok || !payload?.ok) {
    const resolvedError = resolveAuthFailureMessage(
      failurePayload,
      normalizedFallback,
      "Could not verify your code.",
      "Email verification is temporarily unavailable. Try again in a moment.",
      response.status,
    );

    return {
      ok: false,
      status: response.status,
      code: failurePayload?.code,
      error: resolvedError,
      user: undefined,
    };
  }

  if (payload?.user) {
    identifyPostHogUser(payload.user);
  }

  emitAuthChanged();

  return {
    ok: true,
    status: response.status,
    user: payload.user,
  };
}

export async function signOut(options?: {
  callbackUrl?: string;
  redirect?: boolean;
}): Promise<{ url: string | null }> {
  await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "same-origin",
    headers: buildPostHogHeaders(),
  });

  resetPostHogUser();
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
  const sessionUser = session?.user ?? null;

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
        headers: buildPostHogHeaders({ "Content-Type": "application/json" }),
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

  useEffect(() => {
    if (sessionUser?.id) {
      identifyPostHogUser(sessionUser);
      return;
    }

    if (status === "unauthenticated") {
      resetPostHogUser();
    }
  }, [sessionUser, status]);

  return useMemo(
    () => ({
      data: session,
      status,
      update,
    }),
    [session, status, update],
  );
}
