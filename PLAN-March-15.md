# Plan: Document Current Chat Progress and Introduce Focused Route-Local Context

## Summary
- Update `PLAN.md`, `Artifact.md`, and `LIVE_AGENT.md` to reflect the actual current chat state: `apps/web/app/chat/page.tsx` is now roughly `1.5k` lines, the major page-local state machines have already been extracted, and the remaining client debt is mostly orchestration and prop plumbing rather than one giant monolith.
- Add explicit frontend guidance that `useContext` is the next preferred tool for route-local sibling state sharing, but only through focused providers. Do not introduce Redux/MobX for this route, and do not create a single mega `ChatPageContext`.
- Plan one concrete implementation slice: a route-local `workspace-chrome` provider that replaces the highest-ROI remaining prop drilling between the page, `ChatWorkspaceCanvas`, `ChatHeader`, and `ChatSidebar`.

## Documentation Changes
- `PLAN.md`
  - Mark the large chat-page thinning work as complete for the current Phase 2 client-boundary objective.
  - Replace stale references to the earlier `~5.7k` line page with the current `~1.5k` line state.
  - Add a follow-on item for “route-local provider pass” under the frontend/client track.
  - Add a decision rule: use focused route-local context when multiple sibling surfaces need the same state/actions and the page has started building prop objects that mostly mirror child contracts.

- `Artifact.md`
  - Update the current hotspot description for `apps/web/app/chat/page.tsx` from “client monolith” to “route orchestrator with remaining prop-plumbing debt.”
  - Add a frontend architecture principle:
    - prefer route-private providers over wider prop bags once seam extraction is done
    - context contracts should use `state`, `actions`, and `meta`
    - keep providers scoped to one surface/domain
    - avoid one mega provider and avoid app-global stores for route-local state
  - Add the next frontend slice as `workspace-chrome` context extraction.

- `LIVE_AGENT.md`
  - Update the chat client status to reflect that most major state seams are already extracted.
  - Add operator guidance for when to introduce context:
    - use it for sibling-shared route state
    - do not move feature-owned async/business logic into the provider
    - do not add new giant prop-assembly hooks when a focused provider is the better fit
  - Add a “do not regress” rule: no single `ChatPageContext`, no Redux/MobX for chat unless state truly becomes cross-route or app-global.

## First Provider Slice
- Introduce a route-private `workspace-chrome` provider under `apps/web/app/chat/_features/workspace-chrome/`.
- Provider boundary:
  - own only the header/sidebar shared view contract
  - compose existing hook outputs and derived values
  - expose a typed context interface shaped as `{ state, actions, meta }`
- Include in this provider:
  - `state`: sidebar/account/thread-menu visibility, search/editing values, active/hovered/menu thread ids, derived thread sections, account display data, rate-limit/billing display data
  - `actions`: new chat, thread switch, rename submit, request delete, open preferences, open feedback, open settings, open pricing, switch account, open add-account, toggle menus/sidebar
  - `meta`: refs needed by header/sidebar menus
- Keep out of this provider:
  - billing async ownership
  - overlays/modal bodies
  - feedback/source-materials/preferences dialog state
  - draft editor state
  - message-stream artifact actions
- Implementation shape:
  - retire or substantially slim `useWorkspaceChromeProps`
  - `ChatWorkspaceCanvas` stops receiving `chatHeaderProps` and `chatSidebarProps`
  - `ChatHeader` and `ChatSidebar` consume narrow context hooks instead of giant prop bags
  - the provider remains composition-only and continues to depend on existing feature hooks for real state management

## Test Plan
- Add focused RTL coverage for provider-backed `ChatHeader` and `ChatSidebar` behavior:
  - sidebar toggle and search flow
  - thread rename/delete action wiring
  - account/settings/pricing action wiring
  - tool/menu visibility behavior
- Run targeted verification:
  - `eslint` on touched chat files
  - app `build`
  - existing relevant UI tests plus the new provider tests

## Assumptions and Defaults
- Use standard route-local React context in this pass; do not introduce Redux or MobX.
- Keep context private to the chat route and feature folder.
- Use the Vercel composition guidance explicitly:
  - provider is the only place that knows how state is assembled
  - consumers depend on the context interface, not the hook implementation
  - prefer narrow consumer hooks over exposing one huge raw context object
- Defer any second provider until the first slice lands cleanly; likely next candidates after this are `composer/canvas` or `message artifact` context, not overlays.

## Decisions Locked In
- The first `useContext` slice is `workspace-chrome`, not overlays, draft editor, or the full chat page.
- The provider is route-local and composition-only. Existing async/state hooks remain the source of truth.
- The provider contract follows `state`, `actions`, and `meta`.
- `ChatHeader` and `ChatSidebar` should consume narrow context hooks instead of receiving page-built prop bags.
- This pass should not introduce a single route-wide `ChatPageContext`.

## Concrete Files To Touch
- Documentation:
  - `PLAN.md`
  - `Artifact.md`
  - `LIVE_AGENT.md`
- First provider slice:
  - add `apps/web/app/chat/_features/workspace-chrome/ChatWorkspaceChromeContext.tsx`
  - update `apps/web/app/chat/_features/workspace-chrome/ChatHeader.tsx`
  - update `apps/web/app/chat/_features/workspace-chrome/ChatSidebar.tsx`
  - update `apps/web/app/chat/_features/chat-page/ChatWorkspaceCanvas.tsx`
  - update `apps/web/app/chat/page.tsx`
  - retire or slim `apps/web/app/chat/_features/workspace-chrome/useWorkspaceChromeProps.ts`
- Tests:
  - add or update a `workspace-chrome` UI test file beside the feature

## Documentation Acceptance Criteria
- `PLAN.md` reflects the current frontend reality:
  - chat page thinning is recorded as landed work
  - stale `~5.7k` page references are removed or rewritten
  - a new follow-on item exists for route-local provider extraction
- `Artifact.md` reflects the current hotspot accurately:
  - `page.tsx` is described as a route orchestrator with remaining prop-plumbing debt
  - focused route-local context is added as an explicit frontend practice
  - the next frontend slice is named as `workspace-chrome` provider extraction
- `LIVE_AGENT.md` gives agents an implementation rule set:
  - when to prefer context over larger prop bags
  - when not to use context
  - a “do not regress” rule against a mega page context or route-local global store creep

## Provider Contract Detail
- `state`
  - sidebar open/search state
  - thread hover/menu/editing state
  - derived sidebar thread sections
  - account menu visibility state
  - rate-limit and billing display labels needed by header/sidebar
  - account/profile display values used by the chrome
- `actions`
  - toggle sidebar/tools/account/rate-limit menus
  - start new chat
  - switch thread
  - submit rename
  - request delete
  - open preferences
  - open feedback
  - open pricing
  - open settings
  - switch active handle
  - open add-account modal
- `meta`
  - `toolsMenuRef`
  - `threadMenuRef`
  - `accountMenuRef`

## Explicit Non-Goals For The First Provider
- Do not move billing fetching or billing mutation ownership into context.
- Do not include overlay dialog state in this provider.
- Do not include draft editor state, draft timeline state, or inspector state.
- Do not include message artifact actions or source-material editor callbacks.
- Do not move unrelated feature logic into `workspace-chrome` just to reduce imports.

## Implementation Sequence
1. Update `PLAN.md`, `Artifact.md`, and `LIVE_AGENT.md` to reflect current chat status and the new context rule.
2. Create `ChatWorkspaceChromeContext.tsx` with:
   - a typed context value
   - one provider component
   - narrow consumer hooks for header and sidebar consumers
3. Move the current `useWorkspaceChromeProps` assembly logic into the provider boundary.
4. Update `ChatHeader` to read only the header-facing slice from context.
5. Update `ChatSidebar` to read only the sidebar-facing slice from context.
6. Update `ChatWorkspaceCanvas` so it renders header/sidebar inside the provider and no longer expects `chatHeaderProps` / `chatSidebarProps`.
7. Update `page.tsx` to pass the provider only the raw inputs it still owns from feature hooks.
8. Delete or sharply slim `useWorkspaceChromeProps.ts` once the provider replaces its job.
9. Add provider-backed UI tests and rerun targeted verification.

## Code Acceptance Criteria
- `apps/web/app/chat/page.tsx` no longer imports `useWorkspaceChromeProps`.
- `ChatWorkspaceCanvas` no longer receives `chatHeaderProps` or `chatSidebarProps`.
- `ChatHeader` and `ChatSidebar` render correctly from provider-backed data with no behavior regressions.
- The provider owns the chrome view contract only; feature hooks still own async logic and state transitions.
- No new mega context or unrelated provider is introduced in the same change.

## Verification Checklist
- `pnpm exec eslint` on the touched chat files
- `pnpm build`
- targeted Vitest/RTL coverage for:
  - header menu toggles
  - sidebar search and thread actions
  - account/settings/pricing actions
  - add-account/open-feedback/open-preferences wiring

## Risks To Watch
- Recreating the old prop bag inside context without narrowing the consumer API. The provider should reduce coupling, not just hide it.
- Letting `workspace-chrome` become a dumping ground for overlay or billing behavior.
- Pulling too much route state into one provider and accidentally recreating a page-wide store.
- Breaking keyboard/menu behavior by moving refs or event handlers without matching the existing ownership model.
