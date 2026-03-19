import test from "node:test";
import assert from "node:assert/strict";

import { normalizeDraftRevisionInstruction } from "./draftRevision.ts";

test("thread revision normalizer treats intro shorthand as an opener edit", () => {
  const directive = normalizeDraftRevisionInstruction(
    "add an intro",
    "Weak opener\n\n---\n\nProof\n\n---\n\nPayoff",
  );

  assert.equal(directive.scope, "thread_span");
  assert.deepEqual(directive.targetSpan, {
    startIndex: 0,
    endIndex: 0,
  });
  assert.equal(directive.threadIntent, "opening");
});

test("thread revision normalizer treats opener shorthand as the opening span", () => {
  const directive = normalizeDraftRevisionInstruction(
    "the opener",
    "Weak opener\n\n---\n\nProof\n\n---\n\nPayoff",
  );

  assert.equal(directive.scope, "thread_span");
  assert.deepEqual(directive.targetSpan, {
    startIndex: 0,
    endIndex: 0,
  });
  assert.equal(directive.threadIntent, "opening");
});

test("thread revision normalizer prefers opening intent over explicit post targeting for intro notes on post 1", () => {
  const directive = normalizeDraftRevisionInstruction(
    "needs an intro in post 1",
    "Weak opener\n\n---\n\nProof\n\n---\n\nPayoff",
  );

  assert.equal(directive.scope, "thread_span");
  assert.deepEqual(directive.targetSpan, {
    startIndex: 0,
    endIndex: 0,
  });
  assert.equal(directive.threadIntent, "opening");
});

test("thread revision normalizer treats entire post wording as a whole-thread edit", () => {
  const directive = normalizeDraftRevisionInstruction(
    "the entire post",
    "Weak opener\n\n---\n\nProof\n\n---\n\nPayoff",
  );

  assert.equal(directive.scope, "whole_draft");
  assert.equal(directive.targetSpan, null);
  assert.equal(directive.threadIntent, "whole_thread");
  assert.equal(directive.preserveThreadStructure, true);
});

test("thread collapse requests become longform single-post conversions when the single-post limit is verified-sized", () => {
  const directive = normalizeDraftRevisionInstruction(
    "Collapse this thread into one standalone X post",
    "Weak opener\n\n---\n\nProof\n\n---\n\nPayoff",
    undefined,
    25_000,
  );

  assert.equal(directive.scope, "whole_draft");
  assert.equal(directive.targetFormat, "longform");
  assert.match(directive.instruction, /one coherent longform version/i);
});

test("thread collapse requests stay shortform when the single-post limit is unverified-sized", () => {
  const directive = normalizeDraftRevisionInstruction(
    "Collapse this thread into one standalone X post",
    "Weak opener\n\n---\n\nProof\n\n---\n\nPayoff",
    undefined,
    280,
  );

  assert.equal(directive.scope, "whole_draft");
  assert.equal(directive.targetFormat, "shortform");
  assert.match(directive.instruction, /under 280 weighted characters/i);
});
