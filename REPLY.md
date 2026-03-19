# Reply Engine Contract

This file is the shared contract for reply generation across the extension and creator chat reply flow.

## Goal

Generate replies that sound like the creator actually wrote them.

Rules:
- Match creator casing, pacing, vocabulary, and sentence shape.
- Prefer native X reply shapes: agreement, pushback, add-on, observation, question, or short riff.
- Never sound like an assistant, consultant, ghostwriter, or generic AI.
- No hashtags.
- No emojis.
- No markdown.
- No bullets or numbered lists.
- No preamble, pleasantries, or internal reasoning.
- Do not invent personal experience, metrics, proof, or adjacent context.

## Canonical Source Schema

Internal reply generation standard:

```ts
type ReplySourceContext = {
  primaryPost: {
    id: string
    url: string | null
    text: string
    authorHandle: string | null
    postType: "original" | "reply" | "quote" | "repost" | "unknown"
  }
  quotedPost?: {
    id: string | null
    url: string | null
    text: string
    authorHandle: string | null
  } | null
  media?: {
    images: Array<{
      imageUrl?: string | null
      imageDataUrl?: string | null
      altText?: string | null
    }>
    hasVideo: boolean
    hasGif: boolean
    hasLink: boolean
  } | null
  conversation?: {
    inReplyToPostId?: string | null
    inReplyToHandle?: string | null
  } | null
}
```

Extension request compatibility:
- Legacy flat fields still work: `tweetId`, `tweetText`, `authorHandle`, `tweetUrl`.
- New optional fields supported: `postType`, `quotedPost`, `media`, `conversation`.
- The server normalizes all of them into `ReplySourceContext` before prompt construction.

## Context Precedence

Use source context in this order:

1. Visible post text in `primaryPost`.
2. Quoted post text in `quotedPost`.
3. Image/OCR summary from `media.images`.
4. Creator voice evidence.
5. Reply insights and durable facts.

Quote-tweet rule:
- Respond to the visible quote-tweet text first.
- Use the quoted post only as supporting context unless the visible text is empty.

Media rule:
- If an image exists, run vision once.
- Inject a short visual/OCR summary into grounding.
- If vision fails, continue with text-only generation.

## Prompt Recipe

System prompt must include:
- hard output rules
- voice fidelity rules
- quote/media handling rules
- creator profile hints
- lane-specific voice evidence from reply/quote anchors
- reply analytics
- grounding packet

Prompt packet order:
1. Primary visible post
2. Quoted post
3. Image context
4. Creator voice evidence
5. Reply insights
6. Durable facts

Voice controls:
- Use `voiceTarget` lane `reply` for normal replies.
- Use `voiceTarget` lane `quote` when `quotedPost` exists.

## Banned Patterns

Reject or retry drafts that use patterns like:
- `the real issue is`
- `the real hinge is`
- `the real leak is`
- `here's the framework`
- `level up`
- `high-ROI`
- `operator`
- `it pays dividends`

Also reject:
- assistant preambles
- list formatting
- invented proof
- topic pivots that leave the actual conversation

## Streaming Rules

Extension reply streaming returns only plain text.

Requirements:
- stream raw drafted tweet text only
- strip labels like `Reply:` or `Draft:`
- strip markdown markers, hashtags, emoji wrappers, and bullet markers
- do not stream commentary or chain-of-thought

If the streamed completion is empty:
- retry with a non-streaming completion
- allow model fallback
- still return only final reply text

## Fallback Behavior

Fallback order:
1. Primary streaming model
2. Non-streaming retry on the same model
3. Non-streaming fallback model
4. Heuristic fallback only when Groq is unavailable or unusable

Heuristic fallback must still:
- stay anchored to the source post
- avoid generic agreement
- avoid invented first-person proof
- stay short and native to replies

## Worked Examples

### Text-only reply

Source:
- `Replies only work when they add a real layer instead of agreement.`

Good direction:
- `yeah. otherwise the reply reads true but doesn't actually move the point anywhere.`

### Quote-tweet reply

Visible post:
- `lwk thought that i was the only one that was frustrated with the ux`

Quoted post:
- `the new posthog website is a prime example... the UX absolutely sucks...`

Good direction:
- `same. thought i was being dramatic the first time i used it. turns out the ux really is doing too much.`

Bad direction:
- pivots into hiring systems, data flow, or generic workflow advice

### Image-backed reply

Source:
- post has screenshot(s)

Good direction:
- use OCR or visible UI details only if they sharpen the reply
- do not suddenly describe the image if the reply is really about the opinion around it
