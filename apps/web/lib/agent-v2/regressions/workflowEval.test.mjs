import test from "node:test";
import assert from "node:assert/strict";

import { mapControllerActionToIntent } from "../agents/controller.ts";
import { buildExtensionReplyOptions } from "../../extension/replyOptions.ts";
import { buildExtensionReplyDraft } from "../../extension/replyDraft.ts";
import {
  CONTROLLER_WORKFLOW_EVAL_FIXTURES,
  REPLY_WORKFLOW_EVAL_FIXTURES,
} from "./workflowEvalFixtures.ts";

for (const fixture of CONTROLLER_WORKFLOW_EVAL_FIXTURES) {
  test(`eval [${fixture.category}]: ${fixture.name}`, () => {
    const intent = mapControllerActionToIntent({
      action: fixture.action,
      memory: fixture.memory,
    });

    assert.equal(intent, fixture.expectedIntent);
  });
}

for (const fixture of REPLY_WORKFLOW_EVAL_FIXTURES) {
  if (fixture.kind === "options") {
    test(`eval [${fixture.category}]: ${fixture.name}`, () => {
      const result = buildExtensionReplyOptions(fixture.payload);

      assert.equal(result.options.length >= 1 && result.options.length <= 3, true);
      assert.equal(new Set(result.options.map((option) => option.text)).size, result.options.length);
      assert.equal(result.groundingNotes.length > 0, true);
      assert.equal(
        result.options.every((option) => /\b(i|we|my|our)\b/i.test(option.text) === false),
        true,
      );
    });
    continue;
  }

  test(`eval [${fixture.category}]: ${fixture.name}`, () => {
    const result = buildExtensionReplyDraft(fixture.payload);

    assert.equal(result.response.options.length, 2);
    for (const option of result.response.options) {
      assert.equal(/\b(i|we|my|our)\b/i.test(option.text), false);
      assert.equal(/\b\d[\d,.%]*\b/.test(option.text), false);
      assert.equal(option.text.length > 20, true);
    }
  });
}
