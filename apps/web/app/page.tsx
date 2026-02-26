import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-6 py-16">
      <section className="space-y-6">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">
          Stanley for X
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-6xl">
          Growth intelligence for X, built around measurable learning loops.
        </h1>
        <p className="max-w-2xl text-base text-zinc-600 dark:text-zinc-300 sm:text-lg">
          Start with structured onboarding, then move into prediction and postmortem loops.
        </p>
        <Link
          href="/onboarding"
          className="inline-flex items-center rounded-md bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Start Onboarding
        </Link>
      </section>
    </main>
  );
}
