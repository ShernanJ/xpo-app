# Xpo Extension -> Backend Integration Handoff

Date: 2026-03-05

This document describes what the extension currently does and what the Xpo backend agent needs to implement to complete production integration.

## 1) Current Extension State

The extension is a Chromium MV3 sidepanel companion for X/Twitter.

### What is already implemented

- Content script on `x.com` and `twitter.com`.
- In-feed opportunity detection per tweet.
- Deterministic opportunity scoring (local heuristic).
- Small branded indicator inserted left of the reply icon.
- Click indicator to expand an in-feed info panel.
- In-feed panel button opens browser sidepanel.
- Sidepanel UI for context, stage/tone/goal controls, and draft generation.
- Popup UI for settings, local/prod app presets, and account connect flow.
- Extension token auth path (not cookie auth) wired in background worker.
- Fallback local draft generation if backend is unavailable or token missing.
- Local learning logs stored in extension storage (`xpo.replyLogs`).

### Local + prod environments currently supported

- Local: `http://localhost:3000`
- Prod: `https://xpo.lol`

These are already in:

- `host_permissions`
- `externally_connectable`
- Popup presets (`Use local`, `Use prod`)

## 2) Runtime Flow (As Built)

1. User browses X feed.
2. Extension parses each tweet and computes an opportunity score.
3. User clicks the small Xpo indicator.
4. Info panel expands inline.
5. User clicks `Open Sidepanel`.
6. Background stores selected opportunity (`xpo.activeOpportunity`) and opens sidepanel.
7. Sidepanel reads selected opportunity and user settings.
8. User clicks `Generate reply options`.
9. Background calls backend `POST /api/extension/reply-draft` using `Authorization: Bearer <apiToken>`.
10. If request fails, extension returns local fallback safe/bold drafts.

## 3) Contracts the Backend Must Match

## 3.1 Draft request payload (`POST /api/extension/reply-draft`)

```json
{
  "tweetId": "string",
  "tweetText": "string",
  "authorHandle": "string",
  "tweetUrl": "string",
  "stage": "0_to_1k | 1k_to_10k | 10k_to_50k | 50k_plus",
  "tone": "dry | bold | builder | warm",
  "goal": "string"
}
```

## 3.2 Draft response payload (required shape)

```json
{
  "options": [
    { "id": "safe-1", "label": "safe", "text": "..." },
    { "id": "bold-1", "label": "bold", "text": "..." }
  ],
  "notes": ["optional note"]
}
```

Notes:

- `options` must contain at least one valid item.
- `label` must be exactly `safe` or `bold`.
- If response shape is invalid, extension will fallback locally.

## 3.3 External connect message (web app -> extension)

The extension background listens to `chrome.runtime.onMessageExternal`.

Accepted message types:

- `xpo:ping`
- `xpo:store-auth-token`

Token storage message format:

```json
{
  "type": "xpo:store-auth-token",
  "payload": {
    "apiToken": "string (min length 24)",
    "appBaseUrl": "optional string"
  }
}
```

Web app must call:

```ts
chrome.runtime.sendMessage(extensionId, {
  type: 'xpo:store-auth-token',
  payload: {
    apiToken,
    appBaseUrl: window.location.origin,
  },
});
```

## 4) Backend Work Required

Implement these pieces in `stanley-x-mvp`.

### 4.1 Connect page

Route:

- `GET /extension/connect?extensionId=<chrome-extension-id>&source=xpo-companion`

Behavior:

1. Require authenticated web session (NextAuth).
2. If unauthenticated, redirect to `/login` and return back.
3. Mint extension API token for current user.
4. Call `chrome.runtime.sendMessage(extensionId, { type: 'xpo:store-auth-token', payload: { apiToken, appBaseUrl }})` in browser JS.
5. Show success/failure UI.

### 4.2 Token issuance endpoint

Route:

- `POST /api/extension/token`

Behavior:

- Requires NextAuth session.
- Creates a scoped extension token bound to `userId`.
- Returns token once.

Suggested response:

```json
{ "ok": true, "token": "...", "expiresAt": "ISO" }
```

### 4.3 Draft endpoint

Route:

- `POST /api/extension/reply-draft`

Behavior:

- Authenticate via Bearer token (not cookie).
- Validate token and resolve `userId` + active profile context.
- Generate safe/bold reply options using Xpo orchestration.
- Return response in required shape above.

### 4.4 Optional analytics endpoint (future)

Currently logs are local-only. If you want server learning:

- Add `POST /api/extension/reply-log`
- Accept reply metadata and store for postmortem loop

## 5) Auth + Security Requirements

- Do not rely on extension sharing NextAuth cookie context.
- Use dedicated extension token auth.
- Store token hash server-side (never plaintext after issue).
- Include expiry and rotation strategy.
- Support token revocation on logout/security events.
- Restrict token scope to extension use-cases only.

## 6) Minimal Data Model Suggestion

Suggested table: `ExtensionApiToken`

- `id`
- `userId`
- `tokenHash`
- `name` (optional, e.g., "xpo-companion")
- `createdAt`
- `lastUsedAt`
- `expiresAt`
- `revokedAt`

## 7) Deterministic Scoring (Current Extension Logic)

The extension currently scores opportunities locally using heuristics.

Base score: `34`

Adjustments:

- `+16` if tweet has question mark.
- Length:
- `+10` for 70..280 chars.
- `-8` if < 25 chars.
- `-6` if > 500 chars.
- `+6` verified author.
- Freshness:
- `+16` if <= 30 min.
- `+10` if <= 180 min.
- `+2` if <= 1440 min.
- `-8` older than 1440 min.
- Engagement ratio (`likes/replies` when replies > 0):
- `+9` if >= 8.
- `+5` if >= 3.
- `-3` otherwise.
- `-7` if external link present.

Final score is clamped to `0..100`.

Tier mapping:

- `high` >= 72
- `medium` >= 48
- `low` < 48

## 8) Extension Storage Keys

- `xpo.settings`
- `xpo.activeOpportunity`
- `xpo.replyLogs`

`xpo.settings` includes:

- `appBaseUrl`
- `apiToken`
- `defaultStage`
- `defaultTone`
- `enableLearningLogs`

## 9) Important UX/Behavior Notes

- Sidepanel warns when not connected.
- Draft generation still works via local fallback when disconnected.
- Popup has connect/disconnect and environment presets.
- In-feed indicator uses branded icon with hover glow and larger hit target.

## 10) Backend Agent Checklist

1. Add `/extension/connect` page.
2. Add `/api/extension/token` (session-authenticated issuance).
3. Add extension token verification utility.
4. Add `/api/extension/reply-draft` (Bearer-authenticated).
5. Return valid `options[]` + optional `notes[]` shape.
6. Add token table/migration + hashing + expiry.
7. Add basic audit logs (`lastUsedAt`, errors).
8. Test local (`http://localhost:3000`) and prod (`https://xpo.lol`) connect flow.

## 11) Quick End-to-End Test Script

1. Load extension unpacked.
2. Popup -> `Use local`.
3. Popup -> `Connect account`.
4. Login on Xpo and complete connect page.
5. Go to X feed.
6. Click Xpo indicator on a tweet.
7. Click `Open Sidepanel`.
8. In sidepanel click `Generate reply options`.
9. Verify response source says backend path (not fallback).

