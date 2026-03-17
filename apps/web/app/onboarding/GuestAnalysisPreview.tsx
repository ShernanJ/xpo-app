"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Pin } from "lucide-react";
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

function getInitials(name: string): string {
  return (name.trim().slice(0, 2) || "?").toUpperCase();
}

function getStatusClasses(status: GuestAnalysisStatus): string {
  switch (status) {
    case "pass":
      return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
    case "warn":
      return "border-amber-300/25 bg-amber-300/10 text-amber-100";
    case "fail":
      return "border-rose-300/25 bg-rose-300/10 text-rose-100";
    default:
      return "border-white/12 bg-white/[0.04] text-zinc-200";
  }
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

function buildGuestAnalysisSummaryLine(analysis: GuestOnboardingAnalysis): string {
  const recentPostsNote = analysis.coverage.hasRecentPosts
    ? `${analysis.coverage.recentPostCount} recent posts`
    : "no recent posts yet";
  const pinnedNote = analysis.coverage.hasPinnedPost
    ? "pinned post in view"
    : "pinned-post coverage limited";

  return `${formatCompactNumber(analysis.profile.followersCount)} followers, ${recentPostsNote}, ${pinnedNote}`;
}

export function GuestAnalysisPreview(props: {
  analysis: GuestOnboardingAnalysis;
  signupHref: string;
  voicePreviewFormat: "shortform" | "longform";
  onVoicePreviewFormatChange: (value: "shortform" | "longform") => void;
  onBack: () => void;
}) {
  const { analysis, signupHref, voicePreviewFormat, onVoicePreviewFormatChange, onBack } = props;
  const activeVoicePreviewCopy =
    voicePreviewFormat === "shortform"
      ? analysis.voicePreview.shortform
      : analysis.voicePreview.longform;
  const activeVoicePreviewLimit = voicePreviewFormat === "shortform" ? 250 : 700;

  return (
    <motion.section
      initial={{ opacity: 0, y: 28, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.72, ease: [0.16, 1, 0.3, 1] }}
      className="relative mx-auto flex min-h-full w-full max-w-5xl flex-col justify-start py-2 sm:py-3 lg:h-full lg:min-h-0"
    >
      <motion.button
        type="button"
        onClick={onBack}
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.02, duration: 0.35, ease: "easeOut" }}
        className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/40 text-zinc-200 transition hover:border-white/30 hover:bg-white/[0.05]"
        aria-label="Back to handle input"
      >
        <ArrowLeft className="h-4 w-4" />
      </motion.button>

      <motion.article className="flex flex-1 flex-col rounded-[2rem] border border-white/12 bg-black/35 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.42)] backdrop-blur-md sm:p-6 lg:min-h-0 lg:overflow-hidden">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06, duration: 0.5, ease: "easeOut" }}
          className="flex flex-wrap items-center gap-2"
        >
          <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-300">
            Analysis Preview
          </span>
          <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-200">
            Stage {analysis.stage}
          </span>
          <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
            {buildGuestAnalysisSummaryLine(analysis)}
          </span>
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.5, ease: "easeOut" }}
          className="mt-4 font-mono text-3xl font-semibold tracking-tight text-white sm:text-4xl"
        >
          Here&apos;s what Xpo sees on{" "}
          <span className="font-bold text-white">@{analysis.profile.username}</span>
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16, duration: 0.5, ease: "easeOut" }}
          className="mt-2.5 max-w-3xl text-sm leading-7 text-zinc-300 sm:text-base"
        >
          {analysis.verdict}
        </motion.p>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
          <motion.div
            initial={{ opacity: 0, x: -14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.22, duration: 0.52, ease: "easeOut" }}
            className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"
          >
            <div className="relative h-32 border-b border-white/10 bg-[linear-gradient(135deg,#111827,#09090b_60%,#18181b)] sm:h-40">
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
                    Banner Not Captured
                  </span>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-transparent" />
            </div>

            <div className="px-4 pb-4 pt-3 sm:px-5">
              <div className="flex items-start gap-4">
                <div className="relative -mt-11 h-20 w-20 shrink-0 overflow-hidden rounded-full border-4 border-black bg-zinc-900 shadow-lg sm:-mt-14 sm:h-24 sm:w-24">
                  {analysis.profile.avatarUrl ? (
                    <Image
                      src={analysis.profile.avatarUrl}
                      alt={`${analysis.profile.name} avatar`}
                      fill
                      className="object-cover"
                      sizes="96px"
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
                  <h3 className="truncate text-xl font-semibold tracking-tight text-white">
                    {analysis.profile.name}
                  </h3>
                  {analysis.profile.isVerified ? (
                    <Image
                      src="/x-verified.svg"
                      alt="Verified account"
                      width={16}
                      height={16}
                      className="h-4 w-4 shrink-0"
                    />
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
                </div>
              </div>

              {analysis.profileSnapshot.pinnedPost ? (
                <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4">
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
              ) : null}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.26, duration: 0.52, ease: "easeOut" }}
            className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-4"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
              What To Fix First
            </p>
            <div className="mt-3 space-y-3">
              {analysis.priorities.map((item, index) => (
                <motion.div
                  key={`${item.key}-${index}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.34 + index * 0.06, duration: 0.42, ease: "easeOut" }}
                  className="rounded-2xl border border-white/10 bg-black/30 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-white">{item.title}</p>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${getStatusClasses(item.status)}`}
                    >
                      {getStatusLabel(item.status)}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-zinc-200">{item.why}</p>
                  <p className="mt-2 text-xs leading-5 text-zinc-400">How Xpo helps: {item.howXpoHelps}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[0.92fr_1.08fr]">
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3, duration: 0.44, ease: "easeOut" }}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Signals Xpo Used
              </p>
              <p className="text-[11px] text-zinc-500">{analysis.coverage.summary}</p>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {analysis.evidence.map((item) => (
                <div
                  key={item.key}
                  className={`rounded-2xl border p-3 ${getStatusClasses(item.status)}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em]">{item.label}</p>
                    <span className="text-[10px] uppercase tracking-[0.14em] text-current/80">
                      {getStatusLabel(item.status)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-5 text-current/90">{item.summary}</p>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.34, duration: 0.44, ease: "easeOut" }}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Generated In Your Voice
              </p>
              <div className="inline-flex items-center rounded-full border border-white/15 bg-black/45 p-1">
                {(["shortform", "longform"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onVoicePreviewFormatChange(option)}
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] transition ${
                      voicePreviewFormat === option
                        ? "bg-white text-black shadow-[0_0_14px_rgba(255,255,255,0.28)]"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {option === "shortform" ? "Shortform" : "Longform"}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-gradient-to-br from-zinc-700 to-zinc-900 text-xs font-semibold uppercase text-white">
                {analysis.profile.avatarUrl ? (
                  <div
                    className="h-full w-full bg-cover bg-center"
                    style={{ backgroundImage: `url(${analysis.profile.avatarUrl})` }}
                    role="img"
                    aria-label={`${analysis.profile.name} profile photo`}
                  />
                ) : (
                  getInitials(analysis.profile.name).slice(0, 1)
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-white">{analysis.profile.name}</p>
                <p className="text-xs text-zinc-500">@{analysis.profile.username}</p>
              </div>
            </div>

            <div
              className={`mt-3 overflow-y-auto pr-2 ${
                voicePreviewFormat === "longform" ? "max-h-[190px]" : "max-h-[160px]"
              }`}
            >
              <p className="whitespace-pre-wrap text-[15px] leading-7 text-zinc-100">
                {activeVoicePreviewCopy}
              </p>
            </div>

            <p className="mt-4 text-xs text-zinc-500">
              {activeVoicePreviewCopy.length}/{activeVoicePreviewLimit} chars
            </p>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.45, ease: "easeOut" }}
          className="mt-5 flex items-center justify-center"
        >
          <Link
            href={signupHref}
            className="landing-final-cta-button inline-flex items-center justify-center rounded-xl border border-white/80 bg-white px-6 py-2.5 text-sm font-semibold uppercase tracking-[0.14em] text-black shadow-[0_0_28px_rgba(255,255,255,0.4),0_14px_36px_rgba(255,255,255,0.18)] transition hover:bg-zinc-100"
          >
            Create Free Account To Unlock Full Analysis
          </Link>
        </motion.div>
      </motion.article>
    </motion.section>
  );
}
