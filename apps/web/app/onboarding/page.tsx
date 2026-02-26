"use client";

import { FormEvent, useMemo, useState } from "react";

import type { OnboardingInput } from "@/lib/onboarding/types";

interface ValidationError {
  field: string;
  message: string;
}

interface ValidationSuccess {
  ok: true;
  data: OnboardingInput;
  validatedAt: string;
}

interface ValidationFailure {
  ok: false;
  errors: ValidationError[];
}

type ValidationResponse = ValidationSuccess | ValidationFailure;

export default function OnboardingPage() {
  const [account, setAccount] = useState("@");
  const [goal, setGoal] = useState<OnboardingInput["goal"]>("followers");
  const [timeBudgetMinutes, setTimeBudgetMinutes] = useState("30");
  const [casing, setCasing] = useState<OnboardingInput["tone"]["casing"]>("normal");
  const [risk, setRisk] = useState<OnboardingInput["tone"]["risk"]>("safe");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ValidationResponse | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);

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
    setResult(null);

    try {
      const response = await fetch("/api/onboarding/validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data: ValidationResponse = await response.json();
      setResult(data);
    } catch {
      setNetworkError("Network error. Check that your dev server is running.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-6 py-12">
      <section className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Onboarding Validation</h1>
        <p className="text-sm text-zinc-600">
          Stage 1 input gate. This validates fields before profile fetching and modeling.
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
          {isLoading ? "Validating..." : "Validate Input"}
        </button>
      </form>

      {networkError ? <p className="text-sm text-red-700">{networkError}</p> : null}

      {result ? (
        <section className="space-y-3 rounded-xl border border-zinc-200 p-6">
          <h2 className="text-lg font-semibold">Result</h2>
          {result.ok ? (
            <div className="space-y-2 text-sm">
              <p className="text-emerald-700">Input is valid.</p>
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
    </main>
  );
}
