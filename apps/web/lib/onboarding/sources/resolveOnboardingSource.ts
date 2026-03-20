import type { OnboardingInput } from "../types";
import { resolveScrapeDataSource } from "./scrapeSource";
import type { OnboardingDataSource, OnboardingMode } from "./types";
import {
  hasXApiSourceCredentials,
  resolveXApiDataSource,
} from "./xApiSource";

export function getConfiguredOnboardingMode(): OnboardingMode {
  const raw = (
    process.env.ONBOARDING_MODE ??
    process.env.ONBOARDING_DATA_SOURCE ??
    "auto"
  )
    .trim()
    .toLowerCase();

  if (raw === "x_api" || raw === "scrape" || raw === "mock") {
    return raw;
  }

  return "auto";
}

export async function resolveOnboardingDataSource(
  input: OnboardingInput,
): Promise<OnboardingDataSource> {
  if (input.forceMock) {
    throw new Error(
      "Mock onboarding data is disabled. Remove forceMock and retry with a real data source.",
    );
  }

  const mode = getConfiguredOnboardingMode();

  if (mode === "mock") {
    throw new Error(
      "ONBOARDING_MODE=mock is disabled. Configure a real onboarding source instead.",
    );
  }

  if (mode === "x_api") {
    try {
      return await resolveXApiDataSource(input);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown X API error.";
      throw new Error(`ONBOARDING_MODE=x_api failed: ${message}`);
    }
  }

  if (mode === "scrape") {
    try {
      return await resolveScrapeDataSource(input);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown scrape source error.";
      throw new Error(`ONBOARDING_MODE=scrape failed: ${message}`);
    }
  }

  let scrapeFailureMessage: string | null = null;
  try {
    return await resolveScrapeDataSource(input);
  } catch (error) {
    scrapeFailureMessage =
      error instanceof Error ? error.message : "Unknown scrape source error.";
  }

  if (hasXApiSourceCredentials()) {
    try {
      return await resolveXApiDataSource(input);
    } catch (error) {
      const xApiFailureMessage =
        error instanceof Error ? error.message : "Unknown X API error.";
      throw new Error(
        `Scrape source failed: ${scrapeFailureMessage ?? "Unknown scrape source error."} X API fallback failed: ${xApiFailureMessage}`,
      );
    }
  }

  throw new Error(
    `Scrape source failed: ${scrapeFailureMessage ?? "Unknown scrape source error."} X API fallback is unavailable because credentials are not configured.`,
  );
}
