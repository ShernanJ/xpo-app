"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useSession } from "@/lib/auth/client";
import { PenLine, Search, Sparkles, Target } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import { XShell } from "@/components/x-shell";
import { isMonetizationEnabled } from "@/lib/billing/monetization";
import type { BillingStatePayload } from "@/lib/billing/types";
import {
  buildPostHogHeaders,
  capturePostHogEvent,
  capturePostHogException,
} from "@/lib/posthog/client";
import type {
  GuestOnboardingAnalysis,
  OnboardingPreviewSource,
} from "@/lib/onboarding/guestAnalysis";
import type { XPublicProfile } from "@/lib/onboarding/types";
import { GuestAnalysisPreview } from "./GuestAnalysisPreview";

interface ValidationError {
  field: string;
  message: string;
}

interface OnboardingPreviewSuccess {
  ok: true;
  account: string;
  preview: XPublicProfile | null;
  source?: OnboardingPreviewSource;
}

interface OnboardingPreviewFailure {
  ok: false;
  errors: ValidationError[];
}

interface OnboardingAnalysisSuccess {
  ok: true;
  account: string;
  analysis: GuestOnboardingAnalysis;
}

interface OnboardingAnalysisFailure {
  ok: false;
  errors: ValidationError[];
}

type OnboardingPreviewResponse = OnboardingPreviewSuccess | OnboardingPreviewFailure;
type OnboardingAnalysisResponse = OnboardingAnalysisSuccess | OnboardingAnalysisFailure;
type LandingPricingOffer = BillingStatePayload["offers"][number];

interface OnboardingLandingProps {
  pricingOffers: LandingPricingOffer[];
}

const LOADING_STEPS = [
  "collecting your posts...",
  "understanding how you speak...",
  "mapping your audience...",
  "analyzing your performance...",
  "setting up your workspace...",
] as const;

const CORE_FEATURES = [
  {
    title: "Stage-aware guidance",
    body: "Xpo picks the most impactful next move for your current stage.",
  },
  {
    title: "Repeatable workflow",
    body: "Analyze → plan → draft → refine → post.",
  },
  {
    title: "Voice fidelity",
    body: "Output stays in your tone, not generic AI style.",
  },
] as const;

const STAGE_PLAYBOOKS = [
  {
    stage: "0 → 1k",
    focus: "Distribution + proof",
    xpoHelp: "Xpo spots reply threads worth entering and gives quick standalone post angles you can ship today.",
  },
  {
    stage: "1k → 10k",
    focus: "Retention + positioning",
    xpoHelp: "Xpo turns winning posts into repeatable pillars, stronger hook variants, and a weekly execution plan.",
  },
  {
    stage: "10k → 50k",
    focus: "Depth + leverage",
    xpoHelp: "Xpo expands one high-signal idea into threads, standalones, replies, and sequel prompts.",
  },
  {
    stage: "50k+",
    focus: "Product + ecosystem",
    xpoHelp: "Xpo aligns content to offers, launch windows, and repeatable audience-to-revenue loops.",
  },
] as const;

const HOW_IT_WORKS_STEPS = [
  {
    step: "01",
    title: "Scan Your Account",
    body: "Paste your X handle and Xpo maps your profile + post signals in seconds.",
  },
  {
    step: "02",
    title: "Get Your Next Move",
    body: "Xpo finds your growth stage and recommends the next best action right now.",
  },
  {
    step: "03",
    title: "Draft And Ship",
    body: "Turn strategy into ready-to-post drafts you can refine in your own voice.",
  },
] as const;

const HERO_SIGNAL_STRIP = [
  {
    title: "Scans your recent posts + replies",
    Icon: Search,
  },
  {
    title: "Finds your next best move",
    Icon: Target,
  },
  {
    title: "Writes drafts in your X voice",
    Icon: PenLine,
  },
] as const;

const FAQ_ITEMS = [
  {
    question: "How does onboarding work?",
    answer:
      "Enter your X handle and Xpo maps your profile + post signals, then sets up a stage-aware workflow.",
  },
  {
    question: "Will it sound like me?",
    answer:
      "Yes. Xpo biases toward your voice patterns and constraints, then lets you refine tone before posting.",
  },
  {
    question: "Do I need the extension?",
    answer:
      "No. The main app is complete on its own. The extension is optional for faster in-feed reply execution.",
  },
  {
    question: "Can I switch plans later?",
    answer:
      "Yes. You can start free and upgrade anytime from pricing without losing account context.",
  },
] as const;

const AMBIENT_DOTS = [
  { top: "8%", left: "7%", size: 3, delay: "0.2s" },
  { top: "14%", left: "86%", size: 2, delay: "1.1s" },
  { top: "22%", left: "12%", size: 2, delay: "1.8s" },
  { top: "28%", left: "79%", size: 3, delay: "0.8s" },
  { top: "36%", left: "18%", size: 2, delay: "2.3s" },
  { top: "44%", left: "88%", size: 2, delay: "0.5s" },
  { top: "53%", left: "9%", size: 3, delay: "1.5s" },
  { top: "61%", left: "74%", size: 2, delay: "2.8s" },
  { top: "69%", left: "16%", size: 2, delay: "1.2s" },
  { top: "77%", left: "83%", size: 3, delay: "0.9s" },
  { top: "84%", left: "24%", size: 2, delay: "2.1s" },
  { top: "90%", left: "68%", size: 2, delay: "1.7s" },
] as const;

const AMBIENT_LINES = [
  { top: "18%", left: "9%", width: "34%", delay: "0.3s" },
  { top: "41%", left: "56%", width: "28%", delay: "1.4s" },
  { top: "63%", left: "14%", width: "31%", delay: "0.9s" },
  { top: "86%", left: "48%", width: "36%", delay: "2.2s" },
] as const;

const AMBIENT_PACKETS = [
  { top: "17%", delay: "0s", duration: "13s" },
  { top: "40%", delay: "2.4s", duration: "12s" },
  { top: "62%", delay: "1.2s", duration: "14s" },
  { top: "85%", delay: "3.6s", duration: "11s" },
] as const;

function parsePublicUsdToCents(rawValue: string | undefined, fallbackCents: number): number {
  if (!rawValue) {
    return fallbackCents;
  }

  const normalized = rawValue.trim().replace(/\$/g, "").replace(/,/g, "");
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackCents;
  }

  return Math.round(parsed * 100);
}

const BILLING_DISPLAY_CURRENCY = (() => {
  const raw = process.env.NEXT_PUBLIC_BILLING_DISPLAY_CURRENCY?.trim().toUpperCase();
  return raw === "USD" ? "USD" : "CAD";
})();

function formatUsdPrice(amountCents: number): string {
  return new Intl.NumberFormat(BILLING_DISPLAY_CURRENCY === "CAD" ? "en-CA" : "en-US", {
    style: "currency",
    currency: BILLING_DISPLAY_CURRENCY,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountCents / 100);
}

const LANDING_PRO_MONTHLY_CENTS = parsePublicUsdToCents(
  process.env.NEXT_PUBLIC_BILLING_PRICE_PRO_MONTHLY_CAD ??
    process.env.NEXT_PUBLIC_BILLING_PRICE_PRO_MONTHLY_USD,
  1999,
);
const LANDING_PRO_ANNUAL_CENTS = parsePublicUsdToCents(
  process.env.NEXT_PUBLIC_BILLING_PRICE_PRO_ANNUAL_CAD ??
    process.env.NEXT_PUBLIC_BILLING_PRICE_PRO_ANNUAL_USD,
  19999,
);
const LANDING_LIFETIME_CENTS = parsePublicUsdToCents(
  process.env.NEXT_PUBLIC_BILLING_PRICE_FOUNDER_PASS_CAD ??
    process.env.NEXT_PUBLIC_BILLING_PRICE_FOUNDER_PASS_USD ??
    process.env.NEXT_PUBLIC_BILLING_PRICE_LIFETIME_CAD ??
    process.env.NEXT_PUBLIC_BILLING_PRICE_LIFETIME_USD,
  49900,
);
const LANDING_FREE_CREDITS_PER_MONTH = 50;
const LANDING_PRO_CREDITS_PER_MONTH = 500;
const LANDING_CHAT_TURN_CREDIT_COST = 2;
const LANDING_DRAFT_TURN_CREDIT_COST = 5;
const LANDING_SECTION_VIEWPORT = {
  once: true,
  amount: 0.18,
  margin: "0px 0px -8% 0px",
} as const;
const LANDING_LOADING_TRANSITION_MS = 1100;
const LANDING_MIN_ANALYSIS_LOADING_MS = 5200;
const LANDING_CARD_HOVER = {
  y: -4,
  transition: {
    duration: 0.24,
    ease: [0.22, 1, 0.36, 1] as const,
  },
};

const LANDING_ONBOARDING_STACK_REVEAL = {
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
    transition: {
      duration: 0.26,
      ease: [0.16, 1, 0.3, 1] as const,
      delayChildren: 0.12,
      staggerChildren: 0.12,
    },
  },
};

const LANDING_ONBOARDING_ITEM_REVEAL = {
  hidden: {
    opacity: 0,
    y: 18,
    filter: "blur(4px)",
  },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: {
      duration: 0.66,
      ease: [0.16, 1, 0.3, 1] as const,
    },
  },
};

const LANDING_LOADING_STACK_REVEAL = {
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
    transition: {
      delayChildren: 0.08,
      staggerChildren: 0.12,
    },
  },
};

const LANDING_LOADING_ITEM_REVEAL = {
  hidden: {
    opacity: 0,
    y: 14,
    filter: "blur(3px)",
  },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: {
      duration: 0.46,
      ease: [0.16, 1, 0.3, 1] as const,
    },
  },
};

function sectionReveal(delay: number) {
  return {
    hidden: {
      opacity: 0,
      y: 22,
      filter: "blur(4px)",
    },
    visible: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: {
        duration: 0.72,
        delay,
        ease: [0.16, 1, 0.3, 1] as const,
      },
    },
  };
}

function normalizeHandle(value: string): string {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

export default function OnboardingLanding({ pricingOffers }: OnboardingLandingProps) {
  const { status, update } = useSession();
  const monetizationEnabled = isMonetizationEnabled();
  const [account, setAccount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLaunchingLoading, setIsLaunchingLoading] = useState(false);
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<XPublicProfile | null>(null);
  const [guestAnalysisPreview, setGuestAnalysisPreview] = useState<GuestOnboardingAnalysis | null>(
    null,
  );
  const [voicePreviewFormat, setVoicePreviewFormat] = useState<"shortform" | "longform">(
    "shortform",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAccountFocused, setIsAccountFocused] = useState(false);
  const [openFaqIndexes, setOpenFaqIndexes] = useState<number[]>([0]);
  const [landingProCadence, setLandingProCadence] = useState<"monthly" | "annual">("monthly");
  const proMonthlyOffer = pricingOffers.find((offer) => offer.offer === "pro_monthly");
  const proAnnualOffer = pricingOffers.find((offer) => offer.offer === "pro_annual");
  const lifetimeOffer = pricingOffers.find((offer) => offer.offer === "lifetime");
  const landingProMonthlyCents = proMonthlyOffer?.amountCents ?? LANDING_PRO_MONTHLY_CENTS;
  const landingProAnnualCents = proAnnualOffer?.amountCents ?? LANDING_PRO_ANNUAL_CENTS;
  const landingLifetimeCents = lifetimeOffer?.amountCents ?? LANDING_LIFETIME_CENTS;
  const landingProMonthlyEnabled = proMonthlyOffer?.enabled ?? true;
  const landingProAnnualEnabled = proAnnualOffer?.enabled ?? true;
  const normalizedAccount = normalizeHandle(account);
  const hasValidPreview =
    Boolean(preview) && normalizeHandle(preview?.username ?? "") === normalizedAccount;
  const landingProIsAnnual = landingProCadence === "annual";
  const landingSelectedProCents = landingProIsAnnual
    ? landingProAnnualCents
    : landingProMonthlyCents;
  const landingSelectedProPriceSuffix = landingProIsAnnual ? " / year" : " / month";
  const landingFreeApproxChatTurns = Math.floor(
    LANDING_FREE_CREDITS_PER_MONTH / LANDING_CHAT_TURN_CREDIT_COST,
  );
  const landingFreeApproxDraftTurns = Math.floor(
    LANDING_FREE_CREDITS_PER_MONTH / LANDING_DRAFT_TURN_CREDIT_COST,
  );
  const landingProApproxChatTurns = Math.floor(
    LANDING_PRO_CREDITS_PER_MONTH / LANDING_CHAT_TURN_CREDIT_COST,
  );
  const landingProApproxDraftTurns = Math.floor(
    LANDING_PRO_CREDITS_PER_MONTH / LANDING_DRAFT_TURN_CREDIT_COST,
  );
  const visibleFaqItems = monetizationEnabled
    ? FAQ_ITEMS
    : FAQ_ITEMS.filter((item) => item.question !== "Can I switch plans later?");
  const autofillStyles = (
    <style jsx>{`
      .landingAccountInput:-webkit-autofill,
      .landingAccountInput:-webkit-autofill:hover,
      .landingAccountInput:-webkit-autofill:focus {
        -webkit-text-fill-color: #ffffff !important;
        -webkit-box-shadow: 0 0 0 1000px #050505 inset !important;
        box-shadow: 0 0 0 1000px #050505 inset !important;
        transition: background-color 9999s ease-in-out 0s;
        caret-color: #ffffff;
        border-radius: 9999px;
      }
    `}</style>
  );
  const landingMotionStyles = (
    <style jsx global>{`
      @keyframes landingFloat {
        0%,
        100% {
          transform: translateY(0px);
        }
        50% {
          transform: translateY(-4px);
        }
      }

      @keyframes landingAmbientPulse {
        0%,
        100% {
          opacity: 0.18;
          transform: scale(1);
        }
        50% {
          opacity: 0.48;
          transform: scale(1.35);
        }
      }

      @keyframes landingAmbientDrift {
        0%,
        100% {
          transform: translateY(0px);
        }
        50% {
          transform: translateY(-6px);
        }
      }

      @keyframes landingAmbientSweep {
        0%,
        100% {
          opacity: 0.08;
          transform: translateX(0);
        }
        50% {
          opacity: 0.32;
          transform: translateX(8px);
        }
      }

      @keyframes landingPacketRun {
        0% {
          opacity: 0;
          transform: translateX(-18vw) scaleX(0.8);
        }
        12% {
          opacity: 0.7;
        }
        88% {
          opacity: 0.7;
        }
        100% {
          opacity: 0;
          transform: translateX(118vw) scaleX(1.08);
        }
      }

      @keyframes landingGridDrift {
        0% {
          background-position:
            0 0,
            -1px -1px,
            -1px -1px;
        }
        100% {
          background-position:
            0 24px,
            38px 24px,
          38px 24px;
        }
      }

      @keyframes landingInputShimmer {
        0% {
          transform: translateX(-140%);
          opacity: 0;
        }
        20% {
          opacity: 0.18;
        }
        46% {
          opacity: 0.24;
        }
        100% {
          transform: translateX(140%);
          opacity: 0;
        }
      }

      @keyframes landingFinalCtaPulse {
        0%,
        100% {
          transform: translateY(0) scale(1);
          box-shadow:
            0 0 0 0 rgba(255, 255, 255, 0.12),
            0 0 28px rgba(255, 255, 255, 0.42),
            0 14px 36px rgba(255, 255, 255, 0.18);
        }
        50% {
          transform: translateY(-1px) scale(1.015);
          box-shadow:
            0 0 0 8px rgba(255, 255, 255, 0.07),
            0 0 46px rgba(255, 255, 255, 0.72),
            0 18px 46px rgba(255, 255, 255, 0.28);
        }
      }

      .landing-infra-grid {
        position: absolute;
        inset: 0;
        opacity: 0.18;
        background-image:
          linear-gradient(to bottom, rgba(255, 255, 255, 0.045) 1px, transparent 1px),
          linear-gradient(to right, rgba(255, 255, 255, 0.07) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
        background-size:
          100% 6px,
          56px 56px,
          56px 56px;
        mask-image: radial-gradient(circle at 50% 45%, rgba(0, 0, 0, 0.9), transparent 92%);
        animation: landingGridDrift 18s linear infinite;
      }

      .landing-infra-vignette {
        position: absolute;
        inset: 0;
        background:
          radial-gradient(circle at 50% 42%, transparent 0%, rgba(0, 0, 0, 0.2) 58%, rgba(0, 0, 0, 0.65) 100%),
          linear-gradient(to bottom, rgba(4, 4, 4, 0.2), rgba(4, 4, 4, 0.72));
      }

      .landing-infra-rail {
        position: absolute;
        inset-y: 0;
        left: 50%;
        width: 1px;
        transform: translateX(-50%);
        background: linear-gradient(
          to bottom,
          transparent 0%,
          rgba(148, 163, 184, 0.18) 18%,
          rgba(148, 163, 184, 0.12) 82%,
          transparent 100%
        );
        opacity: 0.35;
      }

      .landing-hero-shell {
        animation: landingFloat 9s ease-in-out infinite;
      }

      .landing-cta-input-shell {
        display: block;
        width: 100%;
        position: relative;
        overflow: hidden;
        border-radius: 0.85rem;
        border: 1px solid rgba(148, 163, 184, 0.5);
        background: linear-gradient(180deg, rgba(14, 18, 28, 0.98), rgba(10, 14, 24, 0.98));
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.05),
          inset 0 -1px 0 rgba(255, 255, 255, 0.03),
          0 0 0 1px rgba(255, 255, 255, 0.08);
        transition:
          border-color 220ms ease,
          box-shadow 220ms ease,
          background-color 220ms ease;
      }

      .landing-cta-input-shell::after {
        content: "";
        pointer-events: none;
        position: absolute;
        inset: 0;
        z-index: 1;
        background: linear-gradient(
          110deg,
          transparent 20%,
          rgba(226, 232, 240, 0.1) 44%,
          rgba(226, 232, 240, 0.22) 50%,
          rgba(226, 232, 240, 0.1) 56%,
          transparent 80%
        );
        transform: translateX(-140%);
        opacity: 0;
      }

      .landing-cta-input-shell.is-idle {
        border-color: rgba(148, 163, 184, 0.5);
      }

      .landing-cta-input-shell.is-idle::after {
        animation: landingInputShimmer 5.2s linear infinite;
      }

      .landing-cta-input-shell.is-focused {
        border-color: rgba(226, 232, 240, 0.62);
        background: linear-gradient(180deg, rgba(12, 17, 30, 0.96), rgba(8, 12, 22, 0.98));
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.08),
          inset 0 -1px 0 rgba(255, 255, 255, 0.04),
          0 0 0 1px rgba(226, 232, 240, 0.22),
          0 0 22px rgba(148, 163, 184, 0.16);
      }

      .landing-cta-input-shell.is-focused::after {
        animation: landingInputShimmer 2.1s linear infinite;
      }

      .landing-cta-input-shell.is-filled:not(.is-focused) {
        border-color: rgba(148, 163, 184, 0.44);
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.06),
          inset 0 -1px 0 rgba(255, 255, 255, 0.04),
          0 0 0 1px rgba(148, 163, 184, 0.18);
      }

      .landing-cta-input-shell.is-filled:not(.is-focused)::after {
        animation: landingInputShimmer 3.6s linear infinite;
      }

      .landing-cta-input-shell :where(input, span) {
        position: relative;
        z-index: 2;
      }

      .landing-card-motion {
        position: relative;
        overflow: hidden;
        transition:
          transform 260ms ease,
          border-color 260ms ease,
          background-color 260ms ease,
          box-shadow 260ms ease;
      }

      .landing-card-motion::after {
        content: "";
        pointer-events: none;
        position: absolute;
        inset: 0;
        background: linear-gradient(
          120deg,
          transparent 20%,
          rgba(148, 163, 184, 0.08) 45%,
          rgba(148, 163, 184, 0.2) 50%,
          rgba(148, 163, 184, 0.08) 55%,
          transparent 80%
        );
        opacity: 0;
        transform: translateX(-120%);
        transition:
          opacity 260ms ease,
          transform 560ms ease;
      }

      .landing-card-motion:hover::after {
        opacity: 1;
        transform: translateX(120%);
      }

      .landing-card-motion:hover {
        transform: translateY(-3px);
        border-color: rgba(255, 255, 255, 0.18);
        background-color: rgba(255, 255, 255, 0.045);
        box-shadow: 0 14px 30px rgba(0, 0, 0, 0.32);
      }

      .landing-ambient-dot {
        position: absolute;
        border-radius: 9999px;
        background: rgba(148, 163, 184, 0.55);
        box-shadow: 0 0 12px rgba(148, 163, 184, 0.45);
        animation:
          landingAmbientPulse 5s ease-in-out infinite,
          landingAmbientDrift 12s ease-in-out infinite;
      }

      .landing-ambient-line {
        position: absolute;
        height: 1px;
        background: linear-gradient(
          90deg,
          transparent 0%,
          rgba(148, 163, 184, 0.22) 40%,
          rgba(148, 163, 184, 0.3) 50%,
          rgba(148, 163, 184, 0.22) 60%,
          transparent 100%
        );
        animation: landingAmbientSweep 10s ease-in-out infinite;
      }

      .landing-ambient-packet {
        position: absolute;
        left: 0;
        width: 52px;
        height: 1px;
        background: linear-gradient(90deg, transparent 0%, rgba(226, 232, 240, 0.9) 100%);
        filter: drop-shadow(0 0 6px rgba(226, 232, 240, 0.6));
        animation: landingPacketRun linear infinite;
      }

      .landing-root :where(a[href], button:not(:disabled), [role="button"]) {
        cursor: pointer;
        transition:
          filter 180ms ease,
          color 180ms ease,
          background-color 180ms ease,
          border-color 180ms ease,
          box-shadow 180ms ease;
      }

      .landing-root :where(a[href], button:not(:disabled), [role="button"]):hover {
        filter: brightness(1.08);
      }

      .landing-root button:disabled {
        cursor: not-allowed;
      }

      .landing-final-cta-button {
        animation: landingFinalCtaPulse 1.9s ease-in-out infinite;
      }

      .landing-final-cta-button:hover {
        box-shadow:
          0 0 0 10px rgba(255, 255, 255, 0.08),
          0 0 54px rgba(255, 255, 255, 0.78),
          0 20px 52px rgba(255, 255, 255, 0.32);
      }

      @media (prefers-reduced-motion: reduce) {
        .landing-hero-shell {
          animation: none !important;
          opacity: 1 !important;
          transform: none !important;
        }

        .landing-card-motion,
        .landing-card-motion:hover {
          transition: none !important;
          transform: none !important;
          box-shadow: none !important;
        }

        .landing-card-motion::after,
        .landing-card-motion:hover::after {
          opacity: 0 !important;
          transform: none !important;
        }

        .landing-ambient-dot,
        .landing-ambient-line,
        .landing-ambient-packet,
        .landing-infra-grid {
          animation: none !important;
          opacity: 0.12 !important;
        }

        .landing-cta-input-shell,
        .landing-cta-input-shell.is-idle,
        .landing-cta-input-shell.is-focused,
        .landing-cta-input-shell.is-filled {
          animation: none !important;
          transition: none !important;
          box-shadow: none !important;
        }

        .landing-cta-input-shell::after {
          animation: none !important;
          opacity: 0 !important;
        }

        .landing-root :where(a[href], button:not(:disabled), [role="button"]) {
          transition: none !important;
        }

        .landing-final-cta-button,
        .landing-final-cta-button:hover {
          animation: none !important;
          transform: none !important;
          box-shadow: none !important;
        }
      }
    `}</style>
  );

  useEffect(() => {
    if (!isLoading) {
      setLoadingStepIndex(0);
      return;
    }

    setLoadingStepIndex(0);
    const interval = window.setInterval(() => {
      setLoadingStepIndex((current) => Math.min(current + 1, LOADING_STEPS.length - 1));
    }, 1400);

    return () => {
      window.clearInterval(interval);
    };
  }, [isLoading]);

  useEffect(() => {
    const trimmed = account.trim();
    if (!trimmed || trimmed.length < 2) {
      setPreview(null);
      setIsPreviewLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsPreviewLoading(true);

    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/onboarding/preview?account=${encodeURIComponent(trimmed)}`,
          {
            headers: buildPostHogHeaders(),
            method: "GET",
            signal: controller.signal,
          },
        );

        const text = await response.text();
        let data: OnboardingPreviewResponse | null = null;

        try {
          data = JSON.parse(text) as OnboardingPreviewResponse;
        } catch {
          data = null;
        }

        if (!response.ok || !data || !data.ok) {
          setPreview(null);
          return;
        }

        setPreview(data.preview);
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }

        capturePostHogException(error, {
          account: trimmed.toLowerCase(),
          source: "landing_preview",
        });
        setPreview(null);
      } finally {
        if (!controller.signal.aborted) {
          setIsPreviewLoading(false);
        }
      }
    }, 850);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [account]);

  useEffect(() => {
    if (landingProIsAnnual && !landingProAnnualEnabled && landingProMonthlyEnabled) {
      setLandingProCadence("monthly");
      return;
    }

    if (!landingProIsAnnual && !landingProMonthlyEnabled && landingProAnnualEnabled) {
      setLandingProCadence("annual");
    }
  }, [landingProAnnualEnabled, landingProIsAnnual, landingProMonthlyEnabled]);

  function scrollToScraper() {
    const scraperSection = document.getElementById("account-scan");
    scraperSection?.scrollIntoView({ behavior: "smooth", block: "center" });

    const accountInput = document.getElementById("account") as HTMLInputElement | null;
    if (accountInput) {
      window.setTimeout(() => {
        accountInput.focus();
      }, 320);
    }
  }

  function resetGuestAnalysisPreview() {
    setGuestAnalysisPreview(null);
    setVoicePreviewFormat("shortform");
    setIsLoading(false);
    setIsLaunchingLoading(false);
    setErrorMessage(null);

    window.setTimeout(() => {
      scrollToScraper();
    }, 120);
  }

  const landingFooterLinks = (
    <nav className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-center gap-x-5 gap-y-3 text-center text-xs text-zinc-500">
      {monetizationEnabled ? (
        <Link href="/pricing" className="px-1.5 py-1 transition hover:text-zinc-200">
          Pricing
        </Link>
      ) : null}
      {monetizationEnabled ? (
        <Link href="/refund-policy" className="px-1.5 py-1 transition hover:text-zinc-200">
          Refund Policy
        </Link>
      ) : null}
      <Link href="/terms" className="px-1.5 py-1 transition hover:text-zinc-200">
        Terms
      </Link>
      <Link href="/privacy" className="px-1.5 py-1 transition hover:text-zinc-200">
        Privacy
      </Link>
    </nav>
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedAccount = normalizedAccount;
    if (!trimmedAccount) {
      setErrorMessage("Enter an X username first.");
      return;
    }

    if (isPreviewLoading) {
      setErrorMessage("Wait for the account preview to finish loading.");
      return;
    }

    if (!hasValidPreview) {
      setErrorMessage("Enter an active X account that resolves in preview first.");
      return;
    }

    if (isLaunchingLoading) {
      return;
    }

    setIsLaunchingLoading(true);
    setErrorMessage(null);
    setGuestAnalysisPreview(null);
    setVoicePreviewFormat("shortform");
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, LANDING_LOADING_TRANSITION_MS);
    });
    setIsLoading(true);
    setIsLaunchingLoading(false);

    if (status === "authenticated") {
      // Authenticated users run the scrape natively and skip login
      try {
        capturePostHogEvent("xpo_onboarding_run_requested", {
          account: trimmedAccount,
          auth_state: "authenticated",
          source: "landing",
        });
        const analysisStartedAt = Date.now();
        const resp = await fetch("/api/onboarding/run", {
          method: "POST",
          headers: buildPostHogHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            account: trimmedAccount,
            goal: "followers",
            timeBudgetMinutes: 30,
            tone: { casing: "lowercase", risk: "safe" }
          }),
        });

        if (!resp.ok) {
          throw new Error("Failed to map account");
        }

        const elapsed = Date.now() - analysisStartedAt;
        if (elapsed < LANDING_MIN_ANALYSIS_LOADING_MS) {
          await new Promise((resolve) => {
            window.setTimeout(resolve, LANDING_MIN_ANALYSIS_LOADING_MS - elapsed);
          });
        }

        // Force a session refresh so the next page load has the new JWT activeXHandle,
        // then hard reload to /chat
        await update();
        window.location.href = "/chat";
      } catch (err) {
        console.error(err);
        capturePostHogException(err, {
          account: trimmedAccount,
          auth_state: "authenticated",
          source: "landing",
        });
        setErrorMessage("Failed to analyze account. Please try again.");
        setIsLoading(false);
        setIsLaunchingLoading(false);
      }
    } else {
      // Anonymous users get a value preview before the auth wall.
      try {
        capturePostHogEvent("xpo_guest_analysis_requested", {
          account: trimmedAccount,
          auth_state: "anonymous",
          source: "landing",
        });
        const analysisStartedAt = Date.now();
        const analysisResponse = await fetch(
          `/api/onboarding/analysis?account=${encodeURIComponent(trimmedAccount)}`,
          {
            headers: buildPostHogHeaders(),
            method: "GET",
          },
        );
        const analysisPayload = (await analysisResponse.json()) as OnboardingAnalysisResponse;

        if (!analysisResponse.ok || !analysisPayload.ok) {
          throw new Error("Preview account unavailable.");
        }

        const elapsed = Date.now() - analysisStartedAt;
        if (elapsed < LANDING_MIN_ANALYSIS_LOADING_MS) {
          await new Promise((resolve) => {
            window.setTimeout(resolve, LANDING_MIN_ANALYSIS_LOADING_MS - elapsed);
          });
        }

        setGuestAnalysisPreview(analysisPayload.analysis);
      } catch (error) {
        console.error(error);
        capturePostHogException(error, {
          account: trimmedAccount,
          auth_state: "anonymous",
          source: "landing",
        });
        setErrorMessage("Failed to analyze account. Please try again.");
      } finally {
        setIsLoading(false);
        setIsLaunchingLoading(false);
      }
    }
  }

  const landingShellOverlay = (
    <>
      <span className="landing-infra-grid" />
      <span className="landing-infra-vignette" />
      <span className="landing-infra-rail" />
      {AMBIENT_DOTS.map((dot, index) => (
        <span
          key={`shell-dot-${index}`}
          className="landing-ambient-dot"
          style={{
            top: dot.top,
            left: dot.left,
            width: dot.size,
            height: dot.size,
            animationDelay: dot.delay,
          }}
        />
      ))}
      {AMBIENT_LINES.map((line, index) => (
        <span
          key={`shell-line-${index}`}
          className="landing-ambient-line"
          style={{
            top: line.top,
            left: line.left,
            width: line.width,
            animationDelay: line.delay,
          }}
        />
      ))}
      {AMBIENT_PACKETS.map((packet, index) => (
        <span
          key={`shell-packet-${index}`}
          className="landing-ambient-packet"
          style={{
            top: packet.top,
            animationDelay: packet.delay,
            animationDuration: packet.duration,
          }}
        />
      ))}
    </>
  );

  if (isLoading) {
    return (
      <XShell footerContent={landingFooterLinks} backgroundOverlay={landingShellOverlay}>
        <section className="mx-auto flex min-h-full w-full max-w-4xl items-center justify-center px-6 py-16 sm:py-24">
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.992 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.62, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full"
          >
            <div className="landing-hero-shell overflow-hidden rounded-[2rem] border border-white/15 bg-[#060606] shadow-[0_24px_80px_rgba(0,0,0,0.5)]">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-zinc-500/70" />
                  <span className="h-3 w-3 rounded-full bg-zinc-500/70" />
                  <span className="h-3 w-3 rounded-full bg-zinc-500/70" />
                </div>
                <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">
                  pipeline.xpo/run
                </p>
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                  Live
                </span>
              </div>

              <motion.div
                initial="hidden"
                animate="visible"
                variants={LANDING_LOADING_STACK_REVEAL}
                className="px-6 pt-4 pb-8 sm:px-10 sm:pt-6 sm:pb-12"
              >
                <div className="mx-auto max-w-2xl text-center">
                  <motion.div variants={LANDING_LOADING_ITEM_REVEAL}>
                  <Image
                    src="/xpo-logo-white.webp"
                    alt="Xpo logo"
                    width={100}
                    height={100}
                    className="mx-auto mb-5 h-[100px] w-[100px] object-contain"
                  />
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                    Signal Pipeline Active
                  </p>
                  </motion.div>

                  <motion.div
                    variants={LANDING_LOADING_ITEM_REVEAL}
                    className="mt-6 flex items-center justify-center gap-4"
                  >
                    <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-visible rounded-full text-sm font-semibold text-white">
                      <motion.span
                        className="pointer-events-none absolute inset-0 rounded-full border border-white/20"
                        animate={{ scale: [1, 1.2], opacity: [0.45, 0] }}
                        transition={{ duration: 1.6, ease: "easeOut", repeat: Infinity }}
                      />
                      <motion.span
                        className="pointer-events-none absolute inset-0 rounded-full border border-white/15"
                        animate={{ scale: [1, 1.28], opacity: [0.35, 0] }}
                        transition={{ duration: 1.8, ease: "easeOut", repeat: Infinity, delay: 0.65 }}
                      />
                      <div className="relative z-10 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-white/20 bg-white/5 shadow-[0_0_32px_rgba(255,255,255,0.12)]">
                        {preview?.avatarUrl ? (
                          <div
                            className="h-full w-full bg-cover bg-center"
                            style={{ backgroundImage: `url(${preview.avatarUrl})` }}
                            role="img"
                            aria-label={`${preview.name} profile photo`}
                          />
                        ) : (
                          preview?.name?.slice(0, 2).toUpperCase() || account.slice(0, 2).toUpperCase()
                        )}
                      </div>
                    </div>
                    <div className="text-left">
                      <h1 className="font-mono text-xl font-semibold tracking-tight text-white sm:text-2xl">
                        {preview?.name || account.trim()}
                      </h1>
                      <p className="text-sm font-medium tracking-[0.12em] text-zinc-400">
                        @{preview?.username || normalizedAccount}
                      </p>
                    </div>
                  </motion.div>

                  <motion.div variants={LANDING_LOADING_ITEM_REVEAL}>
                    <div className="relative mt-7 h-6 overflow-hidden">
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.p
                          key={loadingStepIndex}
                          initial={{ opacity: 0, y: 8, filter: "blur(2px)" }}
                          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                          exit={{ opacity: 0, y: -8, filter: "blur(2px)" }}
                          transition={{ duration: 0.34, ease: "easeOut" }}
                          className="absolute inset-x-0 text-sm font-medium tracking-[0.1em] text-white"
                        >
                          {LOADING_STEPS[loadingStepIndex]}
                        </motion.p>
                      </AnimatePresence>
                    </div>

                    <div className="relative mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                      <motion.div
                        className="h-full rounded-full bg-white"
                        animate={{
                          width: `${((loadingStepIndex + 1) / LOADING_STEPS.length) * 100}%`,
                        }}
                        transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
                      />
                      <motion.span
                        className="pointer-events-none absolute inset-y-0 w-20 bg-gradient-to-r from-transparent via-white/70 to-transparent"
                        animate={{ x: ["-140%", "640%"] }}
                        transition={{ duration: 1.9, ease: "linear", repeat: Infinity }}
                      />
                    </div>

                    <p className="mt-4 text-xs text-zinc-500">
                      Step {loadingStepIndex + 1} of {LOADING_STEPS.length}. Preparing your workspace.
                    </p>
                  </motion.div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </section>
        {autofillStyles}
        {landingMotionStyles}
      </XShell>
    );
  }

  if (guestAnalysisPreview) {
    const signupParams = new URLSearchParams({
      xHandle: guestAnalysisPreview.profile.username,
    });

    return (
      <XShell footerContent={landingFooterLinks} backgroundOverlay={landingShellOverlay}>
        <div className="landing-root relative mx-auto flex min-h-full w-full max-w-6xl flex-col justify-start px-4 pt-2 pb-6 sm:px-6 sm:pt-3 sm:pb-8 lg:h-full lg:min-h-0 lg:overflow-hidden lg:pb-4">
          <GuestAnalysisPreview
            analysis={guestAnalysisPreview}
            signupHref={`/login?${signupParams.toString()}`}
            voicePreviewFormat={voicePreviewFormat}
            onVoicePreviewFormatChange={setVoicePreviewFormat}
            onBack={resetGuestAnalysisPreview}
          />
          {autofillStyles}
          {landingMotionStyles}
        </div>
      </XShell>
    );
  }

  return (
    <XShell footerContent={landingFooterLinks} backgroundOverlay={landingShellOverlay}>
      <div className="landing-root relative mx-auto flex min-h-full w-full max-w-6xl flex-col justify-start px-6 pt-4 pb-16 sm:pt-6 sm:pb-24">
        <motion.section
          initial="hidden"
          animate="visible"
          variants={sectionReveal(0.08)}
          className={`relative mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-start gap-8 pt-2 transition-all duration-700 ease-out sm:pt-4 ${
            isLaunchingLoading
              ? "translate-y-2 scale-[0.99] opacity-0 blur-[2px]"
              : "translate-y-0 scale-100 opacity-100 blur-0"
          }`}
        >
          <AnimatePresence>
            {isLaunchingLoading ? (
              <motion.div
                key="launch-transition-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.52, ease: "easeOut" }}
                className="pointer-events-none absolute inset-0 z-30 overflow-hidden rounded-[2rem]"
              >
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.45, ease: "easeOut" }}
                  className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
                />
                <motion.div
                  initial={{ opacity: 0.2, scale: 0.96 }}
                  animate={{ opacity: 0.6, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.92, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(148,163,184,0.2)_0%,rgba(0,0,0,0.85)_70%)]"
                />
                <motion.span
                  initial={{ x: "-120%", opacity: 0 }}
                  animate={{ x: "120%", opacity: [0, 0.7, 0] }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1.45, ease: "easeInOut" }}
                  className="absolute top-1/2 h-px w-[180%] -translate-y-1/2 bg-gradient-to-r from-transparent via-slate-200/80 to-transparent"
                />
                <motion.div
                  initial={{ y: 6, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -4, opacity: 0 }}
                  transition={{ duration: 0.48, ease: "easeOut" }}
                  className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-400">
                    Initializing profile scan
                  </p>
                </motion.div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <div className="landing-hero-shell overflow-hidden rounded-[2rem] border border-white/12 bg-[#060606] shadow-[0_24px_90px_rgba(0,0,0,0.45)]">
            <div className="relative flex items-center border-b border-white/10 px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-zinc-500/70" />
                <span className="h-3 w-3 rounded-full bg-zinc-500/70" />
                <span className="h-3 w-3 rounded-full bg-zinc-500/70" />
              </div>
              <p className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">
                xpo.lol
              </p>
            </div>

            <div className="px-6 pt-10 pb-10 sm:px-12 sm:pt-14 sm:pb-16">
              <motion.div
                initial="hidden"
                animate="visible"
                variants={LANDING_ONBOARDING_STACK_REVEAL}
                className="mx-auto flex w-full max-w-3xl flex-col items-center gap-10 sm:gap-12"
              >
                <motion.div variants={LANDING_ONBOARDING_ITEM_REVEAL} className="space-y-4 text-center">
                  <Image
                    src="/xpo-logo-white.webp"
                    alt="Xpo logo"
                    width={88}
                    height={88}
                    className="mx-auto h-[88px] w-[88px] object-contain"
                  />
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-zinc-500">
                    X Growth Engine
                  </p>
                  <h1 className="mt-6 font-mono text-4xl font-semibold tracking-tight text-white sm:mt-7 sm:text-5xl">
                    Go From Random Posting To Xponential Growth.
                  </h1>
                  <p className="mx-auto max-w-2xl text-sm leading-7 text-zinc-400 sm:text-base">
                    Drop your handle. Xpo reads your account and gives you the next best move.
                  </p>
                </motion.div>

                <motion.div
                  id="account-scan"
                  variants={LANDING_ONBOARDING_ITEM_REVEAL}
                  className="w-full max-w-2xl"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                    Enter your X Handle
                  </p>

                  <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
                    <div className="flex flex-col gap-4 sm:grid sm:grid-cols-[1fr_auto] sm:items-start">
                      <div className="min-w-0 flex-1">
                        <div
                          className={`landing-cta-input-shell ${
                            isAccountFocused
                              ? "is-focused"
                              : normalizedAccount
                                ? "is-filled"
                                : "is-idle"
                          } rounded-[0.85rem] border border-slate-400/50 bg-slate-950/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),inset_0_-1px_0_rgba(255,255,255,0.03),0_0_0_1px_rgba(255,255,255,0.08)]`}
                        >
                          <div className="flex min-w-0 items-center px-4 py-3">
                            <span className="mr-2 text-lg font-medium text-zinc-500">@</span>
                            <input
                              id="account"
                              value={account}
                              disabled={isLaunchingLoading}
                              onChange={(event) => {
                                setAccount(event.target.value);
                                setErrorMessage(null);
                                setGuestAnalysisPreview(null);
                                setVoicePreviewFormat("shortform");
                              }}
                              onFocus={() => setIsAccountFocused(true)}
                              onBlur={() => setIsAccountFocused(false)}
                              placeholder="username"
                              autoComplete="off"
                              autoCapitalize="none"
                              spellCheck={false}
                              className="landingAccountInput w-full bg-transparent text-base text-white outline-none placeholder:text-zinc-400"
                              aria-label="X username"
                            />
                          </div>
                        </div>

                        <AnimatePresence initial={false}>
                          {isPreviewLoading ? (
                            <motion.div
                              key="preview-loading"
                              initial={{ opacity: 0, y: -8, height: 0 }}
                              animate={{ opacity: 1, y: 0, height: "auto" }}
                              exit={{ opacity: 0, y: -8, height: 0 }}
                              transition={{ duration: 0.22, ease: "easeOut" }}
                              className="mt-2 overflow-hidden"
                            >
                              <div className="rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-left">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                                  Loading Preview
                                </p>
                                <p className="mt-1 text-sm text-zinc-400">Resolving this handle on X...</p>
                              </div>
                            </motion.div>
                          ) : preview ? (
                            <motion.div
                              key="preview-success"
                              initial={{ opacity: 0, y: -8, height: 0 }}
                              animate={{ opacity: 1, y: 0, height: "auto" }}
                              exit={{ opacity: 0, y: -8, height: 0 }}
                              transition={{ duration: 0.22, ease: "easeOut" }}
                              className="mt-2 overflow-hidden"
                            >
                              <div className="rounded-xl border border-white/10 bg-black/45 px-4 py-3 text-left">
                                <div className="flex flex-wrap items-center gap-3">
                                  <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/5 text-xs font-semibold text-white">
                                    {preview.avatarUrl ? (
                                      <div
                                        className="h-full w-full bg-cover bg-center"
                                        style={{ backgroundImage: `url(${preview.avatarUrl})` }}
                                        role="img"
                                        aria-label={`${preview.name} profile photo`}
                                      />
                                    ) : (
                                      preview.name.slice(0, 2).toUpperCase()
                                    )}
                                  </div>

                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      <p className="truncate text-sm font-semibold text-white">{preview.name}</p>
                                      {preview.isVerified ? (
                                        <Image
                                          src="/x-verified.svg"
                                          alt="Verified account"
                                          width={14}
                                          height={14}
                                          className="h-3.5 w-3.5 shrink-0"
                                        />
                                      ) : null}
                                    </div>
                                    <p className="truncate text-xs text-zinc-500">@{preview.username}</p>
                                  </div>

                                  <div className="text-right">
                                    <p className="text-base font-semibold text-white">
                                      {new Intl.NumberFormat("en-US", {
                                        notation: "compact",
                                        maximumFractionDigits: 1,
                                      }).format(preview.followersCount)}
                                    </p>
                                    <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                                      Followers
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          ) : normalizedAccount ? (
                            <motion.div
                              key="preview-empty"
                              initial={{ opacity: 0, y: -8, height: 0 }}
                              animate={{ opacity: 1, y: 0, height: "auto" }}
                              exit={{ opacity: 0, y: -8, height: 0 }}
                              transition={{ duration: 0.22, ease: "easeOut" }}
                              className="mt-2 overflow-hidden"
                            >
                              <div className="rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-left">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                                  No Account Found
                                </p>
                                <p className="mt-1 text-sm text-zinc-400">
                                  Only active X accounts that resolve in preview can be analyzed.
                                </p>
                              </div>
                            </motion.div>
                          ) : null}
                        </AnimatePresence>
                      </div>

                      <div className="flex flex-col gap-2 sm:min-w-[210px]">
                        <button
                          type="submit"
                          disabled={
                            !hasValidPreview ||
                            isPreviewLoading ||
                            !normalizedAccount ||
                            isLaunchingLoading
                          }
                          className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white px-6 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
                        >
                          {isLaunchingLoading ? "Preparing Scan..." : "Analyze My X"}
                        </button>
                        <p className="text-center text-sm text-zinc-500">
                          have an account?{" "}
                          <Link
                            href="/login"
                            className="font-medium text-zinc-400 underline-offset-4 transition-colors hover:text-white hover:underline"
                          >
                            sign in
                          </Link>
                        </p>
                      </div>
                    </div>

                    {errorMessage ? (
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-rose-400">
                        {errorMessage}
                      </p>
                    ) : null}
                  </form>
                </motion.div>
                <motion.div
                  variants={LANDING_ONBOARDING_ITEM_REVEAL}
                  className="mx-auto mt-4 w-full max-w-4xl px-2"
                >
                  <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 px-3 py-2 sm:gap-x-14">
                    {HERO_SIGNAL_STRIP.map((item) => (
                      <div key={item.title} className="inline-flex items-center gap-2">
                        <item.Icon className="h-3.5 w-3.5 text-zinc-400" />
                        <span className="text-[11px] font-medium tracking-[0.04em] text-zinc-300">
                          {item.title}
                        </span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              </motion.div>
            </div>
          </div>
        </motion.section>

        <motion.section
          initial="hidden"
          whileInView="visible"
          viewport={LANDING_SECTION_VIEWPORT}
          variants={sectionReveal(0.1)}
          className="mx-auto mt-12 w-full max-w-5xl sm:mt-14"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            How It Works
          </p>
          <h2 className="mt-3 font-mono text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            A clean 3-step system.
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {HOW_IT_WORKS_STEPS.map((item) => (
              <motion.article
                key={item.step}
                whileHover={LANDING_CARD_HOVER}
                className="landing-card-motion rounded-2xl border border-white/10 bg-black/20 px-5 py-5"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Step {item.step}
                </p>
                <p className="mt-2 text-base font-semibold text-white">{item.title}</p>
                <p className="mt-2 text-sm leading-6 text-zinc-300">{item.body}</p>
              </motion.article>
            ))}
          </div>
        </motion.section>

        <motion.section
          initial="hidden"
          whileInView="visible"
          viewport={LANDING_SECTION_VIEWPORT}
          variants={sectionReveal(0.12)}
          className="mx-auto mt-12 w-full max-w-5xl sm:mt-14"
        >
          <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Why Xpo
              </p>
              <h2 className="mt-3 font-mono text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                A simpler system for consistent growth.
              </h2>
              <p className="mt-3 text-sm leading-7 text-zinc-400 sm:text-base">
                Less guessing, better reps, clearer next actions.
              </p>
            </div>
            <div className="space-y-3">
              {CORE_FEATURES.map((feature) => (
                <article
                  key={feature.title}
                  className="landing-card-motion rounded-2xl border border-white/10 bg-black/20 px-5 py-4"
                >
                  <p className="text-sm font-semibold text-white">{feature.title}</p>
                  <p className="mt-1 text-sm text-zinc-300">{feature.body}</p>
                </article>
              ))}
            </div>
          </div>
        </motion.section>

        <motion.section
          initial="hidden"
          whileInView="visible"
          viewport={LANDING_SECTION_VIEWPORT}
          variants={sectionReveal(0.14)}
          className="mx-auto mt-12 w-full max-w-5xl sm:mt-14"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Growth Playbooks
          </p>
          <h2 className="mt-3 font-mono text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Right move for your stage.
          </h2>
          <p className="mt-3 max-w-2xl text-sm text-zinc-400 sm:text-base">
            Each stage has a different growth lever. Xpo changes your playbook and outputs to match.
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {STAGE_PLAYBOOKS.map((playbook) => (
              <article
                key={playbook.stage}
                className="landing-card-motion rounded-2xl border border-white/10 bg-black/20 px-5 py-4"
              >
                <p className="text-sm font-semibold text-white">{playbook.stage}</p>
                <p className="mt-2 text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">
                  {playbook.focus}
                </p>
                <p className="mt-2 text-sm leading-6 text-zinc-300">{playbook.xpoHelp}</p>
              </article>
            ))}
          </div>
        </motion.section>

        {monetizationEnabled ? (
          <motion.section
            initial="hidden"
            whileInView="visible"
            viewport={LANDING_SECTION_VIEWPORT}
            variants={sectionReveal(0.18)}
            className="mx-auto mt-12 w-full max-w-5xl sm:mt-14"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Pricing
            </p>
            <h2 className="mt-3 font-mono text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Simple pricing. Predictable usage.
            </h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <motion.article whileHover={LANDING_CARD_HOVER} className="landing-card-motion h-full rounded-2xl border border-white/10 bg-white/[0.02] p-5 pb-7 flex flex-col">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">Free</p>
                <p className="mt-2 text-3xl font-semibold">$0</p>
                <p className="mt-2 text-sm text-zinc-400">Try it in minutes. No card required.</p>
                <p className="mt-4 text-xs text-zinc-500">{LANDING_FREE_CREDITS_PER_MONTH} credits/month</p>
                <div className="mt-4 space-y-2 text-sm text-zinc-300">
                  <p>• Core chat + onboarding included</p>
                  <p>• Draft analysis: Analyze</p>
                  <p>• Multiple X accounts on one shared credit pool</p>
                  <p>
                    • ≈ {landingFreeApproxChatTurns} chat turns or ≈ {landingFreeApproxDraftTurns} draft/review turns
                  </p>
                </div>
                <button
                  type="button"
                  onClick={scrollToScraper}
                  className="mt-auto inline-flex w-full items-center justify-center rounded-full border border-white/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-200 transition hover:bg-white/[0.05]"
                >
                  Start for Free
                </button>
              </motion.article>

              <motion.article whileHover={LANDING_CARD_HOVER} className="landing-card-motion group relative h-full overflow-hidden rounded-2xl border border-white/20 bg-white/[0.05] p-5 pb-7 flex flex-col">
                <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/10 blur-2xl transition-opacity duration-300 group-hover:opacity-90" />
                <div className="flex items-start justify-between gap-3">
                  <p className="inline-flex whitespace-nowrap rounded-full border border-white/25 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-200">
                    Most popular
                  </p>
                  <div className="flex flex-col items-end gap-1">
                    <div className="relative inline-flex w-full max-w-[172px] rounded-full border border-white/20 bg-black/35 p-0.5">
                      <span
                        className={`pointer-events-none absolute inset-y-0.5 left-0.5 w-[calc(50%-0.125rem)] rounded-full bg-white transition-transform duration-200 ${
                          landingProIsAnnual ? "translate-x-full" : "translate-x-0"
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setLandingProCadence("monthly")}
                        disabled={!landingProMonthlyEnabled}
                        className={`relative z-10 flex-1 rounded-full px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] transition ${
                          !landingProMonthlyEnabled
                            ? "cursor-not-allowed text-zinc-600"
                            : landingProIsAnnual
                              ? "text-zinc-300 hover:text-white"
                              : "text-black"
                        }`}
                      >
                        Monthly
                      </button>
                      <div className="relative z-10 flex-1">
                        <button
                          type="button"
                          onClick={() => setLandingProCadence("annual")}
                          disabled={!landingProAnnualEnabled}
                          className={`w-full rounded-full px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] transition ${
                            !landingProAnnualEnabled
                              ? "cursor-not-allowed text-zinc-600"
                              : landingProIsAnnual
                                ? "text-black"
                                : "text-zinc-300 hover:text-white"
                          }`}
                        >
                          Annual
                        </button>
                      </div>
                      {landingProMonthlyEnabled && landingProAnnualEnabled ? (
                        <span className="pointer-events-none absolute left-3/4 top-full z-20 mt-1 w-max -translate-x-1/2 whitespace-nowrap rounded-full border border-emerald-300/35 bg-emerald-400/10 px-1.5 py-[3px] text-[7px] font-semibold uppercase leading-none tracking-[0.1em] text-emerald-200 shadow-[0_0_14px_rgba(52,211,153,0.25)]">
                          2 months free
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-300">Pro</p>
                <p className="mt-2 text-3xl font-semibold">
                  {formatUsdPrice(landingSelectedProCents)}
                  <span className="text-sm font-medium text-zinc-400">{landingSelectedProPriceSuffix}</span>
                </p>
                <div className="mt-4 space-y-2 text-sm text-zinc-200">
                  <p>• {LANDING_PRO_CREDITS_PER_MONTH} credits/month</p>
                  <p>• Draft analysis: Analyze + Compare</p>
                  <p>• Multiple X accounts on one shared credit pool</p>
                  <p>• Higher throughput + priority processing</p>
                  <p>
                    • ≈ {landingProApproxChatTurns} chat turns or ≈ {landingProApproxDraftTurns} draft/review turns
                  </p>
                </div>
                <div className="mt-auto pt-8">
                  <button
                    type="button"
                    onClick={scrollToScraper}
                    className="inline-flex w-full cursor-pointer items-center justify-center rounded-full bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-black transition hover:bg-zinc-200"
                  >
                    Get Started
                  </button>
                </div>
              </motion.article>

              <motion.article whileHover={LANDING_CARD_HOVER} className="landing-card-motion group relative h-full overflow-hidden rounded-2xl border border-amber-200/35 bg-amber-200/[0.08] p-5 pb-7 flex flex-col">
                <div className="pointer-events-none absolute -left-14 top-6 h-32 w-32 rounded-full bg-amber-300/25 blur-2xl transition-opacity duration-300 group-hover:opacity-95" />
                <div className="pointer-events-none absolute -right-16 -top-14 h-36 w-36 rounded-full bg-amber-200/20 blur-3xl animate-pulse" />
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_24%,rgba(251,191,36,0.2)_50%,transparent_76%)] opacity-40 transition-opacity duration-500 group-hover:opacity-70" />
                <Sparkles className="pointer-events-none absolute right-6 top-6 h-4 w-4 text-amber-100/90 drop-shadow-[0_0_10px_rgba(251,191,36,0.65)]" />
                <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-amber-100">
                  <Sparkles className="h-3.5 w-3.5 text-amber-100" />
                  Founder Pass
                </p>
                <p className="mt-2 text-3xl font-semibold">{formatUsdPrice(landingLifetimeCents)}</p>
                <p className="mt-2 text-sm text-zinc-200">One-time payment. No recurring billing.</p>
                <div className="mt-4 space-y-2 text-sm text-zinc-200">
                  <p>• Includes Pro features</p>
                  <p>• Draft analysis: Analyze + Compare</p>
                  <p>• Multiple X accounts on one shared credit pool</p>
                  <p>• {LANDING_PRO_CREDITS_PER_MONTH} credits/month included</p>
                  <p>• Priority founder lane</p>
                </div>
                <div className="mt-auto pt-8">
                  <button
                    type="button"
                    onClick={scrollToScraper}
                    className="inline-flex w-full cursor-pointer items-center justify-center rounded-full border border-amber-200/50 bg-amber-100/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-amber-100 transition hover:bg-amber-100/18"
                  >
                    Get Started
                  </button>
                </div>
              </motion.article>
            </div>
          </motion.section>
        ) : null}

        <motion.section
          initial="hidden"
          whileInView="visible"
          viewport={LANDING_SECTION_VIEWPORT}
          variants={sectionReveal(0.2)}
          className="mx-auto mt-12 w-full max-w-5xl sm:mt-14"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">FAQ</p>
          <h2 className="mt-3 font-mono text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Common questions
          </h2>
          <div className="mt-6 space-y-3">
            {visibleFaqItems.map((item, index) => {
              const isOpen = openFaqIndexes.includes(index);
              return (
                <motion.article
                  key={item.question}
                  whileHover={LANDING_CARD_HOVER}
                  className="landing-card-motion rounded-2xl border border-white/10 bg-black/20 px-5 py-4"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setOpenFaqIndexes((current) =>
                        current.includes(index)
                          ? current.filter((item) => item !== index)
                          : [...current, index],
                      );
                    }}
                    className="flex w-full items-center justify-between gap-4 text-left"
                  >
                    <span className="text-sm font-semibold text-white">{item.question}</span>
                    <motion.span
                      animate={{ rotate: isOpen ? 45 : 0 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      className="text-lg leading-none text-zinc-400"
                    >
                      +
                    </motion.span>
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen ? (
                      <motion.div
                        key="faq-answer"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.24, ease: "easeOut" }}
                        className="overflow-hidden"
                      >
                        <p className="mt-3 text-sm leading-6 text-zinc-300">{item.answer}</p>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </motion.article>
              );
            })}
          </div>
        </motion.section>

        <motion.section
          initial="hidden"
          whileInView="visible"
          viewport={LANDING_SECTION_VIEWPORT}
          variants={sectionReveal(0.22)}
          className="mx-auto mt-12 w-full max-w-5xl sm:mt-14"
        >
          <motion.article whileHover={LANDING_CARD_HOVER} className="landing-card-motion rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-8 text-center">
            <h3 className="font-mono text-2xl font-semibold tracking-tight text-white">
              Ready to grow Xponentially on X?
            </h3>
            <p className="mt-3 text-sm text-zinc-400">
              Start with your handle, get your stage mapped, and move straight into actionable drafts that fit your voice.
            </p>
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={scrollToScraper}
                className="landing-final-cta-button inline-flex cursor-pointer items-center justify-center rounded-xl border border-white/80 bg-white px-6 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-black shadow-[0_0_28px_rgba(255,255,255,0.4),0_14px_36px_rgba(255,255,255,0.18)] transition hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
              >
                Try for Free
              </button>
            </div>
          </motion.article>
        </motion.section>
        {autofillStyles}
        {landingMotionStyles}
      </div>
    </XShell>
  );
}
