import type { OnboardingInput } from "../types";
import { buildMockDataSource } from "./mockSource";
import { resolveScrapeDataSource } from "./scrapeSource";
import type { OnboardingDataSource, OnboardingMode } from "./types";
import {
  hasXApiSourceCredentials,
  resolveXApiDataSource,
} from "./xApiSource";

function getConfiguredOnboardingMode(): OnboardingMode {
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
    return buildMockDataSource(input, "forceMock enabled. Using mock data.");
  }

  const mode = getConfiguredOnboardingMode();

  if (mode === "mock") {
    return buildMockDataSource(input, "ONBOARDING_MODE=mock. Using mock data.");
  }

  if (mode === "x_api") {
    try {
      return await resolveXApiDataSource(input);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown X API error.";
      return buildMockDataSource(
        input,
        `ONBOARDING_MODE=x_api failed (${message}). Falling back to mock data.`,
      );
    }
  }

  if (mode === "scrape") {
    try {
      return await resolveScrapeDataSource(input);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown scrape source error.";
      return buildMockDataSource(
        input,
        `ONBOARDING_MODE=scrape failed (${message}). Falling back to mock data.`,
      );
    }
  }

  try {
    return await resolveScrapeDataSource(input);
  } catch {
    // Fall through to X API (fallback), then mock.
  }

  if (hasXApiSourceCredentials()) {
    try {
      return await resolveXApiDataSource(input);
    } catch {
      // Fall through to mock.
    }
  }

  return buildMockDataSource(
    input,
    "No scrape capture or X API data available. Using mock data.",
  );
}
