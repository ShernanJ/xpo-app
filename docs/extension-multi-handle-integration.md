# Extension Multi-Handle Integration Handoff

## Goal

Update the browser extension to use the web app as the only login surface, store and use the extension bearer token from the existing connect flow, and send an explicit selected `xHandle` on every handle-scoped API request.

The backend is already updated for this model.

## Do Not Implement

- Do not add email/password login inside the extension.
- Do not send raw credentials from the extension to app auth endpoints.
- Do not use the currently logged-in x.com account as the source of truth for workspace identity.
- Do not assume the app session's `activeXHandle` controls extension authorization.

## New Backend Contract

### Auth model

- The extension must authenticate with:
  - `Authorization: Bearer <extension_token>`
- The token is minted by the web app connect flow.
- Reconnecting rotates the active extension token for that user and scope.
- Token lifetime is shorter now. The extension should be prepared to reconnect when it expires.

### Handle-scoped authorization model

- The extension must authorize handle-scoped requests with:
  - `x-xpo-handle: <normalized_handle>`
- The backend now validates that the requested handle belongs to the authenticated user.
- Missing handle returns `400`.
- Unattached handle returns `404`.
- Requests no longer rely on `activeXHandle` as the implicit selector.

## Connect Flow

Keep using the existing web app connect page.

### Expected runtime messages

The web app sends these messages to the extension runtime:

```ts
{ type: "xpo:connect-probe" }
```

```ts
{
  type: "xpo:store-auth-token",
  payload: {
    apiToken: string,
    appBaseUrl: string,
  },
}
```

### Extension requirements

- Respond to the probe message so the connect page can verify the extension is installed.
- On `xpo:store-auth-token`, persist:
  - `apiToken`
  - `appBaseUrl`
- Overwrite any previous token for the same app base URL.
- Treat reconnect as token replacement, not token accumulation.

## New Endpoint

### `GET /api/extension/handles`

Use this after the extension has a valid bearer token.

Request:

```http
GET /api/extension/handles
Authorization: Bearer <extension_token>
```

Response:

```json
{
  "handles": ["handle_a", "handle_b"]
}
```

### Extension behavior

- Fetch handles after auth is connected.
- Store them as the list of selectable workspaces for the signed-in user.
- Pick a selected handle in extension state.
- Let the user switch handles without reconnecting the extension.

## Handle-Scoped Endpoints

The extension must now send `x-xpo-handle` on all of these requests:

- `POST /api/extension/opportunity-batch`
- `POST /api/extension/reply-options`
- `POST /api/extension/reply-draft`
- `POST /api/extension/reply-log`
- `GET /api/extension/drafts`
- `POST /api/extension/drafts/:id/publish`

Recommended request pattern:

```ts
async function extensionApiFetch(path: string, init: RequestInit = {}, xHandle: string) {
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${apiToken}`);
  headers.set("x-xpo-handle", xHandle);

  return fetch(`${appBaseUrl}${path}`, {
    ...init,
    headers,
  });
}
```

## Endpoint Notes

### `POST /api/extension/opportunity-batch`

- Request body is unchanged.
- Add the selected handle header.

### `POST /api/extension/reply-options`

- Request body is unchanged.
- Add the selected handle header.

### `POST /api/extension/reply-draft`

- Request body is unchanged.
- Add the selected handle header.

### `POST /api/extension/reply-log`

- Request body is unchanged.
- Add the selected handle header.
- Logging now persists against the explicitly selected handle.

### `GET /api/extension/drafts`

- Send the selected handle header.
- Do not rely on a session default handle.
- There is legacy compatibility for a query-param-based handle path in the backend, but the extension should use `x-xpo-handle` going forward.

### `POST /api/extension/drafts/:id/publish`

- Send the selected handle header.
- This is also handle-scoped now.

## Required Extension State

The extension should maintain these pieces of state:

- `appBaseUrl`
- `apiToken`
- `apiTokenExpiresAt` if available in your storage flow
- `availableHandles: string[]`
- `selectedHandle: string | null`

Recommended behavior:

- If there is only one handle, auto-select it.
- If there are multiple handles, remember the last selected handle per `appBaseUrl`.
- If the remembered handle is no longer returned by `/api/extension/handles`, fall back to the first returned handle.

## UX Changes Required

### 1. Handle switcher

Add a visible account or workspace switcher in the extension UI:

- load from `GET /api/extension/handles`
- show all attached handles
- let the user switch active workspace handle
- use the selected handle for all future API calls

### 2. Wrong-X-account guardrail

This is the main remaining safety feature that still needs to be implemented in the extension.

If the extension can detect:

- selected workspace handle = `handle_a`
- current logged-in x.com account = `handle_b`

then for execution actions:

- show a clear warning
- block publishing or copy-to-composer by default, or require a very explicit confirmation
- never imply the app is posting as `handle_a` when x.com is actually logged into `handle_b`

Safe rule:

- viewing drafts: allowed
- loading opportunities: allowed
- generating replies: allowed
- copying into composer / posting on x.com: guarded when handles mismatch

## Error Handling

The extension should handle these authz failures explicitly:

### `401 Unauthorized`

- token missing, invalid, expired, or revoked
- prompt the user to reconnect through the web app

### `400` with `field: "xHandle"`

- selected handle was missing from the request
- this is an extension bug or missing state

### `404` with `field: "xHandle"`

- selected handle is no longer attached to the user
- refresh handles and force the user to reselect

## Suggested Implementation Order

1. Update the extension auth storage to accept token replacement from the connect flow.
2. Add a shared API client that always sends `Authorization`.
3. Add handle loading with `GET /api/extension/handles`.
4. Add selected-handle state and UI switcher.
5. Update every handle-scoped request to send `x-xpo-handle`.
6. Add mismatch detection between selected workspace handle and current x.com account.
7. Guard publish and copy-to-composer flows on mismatch.
8. Add extension-side tests for multi-handle behavior and expired-token recovery.

## Acceptance Checklist

- The extension never asks for email/password.
- The extension connects only through the web app connect flow.
- The extension stores and uses the bearer token from the connect flow.
- The extension fetches attached handles from `/api/extension/handles`.
- The user can switch between attached handles inside the extension.
- All handle-scoped requests send `x-xpo-handle`.
- The extension can read and generate for multiple attached handles without reconnecting.
- Expired or revoked tokens trigger reconnect.
- Mismatched selected-handle vs x.com-account state is clearly blocked or warned for execution actions.

## Backend References

- Connect page: `apps/web/app/extension/connect/connect-client.tsx`
- Runtime message contract: `apps/web/lib/extension/connect.ts`
- Token issuance: `apps/web/app/api/extension/token/route.ts`
- Handle auth utilities: `apps/web/lib/extension/handles.ts`
- Extension user context: `apps/web/lib/extension/context.ts`
- Handles endpoint: `apps/web/app/api/extension/handles/route.ts`

## Short Version

The extension should authenticate the user with the extension bearer token, select a workspace handle from `/api/extension/handles`, and send that handle on every handle-scoped request. Read and generate can be multi-handle. Execution on x.com must be guarded when the selected workspace handle does not match the currently logged-in X account.
