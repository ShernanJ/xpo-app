import { serve } from "inngest/next";

import { processOnboardingRun } from "@/lib/inngest/functions/processOnboardingRun";
import { inngest } from "@/lib/inngest/client";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processOnboardingRun],
});
