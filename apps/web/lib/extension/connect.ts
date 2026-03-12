export const EXTENSION_CONNECT_SOURCE = "xpo-companion";
export const EXTENSION_AUTH_MESSAGE_TYPE = "xpo:store-auth-token";

const CHROME_EXTENSION_ID_PATTERN = /^[a-p]{32}$/i;

export interface ChromeRuntimeLike {
  sendMessage: (
    extensionId: string,
    message: unknown,
    callback?: (response?: unknown) => void,
  ) => void;
  lastError?: { message?: string };
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

export function resolveCurrentAppBaseUrl(locationLike: { origin?: string | null }) {
  return locationLike.origin?.trim() || "";
}

export async function handoffExtensionAuthToken(args: {
  runtime: ChromeRuntimeLike | null;
  extensionId: string;
  apiToken: string;
  appBaseUrl: string;
}) {
  if (!args.runtime) {
    throw new Error("Chrome extension runtime is not available in this browser.");
  }

  await new Promise<void>((resolve, reject) => {
    args.runtime?.sendMessage(
      args.extensionId,
      buildExtensionAuthMessage({
        apiToken: args.apiToken,
        appBaseUrl: args.appBaseUrl,
      }),
      () => {
        const runtimeError = args.runtime?.lastError;
        if (runtimeError?.message) {
          reject(new Error(runtimeError.message));
          return;
        }

        resolve();
      },
    );
  });
}
