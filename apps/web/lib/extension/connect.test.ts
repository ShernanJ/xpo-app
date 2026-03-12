import test from "node:test";
import assert from "node:assert/strict";

import {
  EXTENSION_AUTH_MESSAGE_TYPE,
  EXTENSION_CONNECT_SOURCE,
  buildExtensionAuthMessage,
  handoffExtensionAuthToken,
  parseExtensionConnectParams,
  resolveCurrentAppBaseUrl,
} from "./connect.ts";

const validExtensionId = "abcdefghijklmnopabcdefghijklmnop";

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
