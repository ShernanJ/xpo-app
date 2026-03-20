import { expect, test } from "vitest";

import { buildReplyPreviewMediaItems } from "./replySourcePreview";

test("buildReplyPreviewMediaItems dedupes image entries that share the same url", () => {
  const media = buildReplyPreviewMediaItems({
    images: [
      {
        imageUrl: "https://pbs.twimg.com/media/reply-proof.jpg?format=jpg&name=large",
        altText: "First caption",
      },
      {
        imageUrl: "https://pbs.twimg.com/media/reply-proof.jpg?format=jpg&name=large",
        altText: "Second caption",
      },
    ],
    hasVideo: false,
    hasGif: false,
  });

  expect(media).toHaveLength(1);
  expect(media[0]).toMatchObject({
    type: "image",
    url: "https://pbs.twimg.com/media/reply-proof.jpg?format=jpg&name=large",
    altText: "First caption",
  });
});
