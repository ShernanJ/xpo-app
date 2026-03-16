"use client";

import Image from "next/image";
import { BadgeCheck, Pin } from "lucide-react";

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

export function InlineProfileAnalysisCard(props: {
  artifact: ProfileAnalysisArtifact;
}) {
  const { artifact } = props;

  return (
    <div className="mt-4 mb-6 overflow-hidden rounded-[26px] border border-white/10 bg-[#0a0a0a] shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
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

      <div className="relative px-4 pb-4 pt-3 sm:px-5">
        <div className="pointer-events-none absolute right-4 top-3 inline-flex items-center justify-center px-1 py-1 text-right sm:right-5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-zinc-600">
              Conversion Score
            </p>
            <p className="mt-1 text-[18px] font-semibold text-zinc-100">
              {artifact.audit.score}/100
            </p>
          </div>
        </div>

        <div className="flex items-start gap-4">
          <div className="relative -mt-12 h-24 w-24 shrink-0 overflow-hidden rounded-full border-4 border-black bg-zinc-900 shadow-lg sm:-mt-14 sm:h-28 sm:w-28">
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
        </div>

        <div className="mt-3 pr-32 sm:pr-36">
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

        <div className="mt-5">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-zinc-500">
            <Pin className="h-3.5 w-3.5" />
            Pinned Post
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
  );
}
