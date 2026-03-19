export const EXTENSION_CONNECT_SOURCE = "xpo-companion";
export const EXTENSION_AUTH_MESSAGE_TYPE = "xpo:store-auth-token";
export const EXTENSION_CONNECT_PROBE_MESSAGE_TYPE = "xpo:connect-probe";

const CHROME_EXTENSION_ID_PATTERN = /^[a-p]{32}$/i;
const EXTENSION_TOKEN_CACHE_KEY_PREFIX = "xpo.extension-token";
const IGNORABLE_EXTENSION_RUNTIME_ERROR_PATTERNS = [
  /message port closed before a response was received/i,
  /a listener indicated an asynchronous response by returning true, but the message channel closed before a response was received/i,
] as const;

export interface ChromeRuntimeLike {
  sendMessage: (
    extensionId: string,
    message: unknown,
    callback?: (response?: unknown) => void,
  ) => void;
  lastError?: { message?: string };
}

export interface BrowserStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function parseExtensionConnectParams(args: {
  extensionId: string;
  source: string;
}):
  | { ok: true; extensionId: string }
  | { ok: false; message: string } {
  const extensionId = args.extensionId.trim();
  const source = args.source.trim();

  if (source !== EXTENSION_CONNECT_SOURCE) {
    return {
      ok: false,
      message: "This connection link is only valid for the Xpo Companion extension.",
    };
  }

  if (!extensionId || !CHROME_EXTENSION_ID_PATTERN.test(extensionId)) {
    return {
      ok: false,
      message: "Open this page from the extension popup so the companion can pass a valid extension id.",
    };
  }

  return {
    ok: true,
    extensionId,
  };
}

export function buildExtensionAuthMessage(args: {
  apiToken: string;
  appBaseUrl: string;
}) {
  return {
    type: EXTENSION_AUTH_MESSAGE_TYPE,
    payload: {
      apiToken: args.apiToken,
      appBaseUrl: args.appBaseUrl,
    },
  } as const;
}

export function buildExtensionConnectProbeMessage() {
  return {
    type: EXTENSION_CONNECT_PROBE_MESSAGE_TYPE,
  } as const;
}

function isIgnorableExtensionRuntimeErrorMessage(message: string | undefined) {
  const normalizedMessage = message?.trim() || "";
  if (!normalizedMessage) {
    return false;
  }

  return IGNORABLE_EXTENSION_RUNTIME_ERROR_PATTERNS.some((pattern) =>
    pattern.test(normalizedMessage),
  );
}

export function resolveCurrentAppBaseUrl(locationLike: { origin?: string | null }) {
  return locationLike.origin?.trim() || "";
}

async function sendExtensionRuntimeMessage(args: {
  runtime: ChromeRuntimeLike | null;
  extensionId: string;
  message: unknown;
}) {
  if (!args.runtime) {
    throw new Error("Chrome extension runtime is not available in this browser.");
  }

  await new Promise<void>((resolve, reject) => {
    args.runtime?.sendMessage(
      args.extensionId,
      args.message,
      () => {
        const runtimeError = args.runtime?.lastError;
        if (runtimeError?.message) {
          if (isIgnorableExtensionRuntimeErrorMessage(runtimeError.message)) {
            resolve();
            return;
          }

          reject(new Error(runtimeError.message));
          return;
        }

        resolve();
      },
    );
  });
}

export async function probeExtensionRuntime(args: {
  runtime: ChromeRuntimeLike | null;
  extensionId: string;
}) {
  await sendExtensionRuntimeMessage({
    runtime: args.runtime,
    extensionId: args.extensionId,
    message: buildExtensionConnectProbeMessage(),
  });
}

export async function handoffExtensionAuthToken(args: {
  runtime: ChromeRuntimeLike | null;
  extensionId: string;
  apiToken: string;
  appBaseUrl: string;
}) {
  await sendExtensionRuntimeMessage({
    runtime: args.runtime,
    extensionId: args.extensionId,
    message: buildExtensionAuthMessage({
      apiToken: args.apiToken,
      appBaseUrl: args.appBaseUrl,
    }),
  });
}

function buildExtensionTokenCacheKey(args: {
  extensionId: string;
  appBaseUrl: string;
}) {
  return `${EXTENSION_TOKEN_CACHE_KEY_PREFIX}:${args.appBaseUrl.trim()}:${args.extensionId.trim()}`;
}

export function readCachedExtensionAuthToken(args: {
  storage: BrowserStorageLike | null | undefined;
  extensionId: string;
  appBaseUrl: string;
  now?: Date;
}): { apiToken: string; expiresAt: string } | null {
  if (!args.storage) {
    return null;
  }

  const cacheKey = buildExtensionTokenCacheKey(args);

  try {
    const rawValue = args.storage.getItem(cacheKey);
    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as {
      apiToken?: unknown;
      expiresAt?: unknown;
    };
    const apiToken = typeof parsed.apiToken === "string" ? parsed.apiToken.trim() : "";
    const expiresAt = typeof parsed.expiresAt === "string" ? parsed.expiresAt.trim() : "";
    const expiresAtValue = Date.parse(expiresAt);

    if (!apiToken || !expiresAt || !Number.isFinite(expiresAtValue)) {
      args.storage.removeItem(cacheKey);
      return null;
    }

    const now = args.now ?? new Date();
    if (expiresAtValue <= now.getTime()) {
      args.storage.removeItem(cacheKey);
      return null;
    }

    return {
      apiToken,
      expiresAt,
    };
  } catch {
    try {
      args.storage.removeItem(cacheKey);
    } catch {
      // Ignore storage cleanup failures and fail closed.
    }

    return null;
  }
}

export function writeCachedExtensionAuthToken(args: {
  storage: BrowserStorageLike | null | undefined;
  extensionId: string;
  appBaseUrl: string;
  apiToken: string;
  expiresAt: string;
}) {
  if (!args.storage) {
    return;
  }

  try {
    args.storage.setItem(
      buildExtensionTokenCacheKey(args),
      JSON.stringify({
        apiToken: args.apiToken,
        expiresAt: args.expiresAt,
      }),
    );
  } catch {
    // Ignore storage failures and continue without local token reuse.
  }
}

export function clearCachedExtensionAuthToken(args: {
  storage: BrowserStorageLike | null | undefined;
  extensionId: string;
  appBaseUrl: string;
}) {
  if (!args.storage) {
    return;
  }

  try {
    args.storage.removeItem(buildExtensionTokenCacheKey(args));
  } catch {
    // Ignore storage failures and continue.
  }
}
