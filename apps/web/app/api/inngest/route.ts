import { serve } from "inngest/next";

import { processContextPrimer } from "@/lib/inngest/functions/processContextPrimer";
import { processDeepBackfill } from "@/lib/inngest/functions/processDeepBackfill";
import { processHistoricalBackfillYear } from "@/lib/inngest/functions/processHistoricalBackfillYear";
import { processOnboardingRun } from "@/lib/inngest/functions/processOnboardingRun";
import { inngest } from "@/lib/inngest/client";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    processOnboardingRun,
    processContextPrimer,
    processHistoricalBackfillYear,
    processDeepBackfill,
  ],
});
