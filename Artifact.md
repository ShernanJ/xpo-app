# Agent Plan and Artifact Hand-off

## Phase: Refactoring & Architecture Stabilization
**Current Status:** Completed Core Orchestrator Extraction.

## 1. What Has Been Done (Current Plan Executed)
- **Monolithic `conversationManager.ts` decoupled:**
  - Logic regarding context assembly was moved into `turnContextBuilder.ts`.
  - The routing logic determining intent (isFastReply vs heavy pipeline) was isolated into `routingPolicy.ts`.
  - The complex main execution loop involving drafting, constraint merging, and planning was moved to `draftPipeline.ts`.
  - Profile state and fact ledge syncing was explicitly managed in `memoryPolicy.ts`.
- **TypeScript & Import Stabilization:**
  - Standardized service injection using `createDefaultConversationServices()` to resolve import matching errors in `conversationManager.ts`.

## 2. What Needs to Be Done (Future Plan)
*These map to the high-priority workstreams (WS-05 and Issue 8).*
1. **Reduce Transcript Pollution (WS-05)**:
   - **Where:** `apps/web/app/api/agent-v2/route.logic.ts`
   - **Goal:** Stop mixing internal `assistant_context` blocks into the `recentHistory` string sent to the LLM, making the model behave more naturally rather than like it's reading system logs.
2. **Improve Thread formatting Resilience (Issue 8)**:
   - **Where:** `draftArtifacts.ts`
   - **Goal:** Add deterministic thread segmentation fallback for instances where the LLM fails to comply properly with expected delimiters, improving thread generation stability.

## 3. Important Information for the Next Agent
- **The Orchestrator is now Modular**: When adapting conversational flow, do not shove logic directly into `conversationManager.ts`. Look for the applicable policy file (`turnContextBuilder`, `routingPolicy`, `draftPipeline`, `memoryPolicy`).
- **Transcript Pollution**: When editing `route.logic.ts`, make sure to separate display artifacts from raw text. Ensure that whatever the model reads as "history" looks exactly like a natural user-assistant chat.
- Check `LIVE_AGENT.md` for broader alignment on voice, thread rules, and safety fallbacks.
