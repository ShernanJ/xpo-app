import test from "node:test";
import assert from "node:assert/strict";

import { prisma } from "../db.ts";
import {
  XPO_COMPANION_EXTENSION_SCOPE,
  hashExtensionToken,
  isExtensionTokenActive,
  issueExtensionApiToken,
  parseExtensionBearerToken,
} from "./auth.ts";

process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-session-secret";
process.env.EXTENSION_TOKEN_TTL_DAYS = process.env.EXTENSION_TOKEN_TTL_DAYS || "7";

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

test("issueExtensionApiToken revokes prior active tokens before issuing a replacement", async () => {
  const tokenDelegate = prisma.extensionApiToken as {
    updateMany: typeof prisma.extensionApiToken.updateMany;
    create: typeof prisma.extensionApiToken.create;
  };
  const originalUpdateMany = tokenDelegate.updateMany;
  const originalCreate = tokenDelegate.create;
  const calls: {
    updateMany?: unknown;
    create?: unknown;
  } = {};
  const now = new Date("2026-03-11T12:00:00.000Z");

  tokenDelegate.updateMany = (async (args) => {
    calls.updateMany = args;
    return { count: 1 };
  }) as typeof prisma.extensionApiToken.updateMany;
  tokenDelegate.create = (async (args) => {
    calls.create = args;
    return {} as never;
  }) as typeof prisma.extensionApiToken.create;

  try {
    const issued = await issueExtensionApiToken({
      userId: "user_1",
      name: "xpo-companion",
      now,
    });

    assert.match(issued.token, /^xpo_ext_/);
    assert.equal(issued.expiresAt, "2026-03-18T12:00:00.000Z");
    assert.deepEqual(calls.updateMany, {
      where: {
        userId: "user_1",
        scope: XPO_COMPANION_EXTENSION_SCOPE,
        revokedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      data: {
        revokedAt: now,
      },
    });
    assert.equal(
      (calls.create as { data: { expiresAt: Date; userId: string; name: string; scope: string } }).data.userId,
      "user_1",
    );
    assert.equal(
      (calls.create as { data: { expiresAt: Date; userId: string; name: string; scope: string } }).data.name,
      "xpo-companion",
    );
    assert.equal(
      (calls.create as { data: { expiresAt: Date; userId: string; name: string; scope: string } }).data.scope,
      XPO_COMPANION_EXTENSION_SCOPE,
    );
  } finally {
    tokenDelegate.updateMany = originalUpdateMany;
    tokenDelegate.create = originalCreate;
  }
});
