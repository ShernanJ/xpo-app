import type {
  LiveContextCacheEntry,
  StrategyPlan,
  V2ConversationMemory,
} from "../contracts/chat.ts";
import {
  buildWebSearchQueryKey,
  normalizeWebSearchQueries,
} from "../core/webSearch.ts";

interface ResolveLiveContextForPlanArgs {
  plan: StrategyPlan;
  memory: Pick<V2ConversationMemory, "liveContextCache">;
  executeWebSearch: (queries: string[]) => Promise<string>;
  writeMemory: (patch: {
    liveContextCache?: LiveContextCacheEntry | null;
  }) => Promise<void>;
}

export async function resolveLiveContextForPlan(
  args: ResolveLiveContextForPlanArgs,
): Promise<string> {
  const normalizedQueries = normalizeWebSearchQueries(args.plan.searchQueries || []);
  const requiresLiveContext =
    args.plan.requiresLiveContext === true && normalizedQueries.length > 0;
  const cachedLiveContext = args.memory.liveContextCache;

  if (!requiresLiveContext) {
    if (cachedLiveContext) {
      await args.writeMemory({
        liveContextCache: null,
      });
    }
    return "";
  }

  const queryKey = buildWebSearchQueryKey(normalizedQueries);
  if (
    cachedLiveContext?.queryKey === queryKey &&
    cachedLiveContext.content.trim().length > 0
  ) {
    return cachedLiveContext.content;
  }

  if (cachedLiveContext) {
    await args.writeMemory({
      liveContextCache: null,
    });
  }

  const liveContext = await args.executeWebSearch(normalizedQueries);
  if (!liveContext.trim()) {
    return "";
  }

  await args.writeMemory({
    liveContextCache: {
      queryKey,
      queries: normalizedQueries,
      content: liveContext,
    },
  });

  return liveContext;
}
