const FALLBACK_SITE_URL = "http://localhost:3000";

export const APP_NAME = "Stanley for X";
export const APP_DESCRIPTION =
  "Growth intelligence engine for X creators. Analyze your account, find what wins, and publish with confidence.";

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
