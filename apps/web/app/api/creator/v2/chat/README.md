# `app/api/creator/v2/chat`

This folder is the route boundary for the main creator chat API. Its job is not to own the whole product. Its job is to turn an authenticated HTTP request into a normalized runtime call, then persist and package the result safely.

## Read This First

Use this reading order:

1. `route.ts`
2. `_lib/normalization/turnNormalization.ts`
3. `_lib/request/routePreflight.ts`
4. `_lib/persistence/routePersistence.ts`
5. `_lib/main/routeMainFinalize.ts`
6. `_lib/reply/routeReplyFinalize.ts`
7. `_lib/response/routeResponse.ts`

Then move to `apps/web/lib/agent-v2/README.md`.

## What This Folder Owns

- request parsing
- auth and workspace ownership checks
- normalization from transport payload into route-ready turn semantics
- loading thread, run, profile, and memory preflight context
- runtime dispatch into `lib/agent-v2`
- route-boundary persistence
- final API response assembly
- handled reply finalization

It does not own:

- workflow policy for the full AI system
- capability-specific drafting/revision/reply logic
- onboarding analysis internals

## Folder Guide

### `route.ts`

The main entrypoint.

Current responsibilities:

- auth check
- billing check and duplicate-turn handling
- route preflight
- runtime call
- persistence orchestration
- response packaging

If the route feels too big, that is expected: this is still a heavy boundary even after extractions.

### `_lib/normalization/`

Converts raw client payloads into structured turn semantics.

This is where free-text versus structured UI actions become explicit runtime hints like:

- `turnSource`
- `artifactContext`
- `explicitIntent`
- `resolvedWorkflow`

If the system misinterprets a click action or selected draft, start here.

### `_lib/request/`

Preflight and route-side request assembly.

Key responsibilities:

- thread ownership
- workspace resolution
- onboarding run lookup
- memory and history preflight
- route-only request helper logic

If the runtime gets the wrong thread, run, profile, or memory context, start here.

### `_lib/control/`

Route-level control-plane support such as duplicate turn replay and billing charge/refund handling.

This is route infrastructure, not AI capability logic.

### `_lib/persistence/`

Writes durable state after the runtime result exists.

Key responsibilities:

- assistant message persistence
- conversation memory updates
- thread metadata updates
- draft candidate persistence
- persistence trace patch generation

If the model output looked correct but the thread state or draft state is wrong later, this is the first place to inspect.

### `_lib/main/`

Finalization for the main assistant-turn path.

### `_lib/reply/`

Reply-specific finalization logic for handled reply turns.

### `_lib/response/`

Shared response-envelope assembly helpers.

## Mental Model

This route has six phases:

1. accept and authenticate the request
2. normalize turn semantics
3. load route preflight context
4. call the runtime
5. persist route-owned side effects
6. return a packaged API response

That separation is the main thing to preserve.

## Debug Map

If the wrong turn semantics are sent to the runtime:

- `_lib/normalization/turnNormalization.ts`

If the wrong thread or run is used:

- `_lib/request/routePreflight.ts`

If the runtime result is good but the DB state is wrong:

- `_lib/persistence/routePersistence.ts`

If replies behave differently from normal chat turns:

- `_lib/reply/routeReplyFinalize.ts`
- `apps/web/lib/agent-v2/capabilities/reply/*`

If the response payload shape is wrong:

- `_lib/response/routeResponse.ts`
- `_lib/main/routeMainFinalize.ts`

## Tests

Relevant route-focused tests live here too:

- `route.test.mjs`
- `route.reply.test.mjs`
- `reply.logic.test.mjs`
- `turnNormalization.test.mjs`

These are usually the fastest way to confirm the route boundary contract before diving into the full runtime.
