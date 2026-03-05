const FALLBACK_SITE_URL = "http://localhost:3000";

export const APP_NAME = "Xpo";
export const APP_TAGLINE = "Grow Xponentially on X";
export const APP_DESCRIPTION =
  "AI growth copilot for creators on X. Analyze your account, plan what to post next, draft in your voice, and grow with a repeatable system.";

export function resolveSiteUrl(): string {
  const explicitSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicitSiteUrl) {
    return explicitSiteUrl;
  }

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return FALLBACK_SITE_URL;
}

export function resolveMetadataBase(): URL {
  try {
    return new URL(resolveSiteUrl());
  } catch {
    return new URL(FALLBACK_SITE_URL);
  }
}
