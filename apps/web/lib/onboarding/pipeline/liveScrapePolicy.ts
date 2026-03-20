import type { OnboardingInput } from "../contracts/types";
import { readLatestScrapeCaptureByAccount } from "../store/scrapeCaptureStore";
import {
  getConfiguredOnboardingMode,
} from "../sources/resolveOnboardingSource";
import { hasXApiSourceCredentials } from "../sources/xApiSource";

function isAsyncScrapeJobsFlagEnabled(): boolean {
  const raw = process.env.ONBOARDING_ASYNC_SCRAPE_JOBS?.trim();
  if (raw === "0") {
    return false;
  }

  if (raw === "1") {
    return true;
  }

  return process.env.NODE_ENV === "production";
}

export function shouldDeferLiveScrapesToWorker(): boolean {
  return isAsyncScrapeJobsFlagEnabled();
}

export async function shouldQueueOnboardingLiveScrape(
  input: Pick<OnboardingInput, "account" | "forceMock" | "scrapeFreshness">,
): Promise<boolean> {
  if (!shouldDeferLiveScrapesToWorker()) {
    return false;
  }

  if (input.forceMock || input.scrapeFreshness === "cache_only") {
    return false;
  }

  const mode = getConfiguredOnboardingMode();
  if (mode === "mock" || mode === "x_api") {
    return false;
  }

  const latestCapture = await readLatestScrapeCaptureByAccount(input.account);
  if (latestCapture) {
    return false;
  }

  if (mode === "auto" && hasXApiSourceCredentials()) {
    return false;
  }

  return true;
}
