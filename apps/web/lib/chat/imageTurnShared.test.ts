import assert from "node:assert/strict";
import test from "node:test";

import {
  buildImageAssistantDescription,
  buildImageIdeationQuickReplies,
} from "./imageTurnShared.ts";

const visualContext = {
  primary_subject: "a founder at a laptop",
  setting: "a bright home office",
  lighting_and_mood: "warm and focused",
  any_readable_text: "ship the update",
  key_details: ["coffee mug", "analytics dashboard", "notebook"],
};

test("buildImageAssistantDescription asks whether the user wants a post", () => {
  const description = buildImageAssistantDescription(visualContext);

  assert.match(description, /I see you sent an image of a founder at a laptop/i);
  assert.match(description, /Did you want to write a post on this image\?/);
});

test("buildImageIdeationQuickReplies carries supportAsset and imageAssetId", () => {
  const quickReplies = buildImageIdeationQuickReplies({
    angles: [
      "Question hook post from the image.",
      "Relatable take post from the image.",
      "Bold statement post from the image.",
    ],
    supportAsset: "Image anchor: a founder at a laptop.",
    imageAssetId: "chat-media-1",
  });

  assert.equal(quickReplies.length, 3);
  assert.deepEqual(
    quickReplies.map((quickReply) => quickReply.imageAssetId),
    ["chat-media-1", "chat-media-1", "chat-media-1"],
  );
  assert.deepEqual(
    quickReplies.map((quickReply) => quickReply.kind),
    ["ideation_angle", "ideation_angle", "ideation_angle"],
  );
});
