import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

test("onboarding root shims stay thin and point at landed domain folders", () => {
  const serviceShim = readFileSync(new URL("./service.ts", import.meta.url), "utf8").trim();
  const typesShim = readFileSync(new URL("./types.ts", import.meta.url), "utf8").trim();
  const draftArtifactsShim = readFileSync(
    new URL("./draftArtifacts.ts", import.meta.url),
    "utf8",
  ).trim();

  assert.equal(serviceShim, 'export * from "./pipeline/service.ts";');
  assert.equal(typesShim, 'export * from "./contracts/types.ts";');
  assert.equal(draftArtifactsShim, 'export * from "./shared/draftArtifacts.ts";');

  assert.equal(existsSync(new URL("./agentContext.ts", import.meta.url)), false);
  assert.equal(existsSync(new URL("./growthStrategy.ts", import.meta.url)), false);
  assert.equal(existsSync(new URL("./generationContract.ts", import.meta.url)), false);
  assert.equal(existsSync(new URL("./store.ts", import.meta.url)), false);
  assert.equal(existsSync(new URL("./strategy/agentContext.ts", import.meta.url)), true);
  assert.equal(existsSync(new URL("./strategy/growthStrategy.ts", import.meta.url)), true);
  assert.equal(existsSync(new URL("./analysis/contentInsights.ts", import.meta.url)), true);
  assert.equal(existsSync(new URL("./contracts/generationContract.ts", import.meta.url)), true);
  assert.equal(existsSync(new URL("./pipeline/service.ts", import.meta.url)), true);
  assert.equal(existsSync(new URL("./store/onboardingRunStore.ts", import.meta.url)), true);
  assert.equal(existsSync(new URL("./contracts/types.ts", import.meta.url)), true);
  assert.equal(existsSync(new URL("./shared/draftArtifacts.ts", import.meta.url)), true);

  for (const deletedRootShim of [
    "analysis.ts",
    "avatarUrl.ts",
    "backfill.ts",
    "backfillStore.ts",
    "coachReply.ts",
    "contentInsights.ts",
    "contextEnrichment.ts",
    "creatorProfile.ts",
    "draftValidator.ts",
    "evaluation.ts",
    "importScrapePayload.ts",
    "mockData.ts",
    "performanceModel.ts",
    "profileConversionAudit.ts",
    "profileHydration.ts",
    "profilePreview.ts",
    "regression.ts",
    "scrapeStore.ts",
    "scrapeUserTweetsParser.ts",
    "strategyOverrides.ts",
    "validation.ts",
    "xApi.ts",
  ]) {
    assert.equal(existsSync(new URL(`./${deletedRootShim}`, import.meta.url)), false);
  }
});

test("onboarding and creator routes import landed onboarding domain folders directly", () => {
  const onboardingRunRoute = readFileSync(
    new URL("../../app/api/onboarding/run/route.ts", import.meta.url),
    "utf8",
  );
  const generationContractRoute = readFileSync(
    new URL("../../app/api/creator/generation-contract/route.ts", import.meta.url),
    "utf8",
  );
  const creatorContextRoute = readFileSync(
    new URL("../../app/api/creator/context/route.ts", import.meta.url),
    "utf8",
  );
  const creatorScrapeRoute = readFileSync(
    new URL("../../app/api/creator/v2/scrape/route.ts", import.meta.url),
    "utf8",
  );
  const draftCandidatesRoute = readFileSync(
    new URL("../../app/api/creator/v2/draft-candidates/route.ts", import.meta.url),
    "utf8",
  );
  const previewRoute = readFileSync(
    new URL("../../app/api/onboarding/preview/route.ts", import.meta.url),
    "utf8",
  );
  const backfillJobsRoute = readFileSync(
    new URL("../../app/api/onboarding/backfill/jobs/route.ts", import.meta.url),
    "utf8",
  );
  const latestScrapeRoute = readFileSync(
    new URL("../../app/api/onboarding/scrape/latest/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(onboardingRunRoute, /from "@\/lib\/onboarding\/pipeline\/service";/);
  assert.match(onboardingRunRoute, /from "@\/lib\/onboarding\/contracts\/validation";/);
  assert.equal(/from "@\/lib\/onboarding\/service";/.test(onboardingRunRoute), false);
  assert.equal(/from "@\/lib\/onboarding\/validation";/.test(onboardingRunRoute), false);

  assert.match(
    generationContractRoute,
    /from "@\/lib\/onboarding\/contracts\/generationContract";/,
  );
  assert.equal(
    /from "@\/lib\/onboarding\/generationContract";/.test(generationContractRoute),
    false,
  );

  assert.match(
    creatorContextRoute,
    /from "@\/lib\/onboarding\/store\/onboardingRunStore";/,
  );
  assert.equal(/from "@\/lib\/onboarding\/store";/.test(creatorContextRoute), false);

  assert.match(creatorScrapeRoute, /from "@\/lib\/onboarding\/pipeline\/service";/);
  assert.match(creatorScrapeRoute, /from "@\/lib\/onboarding\/contracts\/validation";/);
  assert.match(
    creatorScrapeRoute,
    /from "@\/lib\/onboarding\/store\/onboardingRunStore";/,
  );
  assert.equal(/from "@\/lib\/onboarding\/store";/.test(creatorScrapeRoute), false);

  assert.match(
    draftCandidatesRoute,
    /from "@\/lib\/onboarding\/shared\/draftArtifacts";/,
  );
  assert.match(
    draftCandidatesRoute,
    /from "@\/lib\/onboarding\/store\/onboardingRunStore";/,
  );
  assert.equal(
    /from "@\/lib\/onboarding\/draftArtifacts";/.test(draftCandidatesRoute),
    false,
  );
  assert.equal(/from "@\/lib\/onboarding\/store";/.test(draftCandidatesRoute), false);

  assert.match(previewRoute, /from "@\/lib\/onboarding\/contracts\/validation";/);
  assert.equal(/from "@\/lib\/onboarding\/validation";/.test(previewRoute), false);

  assert.match(backfillJobsRoute, /from "@\/lib\/onboarding\/store\/backfillJobStore";/);
  assert.equal(/from "@\/lib\/onboarding\/backfillStore";/.test(backfillJobsRoute), false);

  assert.match(latestScrapeRoute, /from "@\/lib\/onboarding\/store\/scrapeCaptureStore";/);
  assert.equal(/from "@\/lib\/onboarding\/scrapeStore";/.test(latestScrapeRoute), false);
});
