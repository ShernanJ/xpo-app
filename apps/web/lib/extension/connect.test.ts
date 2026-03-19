import test from "node:test";
import assert from "node:assert/strict";

import {
  EXTENSION_AUTH_MESSAGE_TYPE,
  EXTENSION_CONNECT_SOURCE,
  EXTENSION_CONNECT_PROBE_MESSAGE_TYPE,
  buildExtensionAuthMessage,
  buildExtensionConnectProbeMessage,
  clearCachedExtensionAuthToken,
  handoffExtensionAuthToken,
  parseExtensionConnectParams,
  probeExtensionRuntime,
  readCachedExtensionAuthToken,
  resolveCurrentAppBaseUrl,
  writeCachedExtensionAuthToken,
} from "./connect.ts";

const validExtensionId = "abcdefghijklmnopabcdefghijklmnop";

function createStorageStub() {
  const store = new Map<string, string>();

  return {
    storage: {
      getItem(key: string) {
        return store.has(key) ? store.get(key) ?? null : null;
      },
      setItem(key: string, value: string) {
        store.set(key, value);
      },
      removeItem(key: string) {
        store.delete(key);
      },
    },
    peek(keyPart: string) {
      return Array.from(store.entries()).find(([key]) => key.includes(keyPart)) ?? null;
    },
  };
}

test("parseExtensionConnectParams accepts the expected source and extension id", () => {
  const parsed = parseExtensionConnectParams({
    extensionId: validExtensionId,
    source: EXTENSION_CONNECT_SOURCE,
  });

  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }

  assert.equal(parsed.extensionId, validExtensionId);
});

test("parseExtensionConnectParams rejects invalid source and extension ids", () => {
  assert.equal(
    parseExtensionConnectParams({
      extensionId: validExtensionId,
      source: "other-source",
    }).ok,
    false,
  );
  assert.equal(
    parseExtensionConnectParams({
      extensionId: "bad-id",
      source: EXTENSION_CONNECT_SOURCE,
    }).ok,
    false,
  );
});

test("buildExtensionConnectProbeMessage returns the extension probe contract", () => {
  assert.deepEqual(buildExtensionConnectProbeMessage(), {
    type: EXTENSION_CONNECT_PROBE_MESSAGE_TYPE,
  });
});

test("buildExtensionAuthMessage returns the extension handoff contract", () => {
  assert.deepEqual(
    buildExtensionAuthMessage({
      apiToken: "token_123",
      appBaseUrl: "https://app.example.com",
    }),
    {
      type: EXTENSION_AUTH_MESSAGE_TYPE,
      payload: {
        apiToken: "token_123",
        appBaseUrl: "https://app.example.com",
      },
    },
  );
});

test("probeExtensionRuntime sends a harmless reachability probe", async () => {
  let captured = null;
  await probeExtensionRuntime({
    runtime: {
      sendMessage(extensionId, message, callback) {
        captured = { extensionId, message };
        callback?.();
      },
    },
    extensionId: validExtensionId,
  });

  assert.deepEqual(captured, {
    extensionId: validExtensionId,
    message: {
      type: EXTENSION_CONNECT_PROBE_MESSAGE_TYPE,
    },
  });
});

test("handoffExtensionAuthToken sends the expected runtime message", async () => {
  let captured = null;
  await handoffExtensionAuthToken({
    runtime: {
      sendMessage(extensionId, message, callback) {
        captured = { extensionId, message };
        callback?.();
      },
    },
    extensionId: validExtensionId,
    apiToken: "token_123",
    appBaseUrl: "https://app.example.com",
  });

  assert.deepEqual(captured, {
    extensionId: validExtensionId,
    message: {
      type: EXTENSION_AUTH_MESSAGE_TYPE,
      payload: {
        apiToken: "token_123",
        appBaseUrl: "https://app.example.com",
      },
    },
  });
});

test("handoffExtensionAuthToken surfaces runtime errors", async () => {
  await assert.rejects(
    handoffExtensionAuthToken({
      runtime: {
        lastError: { message: "Extension not found" },
        sendMessage(_extensionId, _message, callback) {
          callback?.();
        },
      },
      extensionId: validExtensionId,
      apiToken: "token_123",
      appBaseUrl: "https://app.example.com",
    }),
    /Extension not found/i,
  );
});

test("resolveCurrentAppBaseUrl reads the current origin", () => {
  assert.equal(
    resolveCurrentAppBaseUrl({ origin: "https://app.example.com" }),
    "https://app.example.com",
  );
});

test("cached extension auth tokens round-trip until cleared", () => {
  const storageStub = createStorageStub();

  writeCachedExtensionAuthToken({
    storage: storageStub.storage,
    extensionId: validExtensionId,
    appBaseUrl: "https://app.example.com",
    apiToken: "token_123",
    expiresAt: "2026-04-01T00:00:00.000Z",
  });

  assert.deepEqual(
    readCachedExtensionAuthToken({
      storage: storageStub.storage,
      extensionId: validExtensionId,
      appBaseUrl: "https://app.example.com",
      now: new Date("2026-03-18T00:00:00.000Z"),
    }),
    {
      apiToken: "token_123",
      expiresAt: "2026-04-01T00:00:00.000Z",
    },
  );

  clearCachedExtensionAuthToken({
    storage: storageStub.storage,
    extensionId: validExtensionId,
    appBaseUrl: "https://app.example.com",
  });

  assert.equal(
    readCachedExtensionAuthToken({
      storage: storageStub.storage,
      extensionId: validExtensionId,
      appBaseUrl: "https://app.example.com",
      now: new Date("2026-03-18T00:00:00.000Z"),
    }),
    null,
  );
});

test("readCachedExtensionAuthToken drops expired cache entries", () => {
  const storageStub = createStorageStub();

  writeCachedExtensionAuthToken({
    storage: storageStub.storage,
    extensionId: validExtensionId,
    appBaseUrl: "https://app.example.com",
    apiToken: "token_123",
    expiresAt: "2026-03-17T23:59:59.000Z",
  });

  assert.equal(
    readCachedExtensionAuthToken({
      storage: storageStub.storage,
      extensionId: validExtensionId,
      appBaseUrl: "https://app.example.com",
      now: new Date("2026-03-18T00:00:00.000Z"),
    }),
    null,
  );
  assert.equal(storageStub.peek(validExtensionId), null);
});
