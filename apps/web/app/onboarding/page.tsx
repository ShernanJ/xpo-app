"use client";

import { FormEvent, useMemo, useState } from "react";

import type {
  OnboardingInput,
  OnboardingResult,
  PerformanceModel,
} from "@/lib/onboarding/types";

interface ValidationError {
  field: string;
  message: string;
}

interface OnboardingRunSuccess {
  ok: true;
  runId: string;
  persistedAt: string;
  data: OnboardingResult;
}

interface OnboardingRunFailure {
  ok: false;
  errors: ValidationError[];
}

type OnboardingRunResponse = OnboardingRunSuccess | OnboardingRunFailure;

interface PerformanceModelSuccess {
  ok: true;
  data: PerformanceModel;
}

interface PerformanceModelFailure {
  ok: false;
  errors: ValidationError[];
}

type PerformanceModelResponse = PerformanceModelSuccess | PerformanceModelFailure;

export default function OnboardingPage() {
  const [account, setAccount] = useState("@");
  const [goal, setGoal] = useState<OnboardingInput["goal"]>("followers");
  const [timeBudgetMinutes, setTimeBudgetMinutes] = useState("30");
  const [casing, setCasing] = useState<OnboardingInput["tone"]["casing"]>("normal");
  const [risk, setRisk] = useState<OnboardingInput["tone"]["risk"]>("safe");
  const [isLoading, setIsLoading] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [result, setResult] = useState<OnboardingRunResponse | null>(null);
  const [performanceModel, setPerformanceModel] = useState<PerformanceModel | null>(
    null,
  );
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);

  const payload = useMemo(
    () => ({
      account,
      goal,
      timeBudgetMinutes: Number(timeBudgetMinutes),
      tone: {
        casing,
        risk,
      },
    }),
    [account, goal, timeBudgetMinutes, casing, risk],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setNetworkError(null);
    setModelError(null);
    setResult(null);
    setPerformanceModel(null);

    try {
      const response = await fetch("/api/onboarding/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data: OnboardingRunResponse = await response.json();
      setResult(data);
    } catch {
      setNetworkError("Network error. Check that your dev server is running.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleBuildPerformanceModel() {
    if (!result || !result.ok) {
      return;
    }

    setIsModelLoading(true);
    setModelError(null);
    setPerformanceModel(null);

    try {
      const response = await fetch("/api/performance/model", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ runId: result.runId }),
      });

      const data: PerformanceModelResponse = await response.json();
      if (!data.ok) {
        setModelError(data.errors[0]?.message ?? "Failed to build performance model.");
        return;
      }

      setPerformanceModel(data.data);
    } catch {
      setModelError("Network error while building performance model.");
    } finally {
      setIsModelLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-6 py-12">
      <section className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Onboarding</h1>
        <p className="text-sm text-zinc-600">
          Stage 1 run using mock X data. This validates input and returns baseline intelligence.
        </p>
      </section>

      <form className="space-y-6 rounded-xl border border-zinc-200 p-6" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="account">
            Account
          </label>
          <input
            id="account"
            value={account}
            onChange={(event) => setAccount(event.target.value)}
            placeholder="@username or x.com/username"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="block text-sm font-medium" htmlFor="goal">
              Goal
            </label>
            <select
              id="goal"
              value={goal}
              onChange={(event) => setGoal(event.target.value as OnboardingInput["goal"])}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
            >
              <option value="followers">followers</option>
              <option value="leads">leads</option>
              <option value="authority">authority</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium" htmlFor="timeBudget">
              Time Budget Minutes
            </label>
            <input
              id="timeBudget"
              type="number"
              min={5}
              max={360}
              value={timeBudgetMinutes}
              onChange={(event) => setTimeBudgetMinutes(event.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="block text-sm font-medium" htmlFor="casing">
              Tone Casing
            </label>
            <select
              id="casing"
              value={casing}
              onChange={(event) =>
                setCasing(event.target.value as OnboardingInput["tone"]["casing"])
              }
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
            >
              <option value="normal">normal</option>
              <option value="lowercase">lowercase</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium" htmlFor="risk">
              Tone Risk
            </label>
            <select
              id="risk"
              value={risk}
              onChange={(event) => setRisk(event.target.value as OnboardingInput["tone"]["risk"])}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
            >
              <option value="safe">safe</option>
              <option value="bold">bold</option>
            </select>
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          {isLoading ? "Running..." : "Run Onboarding"}
        </button>
      </form>

      {networkError ? <p className="text-sm text-red-700">{networkError}</p> : null}
      {modelError ? <p className="text-sm text-red-700">{modelError}</p> : null}

      {result ? (
        <section className="space-y-3 rounded-xl border border-zinc-200 p-6">
          <h2 className="text-lg font-semibold">Result</h2>
          {result.ok ? (
            <div className="space-y-5 text-sm">
              <p className="text-emerald-700">Onboarding run complete.</p>
              <p className="text-xs text-zinc-500">
                Run ID: <span className="font-mono">{result.runId}</span> at{" "}
                {new Date(result.persistedAt).toLocaleString()}
              </p>

              <button
                type="button"
                onClick={handleBuildPerformanceModel}
                disabled={isModelLoading}
                className="rounded-md bg-zinc-800 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-600 disabled:cursor-not-allowed disabled:bg-zinc-400"
              >
                {isModelLoading ? "Building model..." : "Build Performance Model"}
              </button>

              {result.data.warnings.length > 0 ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
                  {result.data.warnings[0]}
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-4">
                <article className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-zinc-500">Account</p>
                  <p className="mt-1 text-sm font-semibold">@{result.data.profile.username}</p>
                </article>
                <article className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-zinc-500">Followers</p>
                  <p className="mt-1 text-lg font-semibold">
                    {result.data.profile.followersCount}
                  </p>
                </article>
                <article className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-zinc-500">Posts Analyzed</p>
                  <p className="mt-1 text-lg font-semibold">{result.data.recentPostSampleCount}</p>
                </article>
                <article className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-zinc-500">Cadence / Week</p>
                  <p className="mt-1 text-lg font-semibold">
                    {result.data.baseline.postingCadencePerWeek}
                  </p>
                </article>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <article className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-zinc-500">
                    Growth Stage
                  </p>
                  <p className="mt-1 text-lg font-semibold">{result.data.growthStage}</p>
                </article>
                <article className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-zinc-500">
                    Avg Engagement
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    {result.data.baseline.averageEngagement}
                  </p>
                </article>
                <article className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-zinc-500">
                    Engagement Rate
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    {result.data.baseline.engagementRate}%
                  </p>
                </article>
              </div>

              <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
                <p className="text-xs uppercase tracking-wide text-zinc-500">
                  Strategy State
                </p>
                <p className="mt-2 font-medium">
                  Recommended posts/week: {result.data.strategyState.recommendedPostsPerWeek}
                </p>
                <p className="mt-1 text-zinc-700">{result.data.strategyState.rationale}</p>
                <p className="mt-2 text-xs text-zinc-600">
                  Weights: D {result.data.strategyState.weights.distribution} / A{" "}
                  {result.data.strategyState.weights.authority} / L{" "}
                  {result.data.strategyState.weights.leverage}
                </p>
              </div>

              <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
                <p className="text-xs uppercase tracking-wide text-zinc-500">
                  Format Performance
                </p>
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-left text-xs">
                    <thead className="text-zinc-500">
                      <tr>
                        <th className="py-1 pr-4">Format</th>
                        <th className="py-1 pr-4">Share</th>
                        <th className="py-1 pr-4">Avg Engagement</th>
                        <th className="py-1">Signal</th>
                      </tr>
                    </thead>
                    <tbody className="text-zinc-800">
                      {result.data.contentDistribution.map((row) => {
                        const isBest = result.data.bestFormats.some(
                          (item) => item.type === row.type,
                        );
                        const isWeak = result.data.underperformingFormats.some(
                          (item) => item.type === row.type,
                        );

                        return (
                          <tr key={row.type} className="border-t border-zinc-200">
                            <td className="py-2 pr-4">{row.type}</td>
                            <td className="py-2 pr-4">{row.percentage}%</td>
                            <td className="py-2 pr-4">{row.averageEngagement}</td>
                            <td className="py-2">
                              {isBest ? (
                                <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-800">
                                  best
                                </span>
                              ) : null}
                              {isWeak ? (
                                <span className="ml-2 rounded bg-rose-100 px-2 py-0.5 text-rose-800">
                                  weak
                                </span>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Top Hook Patterns</p>
                <ul className="mt-2 space-y-1 text-zinc-700">
                  {result.data.hookPatterns.slice(0, 3).map((item) => (
                    <li key={item.pattern}>
                      {item.pattern}: {item.percentage}% share, {item.averageEngagement} avg
                      engagement
                    </li>
                  ))}
                </ul>
              </div>

              <pre className="overflow-x-auto rounded-md bg-zinc-100 p-3 text-xs text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <p className="text-red-700">Input has validation errors.</p>
              <ul className="list-disc pl-5">
                {result.errors.map((error) => (
                  <li key={`${error.field}-${error.message}`}>
                    <span className="font-medium">{error.field}:</span> {error.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      ) : null}

      {performanceModel ? (
        <section className="space-y-4 rounded-xl border border-zinc-200 p-6">
          <h2 className="text-lg font-semibold">Performance Model</h2>
          <div className="grid gap-3 sm:grid-cols-4">
            <article className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                Best Content Type
              </p>
              <p className="mt-1 font-semibold">{performanceModel.bestContentType ?? "n/a"}</p>
            </article>
            <article className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                Best Hook Pattern
              </p>
              <p className="mt-1 font-semibold">{performanceModel.bestHookPattern ?? "n/a"}</p>
            </article>
            <article className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                Recommended Length
              </p>
              <p className="mt-1 font-semibold">
                {performanceModel.lengthOptimization.recommendedBand ?? "n/a"}
              </p>
            </article>
            <article className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                Conversation Trigger
              </p>
              <p className="mt-1 font-semibold">
                {performanceModel.conversationTriggerRate}%
              </p>
            </article>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Strengths</p>
              <ul className="mt-2 space-y-1 text-sm text-zinc-700">
                {performanceModel.strengths.map((item) => (
                  <li key={item}>- {item}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Weaknesses</p>
              <ul className="mt-2 space-y-1 text-sm text-zinc-700">
                {performanceModel.weaknesses.map((item) => (
                  <li key={item}>- {item}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Next Actions</p>
              <ul className="mt-2 space-y-1 text-sm text-zinc-700">
                {performanceModel.nextActions.map((item) => (
                  <li key={item}>- {item}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Format Insights (delta vs baseline)
            </p>
            <ul className="mt-2 space-y-1 text-sm text-zinc-700">
              {performanceModel.formatInsights.slice(0, 4).map((item) => (
                <li key={item.key}>
                  {item.key}: {item.averageEngagement} avg ({item.deltaVsBaselinePercent}%)
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </main>
  );
}
