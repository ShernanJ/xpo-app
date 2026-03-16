"use client";

import Image from "next/image";
import { BadgeCheck, Pin, Sparkles } from "lucide-react";

import type { ProfileAnalysisArtifact } from "@/lib/chat/profileAnalysisArtifact";

function formatCount(value: number): string {
  if (value >= 1_000_000) {
    return `${Number((value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1))}M`;
  }

  if (value >= 1_000) {
    return `${Number((value / 1_000).toFixed(value >= 10_000 ? 0 : 1))}K`;
  }

  return String(value);
}

function formatJoinDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
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

function formatListLabel(values: string[], emptyLabel: string): string {
  if (!values.length) {
    return emptyLabel;
  }

  return values.join(", ");
}

interface ProfileAnalysisBullet {
  label: string;
  body: string;
}

function buildProfileAnalysisNarrative(
  artifact: ProfileAnalysisArtifact,
): ProfileAnalysisBullet[] {
  const bioCheck = artifact.audit.bioFormulaCheck;
  const visualCheck = artifact.audit.visualRealEstateCheck;
  const pinnedCheck = artifact.audit.pinnedTweetCheck;
  const bannerAnalysis = artifact.bannerAnalysis ?? null;
  const bioDirection = bioCheck.alternatives[0]?.text || null;
  const bannerText = bannerAnalysis?.vision.readable_text.trim() || "";
  const pinnedText =
    pinnedCheck.pinnedPost?.text?.trim() || artifact.pinnedPost?.text?.trim() || "";

  return [
    {
      label: "Overall",
      body: `${artifact.audit.headline} Right now the profile is scoring ${artifact.audit.score}/100 because the main conversion surfaces are not reinforcing the same promise yet.`,
    },
    {
      label: "Bio",
      body: `${bioCheck.summary} The current bio reads "${bioCheck.bio || "No bio found."}" and is landing as ${bioCheck.status}. ${
        bioDirection
          ? `The clearest next direction is to rewrite it toward: "${bioDirection}".`
          : "The clearest next direction is to make the audience, outcome, and proof more explicit."
      }`,
    },
    {
      label: "Banner",
      body: bannerAnalysis
        ? `${visualCheck.summary} The banner reads as ${bannerAnalysis.vision.overall_vibe}, with ${
            bannerText
              ? `readable text that says "${bannerText}"`
              : "no clearly readable headline text"
          }, ${formatListLabel(
            bannerAnalysis.vision.color_palette,
            "an unclear color palette",
          )}, and ${formatListLabel(
            bannerAnalysis.vision.objects_detected,
            "no strong focal objects",
          )}. The avatar-overlap zone looks ${
            bannerAnalysis.vision.is_bottom_left_clear ? "clear" : "crowded"
          }, and the biggest banner fix is: ${
            bannerAnalysis.feedback.actionable_improvements[0] ||
            "make the promise clearer at a glance"
          }.`
        : `${visualCheck.summary} The banner is currently landing as ${visualCheck.status}, and ${
            visualCheck.headerClarityResolved
              ? `your self-check says it is ${visualCheck.headerClarity ?? "unclear"}`
              : "the value proposition is still unresolved from the current header read"
          }.`,
    },
    {
      label: "Pinned Post",
      body: `${pinnedCheck.summary} The pinned post is categorized as ${pinnedCheck.category.replace(/_/g, " ")}, and ${
        pinnedText
          ? `the current preview is "${pinnedText}"`
          : "there is no strong pinned story in place right now"
      }. The goal is to replace it with something that proves authority or tells the right story to new visitors.`,
    },
    {
      label: "Priority Order",
      body: artifact.audit.gaps.length
        ? artifact.audit.gaps.join(" ")
        : "Tighten the bio, sharpen the banner promise, and pin a post that proves why someone should follow.",
    },
  ];
}

export function InlineProfileAnalysisCard(props: {
  artifact: ProfileAnalysisArtifact;
}) {
  const { artifact } = props;
  const narrative = buildProfileAnalysisNarrative(artifact);

  return (
    <>
      <div className="mt-4 overflow-hidden rounded-[26px] border border-white/10 bg-[#0a0a0a] shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
        <div className="relative aspect-[3/1] overflow-hidden bg-[linear-gradient(135deg,#0f172a,#111827_55%,#1f2937)]">
          {artifact.profile.headerImageUrl ? (
            <Image
              src={artifact.profile.headerImageUrl}
              alt={`${artifact.profile.name} banner`}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 720px"
              unoptimized
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(29,155,240,0.2),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(244,63,94,0.18),transparent_30%)]">
              <div className="rounded-full border border-white/10 bg-black/40 px-4 py-2 text-xs uppercase tracking-[0.22em] text-zinc-300">
                Header Missing
              </div>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        </div>

        <div className="relative px-4 pb-4 sm:px-5">
          <div className="-mt-12 flex items-end justify-between gap-4 sm:-mt-14">
            <div className="relative h-24 w-24 overflow-hidden rounded-full border-4 border-black bg-zinc-900 shadow-lg sm:h-28 sm:w-28">
              {artifact.profile.avatarUrl ? (
                <Image
                  src={artifact.profile.avatarUrl}
                  alt={`${artifact.profile.name} avatar`}
                  fill
                  className="object-cover"
                  sizes="112px"
                  unoptimized
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xl font-semibold text-white">
                  {getInitials(artifact.profile.name)}
                </div>
              )}
            </div>

            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-sky-100">
              <Sparkles className="h-3.5 w-3.5" />
              Profile Audit
            </div>
          </div>

          <div className="mt-3">
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-semibold tracking-tight text-white">
                {artifact.profile.name}
              </h3>
              {artifact.profile.isVerified ? (
                <BadgeCheck className="h-4 w-4 text-sky-400" aria-label="Verified account" />
              ) : null}
            </div>
            <p className="text-sm text-zinc-500">@{artifact.profile.username}</p>
            <p className="mt-3 whitespace-pre-wrap text-[15px] leading-6 text-zinc-100">
              {artifact.profile.bio || "No bio set yet."}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-400">
              <span>
                <span className="font-semibold text-zinc-100">
                  {formatCount(artifact.profile.followingCount)}
                </span>{" "}
                Following
              </span>
              <span>
                <span className="font-semibold text-zinc-100">
                  {formatCount(artifact.profile.followersCount)}
                </span>{" "}
                Followers
              </span>
              <span>Joined {formatJoinDate(artifact.profile.createdAt)}</span>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Conversion Score</p>
              <p className="mt-1 text-lg font-semibold text-white">{artifact.audit.headline}</p>
            </div>
            <div className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-right">
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Score</p>
                <p className="text-2xl font-semibold text-white">{artifact.audit.score}/100</p>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-zinc-500">
              <Pin className="h-3.5 w-3.5" />
              Pinned Post Preview
            </div>
            <p className="mt-3 text-sm leading-6 text-zinc-100">
              {artifact.pinnedPost?.text || "No pinned post found on the latest profile snapshot."}
            </p>
            {artifact.pinnedPost?.createdAt ? (
              <p className="mt-2 text-xs text-zinc-500">
                Posted {new Date(artifact.pinnedPost.createdAt).toLocaleDateString()}
              </p>
            ) : null}
          </div>
        </div>
      </div>
      <section className="mt-4 text-sm leading-7 text-zinc-300">
        <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
          Profile Analysis
        </p>
        <ul className="mt-3 space-y-2">
          {narrative.map((item) => (
            <li
              key={`profile-analysis-${item.label}`}
              className="pl-4 -indent-4"
            >
              <span className="mr-2 text-zinc-500">•</span>
              <span className="font-semibold text-white">{item.label}:</span>{" "}
              <span>{item.body}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
