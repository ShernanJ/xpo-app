import test from "node:test";
import assert from "node:assert/strict";

import {
  getActiveHandle,
  parseCreateSourceMaterialBody,
  parsePatchSourceMaterialBody,
} from "./route.logic.ts";

test("getActiveHandle normalizes x handles for source materials", () => {
  assert.equal(
    getActiveHandle({ user: { activeXHandle: " @StanDev " } }),
    "standev",
  );
  assert.equal(getActiveHandle({ user: { activeXHandle: "" } }), null);
});

test("create source material body is normalized before persistence", () => {
  const result = parseCreateSourceMaterialBody({
    asset: {
      type: "story",
      title: "  Launch Story  ",
      tags: ["Launch", " launch ", "xpo"],
      verified: true,
      claims: ["I launched Xpo in public", "I launched Xpo in public"],
      snippets: ["  kept the rollout intentionally small "],
      doNotClaim: ["I had 50k users"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.asset.title, "Launch Story");
  assert.deepEqual(result.asset.tags, ["launch", "xpo"]);
  assert.deepEqual(result.asset.claims, ["I launched Xpo in public"]);
});

test("patch source material body rejects empty patches", () => {
  const result = parsePatchSourceMaterialBody({
    asset: {},
  });

  assert.equal(result.ok, false);
});

test("patch source material body preserves partial normalized updates", () => {
  const result = parsePatchSourceMaterialBody({
    asset: {
      verified: true,
      tags: [" Product ", "product"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.deepEqual(result.asset, {
    verified: true,
    tags: ["product"],
  });
});
