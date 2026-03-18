"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, Pin } from "lucide-react";
import { motion } from "framer-motion";

import type {
  GuestAnalysisStatus,
  GuestOnboardingAnalysis,
} from "@/lib/onboarding/guestAnalysis";

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Math.max(0, value));
}

function formatJoinDate(value: string): string | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return (parts.map((part) => part[0]).join("") || "?").toUpperCase();
}

function getStatusBadgeClasses(): string {
  return "border-white/10 bg-transparent text-zinc-300";
}

function getStatusLabel(status: GuestAnalysisStatus): string {
  switch (status) {
    case "pass":
      return "Strong";
    case "warn":
      return "Needs work";
    case "fail":
      return "Leak";
    default:
      return "Unknown";
  }
}

export function GuestAnalysisPreview(props: {
  analysis: GuestOnboardingAnalysis;
  signupHref: string;
  onBack: () => void;
}) {
  const { analysis, signupHref, onBack } = props;
  const joinDateLabel = formatJoinDate(analysis.profile.createdAt);
  const pinnedPostCheck = analysis.profileAudit.surfaceChecks.find((item) => item.key === "pinned_post");

  return (
    <section className="relative mx-auto flex min-h-full w-full max-w-6xl flex-col justify-start py-2 sm:py-3 lg:h-full lg:min-h-0">
      <motion.article
        initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.72, ease: [0.16, 1, 0.3, 1] }}
        className="relative pb-28 text-white sm:pb-32 lg:pb-0"
      >
        <div className="flex items-center gap-3 px-5 py-4 sm:px-7 sm:py-5">
          <motion.button
            type="button"
            onClick={onBack}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.02, duration: 0.35, ease: "easeOut" }}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-black/40 text-zinc-200 transition hover:border-white/30 hover:bg-white/[0.05]"
            aria-label="Back to handle input"
          >
            <ArrowLeft className="h-4 w-4" />
          </motion.button>
          <h2 className="font-mono text-xl font-semibold tracking-tight text-white sm:text-2xl">
            Here&apos;s what Xpo sees on{" "}
            <span className="font-bold text-white">@{analysis.profile.username}</span>
          </h2>
        </div>

        <div className="grid gap-6 px-5 pt-5 sm:px-7 sm:pt-6 lg:grid-cols-[0.9fr_1.1fr]">
          <section>
            <div className="overflow-hidden rounded-[1.6rem] border border-white/10 bg-white/[0.03] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.22)] sm:p-5">
              <div className="relative aspect-[3/1] overflow-hidden border-b border-white/10 bg-[linear-gradient(135deg,#111827,#09090b_60%,#18181b)]">
                {analysis.profile.headerImageUrl ? (
                  <Image
                    src={analysis.profile.headerImageUrl}
                    alt={`${analysis.profile.name} banner`}
                    fill
                    className="object-cover"
                    sizes="(max-width: 1024px) 100vw, 720px"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.18),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.12),transparent_28%)]">
                    <span className="rounded-full border border-white/12 bg-black/35 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-300">
                      Header Missing
                    </span>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-transparent" />
              </div>

              <div className="pt-3 sm:pt-4">
                <div className="flex items-start gap-4">
                  <div className="relative -mt-12 h-24 w-24 shrink-0 overflow-hidden rounded-full border-4 border-black bg-zinc-900 shadow-[0_12px_32px_rgba(0,0,0,0.3)] sm:-mt-14 sm:h-28 sm:w-28">
                    {analysis.profile.avatarUrl ? (
                      <Image
                        src={analysis.profile.avatarUrl}
                        alt={`${analysis.profile.name} avatar`}
                        fill
                        className="object-cover"
                        sizes="112px"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xl font-semibold text-white">
                        {getInitials(analysis.profile.name)}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-semibold tracking-tight text-white">
                      {analysis.profile.name}
                    </h3>
                    {analysis.profile.isVerified ? (
                      <BadgeCheck className="h-4 w-4 text-sky-400" aria-label="Verified account" />
                    ) : null}
                  </div>
                  <p className="text-sm text-zinc-500">@{analysis.profile.username}</p>
                  <p className="mt-3 whitespace-pre-wrap text-[15px] leading-6 text-zinc-100">
                    {analysis.profile.bio || "No bio is visible in the current snapshot."}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-400">
                    <span>
                      <span className="font-semibold text-zinc-100">
                        {formatCompactNumber(analysis.profile.followingCount)}
                      </span>{" "}
                      Following
                    </span>
                    <span>
                      <span className="font-semibold text-zinc-100">
                        {formatCompactNumber(analysis.profile.followersCount)}
                      </span>{" "}
                      Followers
                    </span>
                    {joinDateLabel ? <span>Joined {joinDateLabel}</span> : null}
                  </div>
                </div>

                {analysis.profileSnapshot.pinnedPost ? (
                  <div className="mt-5 border-t border-white/10 pt-4">
                    <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                      <Pin className="h-3.5 w-3.5" />
                      Pinned Post
                    </div>
                    <p className="mt-3 text-sm leading-6 text-zinc-100">
                      {analysis.profileSnapshot.pinnedPost.text}
                    </p>
                    {analysis.profileSnapshot.pinnedPost.createdAt ? (
                      <p className="mt-2 text-xs text-zinc-500">
                        Posted {new Date(analysis.profileSnapshot.pinnedPost.createdAt).toLocaleDateString()}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-5 border-t border-white/10 pt-4">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200">
                        Needs Pinned Post
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-zinc-300">
                      {pinnedPostCheck?.summary ||
                        "A pinned post is missing, so the profile has no featured authority or conversion asset right now."}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="flex h-full flex-col justify-between">
            <div>
              <div className="space-y-0">
                {analysis.profileAudit.surfaceChecks.map((item) => (
                  <div
                    key={item.key}
                    className="border-b border-white/10 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-[13px] font-medium text-white">{item.label}</p>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.14em] ${getStatusBadgeClasses()}`}
                      >
                        {getStatusLabel(item.status)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-zinc-400">{item.summary}</p>
                  </div>
                ))}
              </div>

              <div className="pt-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Stage focus
                </p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {analysis.playbookGuide.stageMeta.highlight}
                </p>
                <p className="mt-2 text-sm leading-6 text-zinc-300">
                  win condition: {analysis.playbookGuide.stageMeta.winCondition}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {analysis.playbookGuide.stageMeta.priorities.map((priority) => (
                    <span
                      key={priority}
                      className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-300"
                    >
                      {priority}
                    </span>
                  ))}
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center">
                  {[
                    {
                      label: "Input",
                      value: analysis.playbookGuide.recommendedPlaybook.loop.input,
                    },
                    {
                      label: "Action",
                      value: analysis.playbookGuide.recommendedPlaybook.loop.action,
                    },
                    {
                      label: "Feedback",
                      value: analysis.playbookGuide.recommendedPlaybook.loop.feedback,
                    },
                  ].map((step, index) => (
                    <div key={step.label} className="contents">
                      <div className="border border-white/10 p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                          {step.label}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-zinc-100">{step.value}</p>
                      </div>
                      {index < 2 ? (
                        <div className="hidden justify-center text-zinc-500 md:flex">→</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="hidden pt-6 lg:block">
              <Link
                href={signupHref}
                className="landing-final-cta-button inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-white/80 bg-white px-6 py-3 text-center text-sm font-semibold uppercase tracking-[0.14em] text-black shadow-[0_0_28px_rgba(255,255,255,0.4),0_14px_36px_rgba(255,255,255,0.18)] transition hover:bg-zinc-100"
              >
                Continue to Xpo
              </Link>
            </div>
          </section>
        </div>
      </motion.article>

      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4 lg:hidden">
        <Link
          href={signupHref}
          className="landing-final-cta-button pointer-events-auto inline-flex min-h-12 w-full max-w-[26rem] items-center justify-center rounded-xl border border-white/80 bg-white px-6 py-3 text-center text-sm font-semibold uppercase tracking-[0.14em] text-black shadow-[0_0_28px_rgba(255,255,255,0.4),0_14px_36px_rgba(255,255,255,0.18)] transition hover:bg-zinc-100"
        >
          Continue to Xpo
        </Link>
      </div>
    </section>
  );
}
