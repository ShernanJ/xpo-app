# `app/chat`

This folder owns the main chat product surface. It is the browser-side workspace for threads, drafting, replies, source materials, billing prompts, and account/workspace switching.

## Read This First

Start here in this order:

1. `page.tsx`
2. `_features/transport/chatTransport.ts`
3. `_features/reply/chatReplyState.ts`
4. `_features/workspace/chatWorkspaceState.ts`
5. `_features/thread-history/*`
6. `_features/draft-editor/*`

Then move to:

- `app/api/creator/v2/chat/README.md`
- `apps/web/lib/agent-v2/README.md`

## Mental Model

The chat page is a large route shell that coordinates many extracted feature slices.

The client-side responsibilities are:

- collect user input
- build structured transport payloads
- submit chat turns
- interpret server responses
- hydrate thread history
- manage draft editor state
- manage reply state
- manage workspace/account UI state

The server-side AI reasoning does not live here. This folder is the UI workspace and client orchestration layer.

## Folder Guide

### `page.tsx`

Still the top-level route shell and integration point.

What remains here:

- route-level composition
- feature wiring
- high-level async orchestration
- connecting server responses to UI state

What should not keep growing here:

- feature-local state machines
- modal-specific business logic
- reusable view-state helpers
- transport-shape details that already have a home elsewhere

### `_features/transport/`

Builds structured requests for the chat API.

Read this when:

- the client is sending the wrong payload
- `turnSource`, draft context, or workspace headers look wrong

### `_features/reply/`

Interprets reply-related server output and coordinates reply UI state.

Read this when:

- reply artifacts or reply follow-up flows feel wrong on the client

### `_features/thread-history/`

Owns thread rendering and message-history view state.

Use this when:

- thread hydration is wrong
- message rows or artifact sections render incorrectly
- draft reveal behavior looks off

### `_features/draft-editor/`

Owns the draft editing experience after the server returns draft artifacts.

Use this when:

- draft versions, preview, docking, or revision flows are wrong

### `_features/workspace/`

Workspace state, bootstrapping, and workspace-specific resets.

Use this when:

- the wrong account/workspace is active
- thread loading is mismatched to the selected handle

### `_features/workspace-chrome/`

Sidebar, header, account menu, extension dialog, and other workspace shell UI.

### `_features/source-materials/`

Client-side state for grounded source-material management.

### `_features/preferences/`

Client-side preference UI and state.

### `_features/analysis/`

Profile analysis modal state and presentation.

### `_features/billing/`

Pricing, settings, and billing dialog state on the chat surface.

## Fast Debug Map

If the request being sent is wrong:

- `_features/transport/chatTransport.ts`

If the response came back correctly but the UI hydrated incorrectly:

- `_features/reply/chatReplyState.ts`
- `_features/thread-history/*`
- `_features/draft-editor/*`

If thread or workspace switching is wrong:

- `_features/workspace/*`
- `_features/workspace-chrome/*`

If the draft editor is correct but the server returned the wrong artifacts:

- move next to `app/api/creator/v2/chat/README.md`
- then to `apps/web/lib/agent-v2/README.md`

## Design Rule

This route should keep moving toward:

- thin route shell
- feature-local logic in `_features/*`
- API-boundary logic in `app/api/creator/v2/chat/*`
- runtime logic in `apps/web/lib/agent-v2/*`

That separation is the main thing both humans and agents should preserve when editing this area.

## Effect Guardrails

When an effect in this folder owns async work, polling, or reset behavior:

- use primitive driver keys or real identity keys in the dependency list
- move callback props and helper functions behind refs when they are only read at execution time
- add stale-response protection for fetches, preferably with `AbortController`
- avoid letting callback identity churn restart workspace bootstrap, thread hydration, or polling loops

If a change makes an effect easier to read but less stable under rerenders, choose stability.
