"use client";

import { useEffect, useRef, useState } from "react";
import { Download, LayoutTemplate, Sparkles } from "lucide-react";

import type { ProfileAuditBannerPreset } from "@/lib/onboarding/profile/profileConversionAudit";

const BANNER_WIDTH = 1500;
const BANNER_HEIGHT = 500;

interface BannerTheme {
  background: string;
  secondary: string;
  accent: string;
  accentSoft: string;
  textPrimary: string;
  textSecondary: string;
}

interface ProfileAuditBannerGeneratorProps {
  presets: ProfileAuditBannerPreset[];
  onOpen: () => void;
  onDownload: (presetId: string) => void;
}

const FALLBACK_THEME: BannerTheme = {
  background: "#0f172a",
  secondary: "#162033",
  accent: "#7dd3fc",
  accentSoft: "#1f314a",
  textPrimary: "#f8fafc",
  textSecondary: "#cbd5e1",
};

const PRESET_THEMES: Record<string, BannerTheme> = {
  "authority-stack": {
    background: "#101828",
    secondary: "#1d2939",
    accent: "#36cfc9",
    accentSoft: "#143d44",
    textPrimary: "#f8fafc",
    textSecondary: "#cbd5e1",
  },
  "audience-first": {
    background: "#171717",
    secondary: "#262626",
    accent: "#f59e0b",
    accentSoft: "#422006",
    textPrimary: "#fafaf9",
    textSecondary: "#d6d3d1",
  },
  "value-prop": {
    background: "#111827",
    secondary: "#1f2937",
    accent: "#60a5fa",
    accentSoft: "#1e3a5f",
    textPrimary: "#f9fafb",
    textSecondary: "#d1d5db",
  },
};

function resolveTheme(presetId: string): BannerTheme {
  return PRESET_THEMES[presetId] ?? FALLBACK_THEME;
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapText(value: string, maxCharsPerLine: number, maxLines: number): string[] {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return [];
  }

  const words = normalized.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    if (nextLine.length <= maxCharsPerLine) {
      currentLine = nextLine;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
    }
    currentLine = word;

    if (lines.length === maxLines - 1) {
      break;
    }
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  const remainingWords = words.slice(lines.join(" ").split(" ").filter(Boolean).length);
  if (remainingWords.length > 0 && lines.length > 0) {
    const lastLine = lines[lines.length - 1] ?? "";
    lines[lines.length - 1] = `${lastLine.replace(/\u2026$/, "")}\u2026`;
  }

  return lines;
}

function renderTextBlock(args: {
  lines: string[];
  x: number;
  y: number;
  fill: string;
  fontSize: number;
  lineHeight: number;
  fontWeight: number;
  letterSpacing?: number;
}): string {
  if (args.lines.length === 0) {
    return "";
  }

  return `<text x="${args.x}" y="${args.y}" fill="${args.fill}" font-family="'Space Grotesk', 'Avenir Next', sans-serif" font-size="${args.fontSize}" font-weight="${args.fontWeight}"${
    args.letterSpacing ? ` letter-spacing="${args.letterSpacing}"` : ""
  }>${args.lines
    .map((line, index) => {
      const dy = index === 0 ? 0 : args.lineHeight;
      return `<tspan x="${args.x}" dy="${dy}">${escapeSvgText(line)}</tspan>`;
    })
    .join("")}</text>`;
}

export function buildProfileAuditBannerSvg(preset: ProfileAuditBannerPreset): string {
  const theme = resolveTheme(preset.id);
  const headlineLines = wrapText(preset.headline, 18, 2);
  const subheadlineLines = wrapText(preset.subheadline, 44, 2);
  const supportLine = preset.proofLine ?? preset.ctaLine ?? "Profile conversion starts at the header.";
  const supportLines = wrapText(supportLine, 30, 2);

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${BANNER_WIDTH}" height="${BANNER_HEIGHT}" viewBox="0 0 ${BANNER_WIDTH} ${BANNER_HEIGHT}" fill="none">
      <defs>
        <linearGradient id="bg-${preset.id}" x1="0" y1="0" x2="1500" y2="500" gradientUnits="userSpaceOnUse">
          <stop stop-color="${theme.background}" />
          <stop offset="1" stop-color="${theme.secondary}" />
        </linearGradient>
        <linearGradient id="glow-${preset.id}" x1="0" y1="0" x2="1" y2="1">
          <stop stop-color="${theme.accent}" stop-opacity="0.9" />
          <stop offset="1" stop-color="${theme.accentSoft}" stop-opacity="0.55" />
        </linearGradient>
      </defs>
      <rect width="${BANNER_WIDTH}" height="${BANNER_HEIGHT}" rx="36" fill="url(#bg-${preset.id})" />
      <circle cx="1235" cy="120" r="180" fill="url(#glow-${preset.id})" opacity="0.9" />
      <circle cx="1360" cy="390" r="160" fill="${theme.accentSoft}" opacity="0.55" />
      <path d="M70 88H250" stroke="${theme.accent}" stroke-width="8" stroke-linecap="round" opacity="0.95" />
      <path d="M70 418H370" stroke="${theme.accent}" stroke-width="8" stroke-linecap="round" opacity="0.65" />
      <rect x="76" y="120" width="488" height="260" rx="28" fill="#020617" fill-opacity="0.18" stroke="${theme.accentSoft}" />
      ${renderTextBlock({
        lines: ["X PROFILE"],
        x: 92,
        y: 100,
        fill: theme.textSecondary,
        fontSize: 22,
        lineHeight: 24,
        fontWeight: 700,
        letterSpacing: 3.4,
      })}
      ${renderTextBlock({
        lines: headlineLines,
        x: 96,
        y: 210,
        fill: theme.textPrimary,
        fontSize: 64,
        lineHeight: 74,
        fontWeight: 700,
      })}
      ${renderTextBlock({
        lines: subheadlineLines,
        x: 96,
        y: 332,
        fill: theme.textSecondary,
        fontSize: 28,
        lineHeight: 36,
        fontWeight: 500,
      })}
      <rect x="820" y="116" width="540" height="264" rx="28" fill="#020617" fill-opacity="0.16" stroke="${theme.accentSoft}" />
      ${renderTextBlock({
        lines: ["Clear value prop", "Visible proof", "One-glance authority"],
        x: 864,
        y: 184,
        fill: theme.textPrimary,
        fontSize: 34,
        lineHeight: 46,
        fontWeight: 600,
      })}
      <rect x="864" y="314" width="340" height="44" rx="22" fill="${theme.accentSoft}" />
      ${renderTextBlock({
        lines: supportLines,
        x: 890,
        y: 344,
        fill: theme.textPrimary,
        fontSize: 20,
        lineHeight: 22,
        fontWeight: 600,
      })}
      <text x="1198" y="446" fill="${theme.textSecondary}" font-family="'Space Grotesk', 'Avenir Next', sans-serif" font-size="24" font-weight="600">Built with Xpo</text>
    </svg>
  `.trim();
}

function toSvgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function loadSvgImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load generated banner image."));
    image.src = url;
  });
}

async function downloadBannerPng(preset: ProfileAuditBannerPreset): Promise<boolean> {
  const svg = buildProfileAuditBannerSvg(preset);
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const image = await loadSvgImage(svgUrl);
    const canvas = document.createElement("canvas");
    canvas.width = BANNER_WIDTH;
    canvas.height = BANNER_HEIGHT;

    const context = canvas.getContext("2d");
    if (!context) {
      return false;
    }

    context.drawImage(image, 0, 0, BANNER_WIDTH, BANNER_HEIGHT);
    const pngUrl = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = pngUrl;
    link.download = `xpo-banner-${preset.id}.png`;
    link.click();
    return true;
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

export function ProfileAuditBannerGenerator(props: ProfileAuditBannerGeneratorProps) {
  const { presets, onOpen, onDownload } = props;
  const [isOpen, setIsOpen] = useState(false);
  const [activePresetId, setActivePresetId] = useState<string | null>(presets[0]?.id ?? null);
  const [isDownloading, setIsDownloading] = useState(false);
  const trackedOpenRef = useRef(false);

  useEffect(() => {
    setActivePresetId((current) => {
      if (current && presets.some((preset) => preset.id === current)) {
        return current;
      }

      return presets[0]?.id ?? null;
    });
  }, [presets]);

  useEffect(() => {
    if (!isOpen || trackedOpenRef.current) {
      return;
    }

    trackedOpenRef.current = true;
    onOpen();
  }, [isOpen, onOpen]);

  const activePreset =
    presets.find((preset) => preset.id === activePresetId) ?? presets[0] ?? null;

  if (presets.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Header generator
          </p>
          <p className="mt-2 text-sm text-zinc-300">
            Generate a simple 1500x500 banner with a clear promise, proof, or CTA.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.04] hover:text-white"
        >
          <LayoutTemplate className="h-4 w-4" />
          <span>{isOpen ? "Hide generator" : "Open banner generator"}</span>
        </button>
      </div>

      {isOpen && activePreset ? (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            {presets.map((preset) => {
              const isActive = preset.id === activePreset.id;

              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setActivePresetId(preset.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs transition ${
                    isActive
                      ? "border-white/30 bg-white/[0.08] text-white"
                      : "border-white/10 bg-black/30 text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                  }`}
                >
                  {preset.headline}
                </button>
              );
            })}
          </div>

          <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#050505]">
            <img
              src={toSvgDataUrl(buildProfileAuditBannerSvg(activePreset))}
              alt={`${activePreset.headline} banner preview`}
              className="h-auto w-full"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center gap-2 text-zinc-300">
                <Sparkles className="h-4 w-4 text-zinc-500" />
                <span className="text-sm font-medium text-white">{activePreset.headline}</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-zinc-300">{activePreset.subheadline}</p>
              {activePreset.proofLine ? (
                <p className="mt-3 text-xs uppercase tracking-[0.14em] text-emerald-300">
                  Proof: {activePreset.proofLine}
                </p>
              ) : null}
              {activePreset.ctaLine ? (
                <p className="mt-3 text-xs uppercase tracking-[0.14em] text-sky-300">
                  CTA: {activePreset.ctaLine}
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={async () => {
                if (isDownloading) {
                  return;
                }

                setIsDownloading(true);
                try {
                  const downloaded = await downloadBannerPng(activePreset);
                  if (!downloaded) {
                    return;
                  }
                  onDownload(activePreset.id);
                } finally {
                  setIsDownloading(false);
                }
              }}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isDownloading}
            >
              <Download className="h-4 w-4" />
              <span>{isDownloading ? "Preparing PNG..." : "Download 1500x500 PNG"}</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
