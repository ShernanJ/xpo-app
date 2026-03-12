import test from "node:test";
import assert from "node:assert/strict";

import {
  XPO_COMPANION_EXTENSION_SCOPE,
  hashExtensionToken,
  isExtensionTokenActive,
  parseExtensionBearerToken,
} from "./auth.ts";

process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-session-secret";

test("parseExtensionBearerToken extracts bearer tokens", () => {
  assert.equal(parseExtensionBearerToken("Bearer abc123"), "abc123");
  assert.equal(parseExtensionBearerToken("bearer abc123"), "abc123");
  assert.equal(parseExtensionBearerToken("Token abc123"), null);
});

test("isExtensionTokenActive rejects revoked and expired tokens", () => {
  const now = new Date("2026-03-11T12:00:00.000Z");

  assert.equal(
    isExtensionTokenActive({
      scope: XPO_COMPANION_EXTENSION_SCOPE,
      expiresAt: new Date("2026-03-12T12:00:00.000Z"),
      now,
    }),
    true,
  );
  assert.equal(
    isExtensionTokenActive({
      scope: XPO_COMPANION_EXTENSION_SCOPE,
      expiresAt: new Date("2026-03-10T12:00:00.000Z"),
      now,
    }),
    false,
  );
  assert.equal(
    isExtensionTokenActive({
      scope: XPO_COMPANION_EXTENSION_SCOPE,
      expiresAt: new Date("2026-03-12T12:00:00.000Z"),
      revokedAt: new Date("2026-03-11T09:00:00.000Z"),
      now,
    }),
    false,
  );
  assert.equal(
    isExtensionTokenActive({
      scope: "other-extension-scope",
      expiresAt: new Date("2026-03-12T12:00:00.000Z"),
      now,
    }),
    false,
  );
});

test("hashExtensionToken is deterministic for the same token", () => {
  const token = "xpo_ext_token_sample";

  assert.equal(hashExtensionToken(token), hashExtensionToken(token));
  assert.notEqual(hashExtensionToken(token), hashExtensionToken(`${token}_other`));
});
