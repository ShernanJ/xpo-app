import test from "node:test";
import assert from "node:assert/strict";

import { repairAbruptEnding, stripThreadishLeadLabel } from "./draftCompletion.ts";

test("repairAbruptEnding trims dangling conjunction fragments", () => {
  assert.equal(
    repairAbruptEnding(
      "the tool gives simple prompts, tracks tweet performance, and sugge",
    ),
    "the tool gives simple prompts, tracks tweet performance",
  );
});

test("repairAbruptEnding leaves complete sentences alone", () => {
  const draft = "the tool gives simple prompts, tracks tweet performance, and suggests the next move.";
  assert.equal(repairAbruptEnding(draft), draft);
});

test("repairAbruptEnding trims short broken clause tails", () => {
  assert.equal(
    repairAbruptEnding(
      "growth on x feels like a different beast each day - algorithms shift, noise r",
    ),
    "growth on x feels like a different beast each day - algorithms shift",
  );
});

test("stripThreadishLeadLabel removes thread-style prefixes from standalone posts", () => {
  assert.equal(
    stripThreadishLeadLabel(
      "thread: after a decade off x i added one habit that jump-started my growth",
    ),
    "after a decade off x i added one habit that jump-started my growth",
  );
  assert.equal(
    stripThreadishLeadLabel("post 1: here's the lesson"),
    "here's the lesson",
  );
});
