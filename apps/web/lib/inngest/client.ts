import { Inngest } from "inngest";

const appVersion =
  process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
  process.env.VERCEL_DEPLOYMENT_ID?.trim() ||
  undefined;

export const inngest = new Inngest({
  id: "xpo-app",
  ...(appVersion ? { appVersion } : {}),
});
