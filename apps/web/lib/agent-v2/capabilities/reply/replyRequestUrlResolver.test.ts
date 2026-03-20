import test from "node:test";
import assert from "node:assert/strict";

import {
  extractReplyRequestStatusDetailsFromHtml,
  isStandaloneXStatusUrl,
  resolveReplyRequestSourceFromSyndicationPayload,
} from "./replyRequestUrlResolver.ts";
import { parseXStatusUrl } from "./replyStatusUrl.ts";

test("parseXStatusUrl normalizes standard and i/web status links", () => {
  assert.deepEqual(
    parseXStatusUrl("https://twitter.com/Naval/status/123456789?utm_source=share"),
    {
      canonicalUrl: "https://x.com/naval/status/123456789",
      authorHandle: "naval",
      postId: "123456789",
    },
  );

  assert.deepEqual(parseXStatusUrl("https://x.com/i/web/status/987654321"), {
    canonicalUrl: "https://x.com/i/web/status/987654321",
    authorHandle: null,
    postId: "987654321",
  });

  assert.equal(isStandaloneXStatusUrl("https://x.com/i/status/42"), true);
  assert.equal(isStandaloneXStatusUrl("not a url"), false);
});

test("extractReplyRequestStatusDetailsFromHtml prefers structured tweet text and media", () => {
  const html = `
    <html>
      <head>
        <link rel="canonical" href="https://x.com/naval/status/123456789" />
        <meta property="og:description" content="naval on X: &quot;Short fallback&quot;" />
        <meta property="og:image" content="https://pbs.twimg.com/profile_images/avatar.jpg" />
        <meta property="og:image" content="https://pbs.twimg.com/media/post-image.jpg" />
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "SocialMediaPosting",
            "articleBody": "Specific knowledge is becoming the only durable leverage.",
            "image": [
              "https://pbs.twimg.com/media/post-image.jpg",
              "https://pbs.twimg.com/media/post-image-2.jpg"
            ],
            "author": {
              "@type": "Person",
              "alternateName": "@naval"
            }
          }
        </script>
      </head>
    </html>
  `;

  assert.deepEqual(
    extractReplyRequestStatusDetailsFromHtml({
      inputUrl: "https://x.com/i/web/status/123456789",
      html,
    }),
    {
      sourceText: "Specific knowledge is becoming the only durable leverage.",
      sourceUrl: "https://x.com/naval/status/123456789",
      authorHandle: "naval",
      imageUrls: [
        "https://pbs.twimg.com/media/post-image.jpg",
        "https://pbs.twimg.com/media/post-image-2.jpg",
      ],
    },
  );
});

test("extractReplyRequestStatusDetailsFromHtml returns null for generic status pages", () => {
  const html = `
    <html>
      <head>
        <title>X</title>
        <meta property="og:description" content="See new posts. Conversation. X. It's what's happening." />
      </head>
    </html>
  `;

  assert.equal(
    extractReplyRequestStatusDetailsFromHtml({
      inputUrl: "https://x.com/naval/status/123456789",
      html,
    }),
    null,
  );
});

test("resolveReplyRequestSourceFromSyndicationPayload captures quoted post context and images from both posts", () => {
  const resolved = resolveReplyRequestSourceFromSyndicationPayload({
    parsedUrl: {
      canonicalUrl: "https://x.com/elkelk/status/2034751673290350617",
      authorHandle: "elkelk",
      postId: "2034751673290350617",
    },
    payload: {
      id_str: "2034751673290350617",
      text: "Perfect algo pull",
      user: {
        screen_name: "elkelk",
      },
      quoted_tweet: {
        id_str: "2034700000000000000",
        text: "founder mode but the screenshot is doing half the work",
        user: {
          screen_name: "thejustinguo",
        },
        mediaDetails: [
          {
            type: "photo",
            media_url_https: "https://pbs.twimg.com/media/quoted-image.jpg",
            ext_alt_text: "Screenshot of a product mockup",
          },
        ],
      },
      mediaDetails: [
        {
          type: "photo",
          media_url_https: "https://pbs.twimg.com/media/primary-image.jpg",
          ext_alt_text: "Meme screenshot from the quoting post",
        },
      ],
    },
  });

  assert.ok(resolved);
  assert.equal(resolved?.sourceText, "Perfect algo pull");
  assert.equal(resolved?.sourceUrl, "https://x.com/elkelk/status/2034751673290350617");
  assert.equal(resolved?.authorHandle, "elkelk");
  assert.equal(resolved?.sourceContext.primaryPost.postType, "quote");
  assert.equal(
    resolved?.sourceContext.quotedPost?.text,
    "founder mode but the screenshot is doing half the work",
  );
  assert.equal(resolved?.sourceContext.quotedPost?.authorHandle, "thejustinguo");
  assert.equal(resolved?.sourceContext.media?.images.length, 2);
  assert.equal(
    resolved?.sourceContext.media?.images[0]?.imageUrl,
    "https://pbs.twimg.com/media/primary-image.jpg",
  );
  assert.equal(
    resolved?.sourceContext.media?.images[1]?.imageUrl,
    "https://pbs.twimg.com/media/quoted-image.jpg",
  );
  assert.equal(
    resolved?.sourceContext.media?.images[1]?.altText,
    "Quoted post image: Screenshot of a product mockup",
  );
});
