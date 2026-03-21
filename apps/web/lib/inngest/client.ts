import { Inngest } from "inngest";

export interface OnboardingRunRequestedEventData {
  effectiveInput: Record<string, unknown>;
  jobId: string;
  userAgent: string | null;
  userId: string;
}

export interface OnboardingDeepBackfillStartedEventData {
  account: string;
  cursor: string;
  userId: string;
}

export interface AppInngestEventMap {
  "onboarding/run.requested": {
    data: OnboardingRunRequestedEventData;
  };
  "onboarding/deep.backfill.started": {
    data: OnboardingDeepBackfillStartedEventData;
  };
}

const appVersion =
  process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
  process.env.VERCEL_DEPLOYMENT_ID?.trim() ||
  undefined;

export const inngest = new Inngest({
  id: "xpo-app",
  ...(appVersion ? { appVersion } : {}),
});
