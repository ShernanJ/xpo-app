# Scraping Architecture

This document describes the current scraping logic in the project and how the scrape stack is intended to scale.

The system is scrape-first.
The goal is to get enough signal from X to:

- identify the user's profile and account context
- understand what they post about
- measure what works and what does not
- persist a canonical capture that downstream product surfaces can reuse

## Core Principle

There are two different scrape depths:

1. lightweight profile preview
2. full onboarding bootstrap scrape

They serve different jobs and should stay separate.

The preview step confirms identity.
The bootstrap step gathers enough recent posts and engagement data to power onboarding analysis.

## 1. Lightweight Profile Preview

Purpose:

- confirm that the entered handle is the intended account
- show fast UI feedback before a full scrape
- avoid paying the cost of a timeline scrape when the user is still typing

Current behavior:

- the app calls `GET /api/onboarding/preview?account=<username>`
- this returns either a minimal public profile or `preview: null`

Data returned when available:

- profile photo
- display name
- username
- followers
- following
- verified status

### Preview source order

The preview resolver is intentionally layered from best to worst:

1. cached scrape capture
2. X `UserByScreenName` GraphQL (guest flow)
3. X syndication follow-button endpoint
4. X `users/show.json` (authenticated cookie flow, if configured)
5. public profile HTML parsing
6. `x.com/<username>/photo` avatar fallback

Why this order:

- cache is fastest and already canonical
- `UserByScreenName` matches how X's own web app resolves a profile
- syndication is lightweight and public
- `users/show` is useful but depends on auth state
- HTML parsing is the least stable fallback

### Preview design constraint

Preview is best-effort.

If it fails, onboarding should still be able to continue.
Preview should never be the only path to progress.

## 2. Onboarding Bootstrap Scrape

Purpose:

- create the first canonical capture for a user
- fetch enough recent posts to infer style, niche, and early performance patterns

This is the deeper scrape used to power onboarding analysis.

Current behavior:

- the app checks for a cached scrape capture for the requested account
- if a capture already exists, onboarding reads it
- if no capture exists, onboarding runs a bootstrap scrape and persists the result
- the bootstrap path now requests multiple `UserTweets` pages by default and keeps up to a bounded recent-post cap for onboarding analysis

The bootstrap scrape uses the HTTP scraper, not Playwright.

Primary script:

- `apps/web/scripts/scrape-user-tweets-http.mjs`

This script is responsible for:

- resolving the target account's `rest_id`
- discovering the web bearer token when needed
- discovering X GraphQL query ids when needed
- calling `UserTweets`
- saving raw payloads
- optionally importing the payload into the onboarding scrape store

### Bootstrap source and request flow

The HTTP scraper generally follows this sequence:

1. normalize the handle
2. resolve a usable authenticated or guest session
3. resolve the target user id (`rest_id`)
4. discover the `UserTweets` query id if it is not cached
5. call the X GraphQL `UserTweets` endpoint
6. follow the `Bottom` cursor for a small fixed number of pages
7. parse and normalize the payload
8. persist the canonical capture

The result becomes the canonical onboarding record used by the rest of the app.

Current onboarding target:

- default bootstrap depth: `5` pages
- default page size: `40`
- current normalized post cap: `250`

This is intentionally deeper than the original first pass, but still bounded so onboarding does not turn into an unbounded full-history crawl.

### UserTweets pagination

`UserTweets` is cursor-based.

The first response typically contains a `TimelineTimelineCursor` entry with `cursorType: "Bottom"`.

To fetch more posts, the scraper reuses the same `UserTweets` operation and sends:

- the same `userId`
- the same `count`
- `variables.cursor = <bottom cursor>`

The current implementation keeps this bounded for onboarding by fetching only a small fixed number of pages, rather than scrolling indefinitely.

## 3. Canonical Capture

A successful onboarding scrape is normalized into:

- profile
- recent original posts
- recent replies (stored separately from originals)
- source metadata

The canonical capture is stored in the scrape store and acts as the main input for:

- onboarding analysis
- performance modeling
- later drafting and strategy logic

This means user-facing flows should read cached captures whenever possible, not re-scrape on every page load.

### Separate post lanes

The canonical capture should now preserve at least two content lanes:

1. original posts
2. replies

Why:

- original posts are the safer source for voice, topic, and standalone drafting strategy
- replies matter for distribution and conversational behavior, especially for early-stage growth

These should stay separate in normalized storage so the product can:

- build the main creator model from original posts
- build a reply-behavior model for later extension workflows

The onboarding model should not blindly mix replies into the primary post lane.

## 4. Shared Scraper Infrastructure

The scraper stack is designed to reuse shared infrastructure across flows.

### Session broker

The HTTP scraper uses a session broker to manage account/session usage.

Responsibilities:

- session selection
- cooldown handling
- per-session request budgets
- minimum spacing between requests
- shared cache values (for example query ids and discovered ids)

This allows the system to rotate across multiple X sessions instead of hammering one account.

### Parser and normalizer

Raw X payloads are not used directly by the app.

They are normalized into internal types so the rest of the product can work with:

- stable profile fields
- stable post fields
- derived metrics

This keeps product code isolated from X response shape changes.

### Scrape store

The scrape store persists normalized captures.

Its job is simple:

- append new captures
- read the latest capture by account
- provide recent capture history

This is the local persistence layer used by the current MVP.

## 5. Planned Async Enrichment Scrape

There is a second scrape lane planned beyond onboarding.

Purpose:

- scrape anchor accounts in the background
- learn which structures, formats, and hooks already win in a niche
- feed benchmark intelligence into drafting and post recommendations

This should not be a separate scraper stack.

It should reuse:

- the same session broker
- the same HTTP executor
- the same parser/normalizer

The difference is job priority and target accounts, not different infrastructure.

### Two scrape lanes

The long-term shape is:

1. `onboarding_bootstrap`
   - high priority
   - low volume
   - latency sensitive

2. `niche_enrichment`
   - lower priority
   - higher volume
   - asynchronous

This prevents enrichment traffic from starving onboarding.

## 6. Error Handling Model

Scrape failures should be classified before retrying.

### Session-scoped failures

These are failures where rotating to another session may help:

- `403`
- `429`
- expired auth
- invalid cookie / CSRF pair
- temporary network edge failure

Correct behavior:

- cooldown the session
- release the lease
- retry the job on another session

### Job-scoped failures

These are failures where changing sessions usually will not help:

- private account
- suspended or missing account
- parser mismatch
- endpoint shape drift
- invalid request payload

Correct behavior:

- fail the job
- surface the real error
- avoid burning through every session in the pool

## 7. Scaling Model

The correct scaling model is:

- multiple workers
- shared session broker
- shared persistent state
- reusable executor

Workers are compute.
Sessions are identities.
The broker assigns identities to workers.

The system should scale by adding managed session entries, not by hardcoding more env vars.

### Best-practice production shape

1. secret manager for sensitive credentials
2. database or Redis for session metadata and leases
3. queue with priority lanes
4. workers that acquire and release session leases

Sensitive credentials include:

- `auth_token`
- `ct0`
- any session-specific cookie state

These should not be committed, hardcoded, or baked into images.

## 8. Why We Separate Preview vs Bootstrap

This separation is important because the product experience depends on it.

Preview:

- fast
- lightweight
- identity confirmation
- best-effort

Bootstrap scrape:

- slower
- higher signal
- canonical capture creation
- required for real onboarding analysis

Mixing them creates bad UX and unnecessary load.

## 9. Current Practical Constraint

The current implementation is still MVP-oriented:

- preview runs inline
- onboarding bootstrap can run inline on cache miss
- the scrape store is local
- the broker is currently file-backed

That is acceptable for local development and early validation.

The next production-grade evolution is:

1. make onboarding bootstrap an explicit queued job
2. persist broker state in shared infrastructure
3. keep user-facing pages reading cached captures

## 10. Summary

The scrape system currently has three logical layers:

1. profile preview resolver
2. onboarding bootstrap scraper
3. shared broker + parser + store

And it is intended to evolve into one ingestion platform with two job lanes:

- onboarding bootstrap
- niche enrichment

That keeps the scrape system fast for users, reusable for product intelligence, and scalable without changing the core architecture.
