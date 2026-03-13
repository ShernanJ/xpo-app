import test from "node:test";
import assert from "node:assert/strict";

import { buildDraftArtifact, inferThreadFramingStyleFromPrompt } from "./draftArtifacts.ts";

function buildThreadArtifact(content) {
  return buildDraftArtifact({
    id: "thread-seed-1",
    title: "Thread",
    kind: "thread_seed",
    content,
    supportAsset: null,
  });
}

test("generic educational thread prompts default to soft-signal framing", () => {
  assert.equal(
    inferThreadFramingStyleFromPrompt(
      "write me a thread breaking down the hiring playbook we used",
    ),
    "soft_signal",
  );
});

test("explicit numbering requests still resolve to numbered framing", () => {
  assert.equal(
    inferThreadFramingStyleFromPrompt(
      "write me a numbered x/x thread with 1/5 style labels",
    ),
    "numbered",
  );
});

test("no-numbering requests resolve to natural framing", () => {
  assert.equal(
    inferThreadFramingStyleFromPrompt(
      "turn this into a thread without x/x numbering",
    ),
    "none",
  );
});

test("thread artifacts split numbered x/x threads without explicit delimiters", () => {
  const artifact = buildThreadArtifact(
    [
      "1/3 why most ai writing tools still feel like interns with a checklist",
      "2/3 the problem is they lose context and start every turn from scratch",
      "3/3 continuity is what makes the output feel like one operator instead of six prompts",
    ].join("\n\n"),
  );

  assert.equal(artifact.posts.length, 3);
  assert.equal(artifact.posts[0]?.content.startsWith("1/3"), true);
  assert.equal(artifact.posts[1]?.content.startsWith("2/3"), true);
  assert.equal(artifact.posts[2]?.content.startsWith("3/3"), true);
  assert.equal(artifact.threadFramingStyle, "numbered");
});

test("thread artifacts split single-line numbered threads on strong boundary markers", () => {
  const artifact = buildThreadArtifact(
    [
      "1. lead with the tension, not the feature list",
      "2. use one concrete proof point instead of three vague promises",
      "3. close with the sharper implication, not a generic cta",
    ].join("\n"),
  );

  assert.equal(artifact.posts.length, 3);
  assert.equal(artifact.posts[0]?.content.startsWith("1."), true);
  assert.equal(artifact.posts[1]?.content.startsWith("2."), true);
  assert.equal(artifact.posts[2]?.content.startsWith("3."), true);
  assert.equal(artifact.threadFramingStyle, "numbered");
});

test("thread artifacts split Post/Tweet label formats without explicit delimiters", () => {
  const artifact = buildThreadArtifact(
    [
      "Post 1: the old flow made the assistant sound like it was reading logs",
      "Tweet 2: the fix is keeping machine state in structured context instead of transcript text",
      "Post 3: once the history reads like a real chat, the model stops sounding staged",
    ].join("\n"),
  );

  assert.equal(artifact.posts.length, 3);
  assert.equal(artifact.posts[0]?.content.startsWith("Post 1:"), true);
  assert.equal(artifact.posts[1]?.content.startsWith("Tweet 2:"), true);
  assert.equal(artifact.posts[2]?.content.startsWith("Post 3:"), true);
});

test("thread artifacts cap oversized one-block fallbacks to six posts", () => {
  const artifact = buildThreadArtifact(
    [
      "first lesson is that continuity matters more than extra orchestration because the model writes better when it remembers where the conversation is going.",
      "second lesson is that grounding should constrain facts without flattening the writer into generic filler.",
      "third lesson is that users notice stiffness faster than they notice architecture, so polish has to start with the transcript they implicitly read.",
      "fourth lesson is that thread beats work better when each post carries one clean move instead of trying to summarize the whole argument at once.",
      "fifth lesson is that revision should stay local unless the user clearly asks to re-angle the whole draft.",
      "sixth lesson is that strong defaults beat fragile branchy heuristics when the model misses an output delimiter.",
      "seventh lesson is that recovery paths need to preserve intent, not just produce valid formatting.",
      "eighth lesson is that deterministic fallbacks should help the model land, not make the product feel scripted.",
    ].join(" "),
  );

  assert.equal(artifact.posts.length, 6);
  assert.equal(artifact.posts[0]?.content.includes("first lesson"), true);
  assert.equal(artifact.posts[5]?.content.length > 0, true);
});
