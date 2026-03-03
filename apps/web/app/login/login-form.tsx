"use client";

import { signIn } from "next-auth/react";
import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

function LoginFormContent() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const xHandle = searchParams.get("xHandle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (res?.error) {
      setError("Invalid email or password");
      setLoading(false);
    } else {
      if (xHandle) {
        // Automatically save this onboarding handle as the active context
        await fetch("/api/creator/profile/handles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handle: xHandle }),
        });
      }
      router.push("/chat");
      router.refresh();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-8 w-full max-w-sm">
      {error && (
        <div className="p-3 text-sm text-red-400 bg-red-950/30 rounded-lg">
          {error}
        </div>
      )}

      {xHandle && (
        <div className="text-center pb-2">
          <p className="text-sm font-medium text-zinc-300">
            Sign in to secure your workspace for <strong className="text-white">@{xHandle}</strong>
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-zinc-400">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="maker@xpo.dev"
          className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-700 transition-all"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-zinc-400">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          placeholder="••••••••"
          className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-700 transition-all"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full mt-4 bg-white text-black font-semibold py-3 rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50"
      >
        {loading ? "Signing in..." : (xHandle ? `Continue as @${xHandle}` : "Login")}
      </button>

      <p className="text-xs text-zinc-500 text-center mt-4">
        Don&apos;t have an account? Just enter a new email and password to auto-register.
      </p>
    </form>
  );
}

export function LoginForm() {
  return (
    <Suspense fallback={<div className="animate-pulse w-full max-w-sm mt-8 h-64 bg-zinc-900 rounded-lg" />}>
      <LoginFormContent />
    </Suspense>
  );
}
