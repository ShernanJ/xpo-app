import type {
  OnboardingInput,
  ToneCasing,
  ToneRisk,
  TransformationMode,
  TransformationModeSource,
  UserGoal,
} from "./types";

type OnboardingField =
  | "account"
  | "goal"
  | "timeBudgetMinutes"
  | "transformationMode"
  | "transformationModeSource"
  | "tone.casing"
  | "tone.risk"
  | "forceMock"
  | "forceFreshScrape";

export interface OnboardingValidationError {
  field: OnboardingField;
  message: string;
}

export type OnboardingValidationResult =
  | { ok: true; data: OnboardingInput }
  | { ok: false; errors: OnboardingValidationError[] };

const GOALS: ReadonlySet<UserGoal> = new Set(["followers", "leads", "authority"]);
const TRANSFORMATION_MODES: ReadonlySet<TransformationMode> = new Set([
  "preserve",
  "optimize",
  "pivot_soft",
  "pivot_hard",
]);
const TRANSFORMATION_MODE_SOURCES: ReadonlySet<TransformationModeSource> = new Set([
  "default",
  "user_selected",
]);
const TONE_CASINGS: ReadonlySet<ToneCasing> = new Set(["lowercase", "normal"]);
const TONE_RISKS: ReadonlySet<ToneRisk> = new Set(["safe", "bold"]);
const HANDLE_PATTERN = /^[A-Za-z0-9_]{1,15}$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export function normalizeAccountInput(input: string): string | null {
  const raw = input.trim();
  if (!raw) {
    return null;
  }

  if (raw.startsWith("@")) {
    const handle = raw.slice(1).trim();
    return HANDLE_PATTERN.test(handle) ? handle : null;
  }

  if (HANDLE_PATTERN.test(raw)) {
    return raw;
  }

  const urlCandidate = raw.startsWith("http://") || raw.startsWith("https://")
    ? raw
    : `https://${raw}`;

  try {
    const parsed = new URL(urlCandidate);
    const host = parsed.hostname.toLowerCase();
    if (!["x.com", "www.x.com", "mobile.x.com"].includes(host)) {
      return null;
    }

    const [username = ""] = parsed.pathname.split("/").filter(Boolean);
    return HANDLE_PATTERN.test(username) ? username : null;
  } catch {
    return null;
  }
}

export function parseOnboardingInput(raw: unknown): OnboardingValidationResult {
  const body = asRecord(raw);
  if (!body) {
    return {
      ok: false,
      errors: [{ field: "account", message: "Request body must be a JSON object." }],
    };
  }

  const errors: OnboardingValidationError[] = [];

  const accountRaw = typeof body.account === "string" ? body.account : "";
  const account = normalizeAccountInput(accountRaw);
  if (!account) {
    errors.push({
      field: "account",
      message: "Provide @username, username, or x.com/username.",
    });
  }

  const goalRaw = body.goal;
  const goal = typeof goalRaw === "string" ? (goalRaw as UserGoal) : null;
  if (!goal || !GOALS.has(goal)) {
    errors.push({
      field: "goal",
      message: "Goal must be one of: followers, leads, authority.",
    });
  }

  const timeBudgetRaw = body.timeBudgetMinutes;
  const timeBudgetMinutes =
    typeof timeBudgetRaw === "number" ? Math.floor(timeBudgetRaw) : NaN;
  if (!Number.isFinite(timeBudgetMinutes) || timeBudgetMinutes < 5 || timeBudgetMinutes > 360) {
    errors.push({
      field: "timeBudgetMinutes",
      message: "timeBudgetMinutes must be an integer between 5 and 360.",
    });
  }

  let transformationMode: TransformationMode | undefined;
  if (body.transformationMode !== undefined) {
    if (
      typeof body.transformationMode !== "string" ||
      !TRANSFORMATION_MODES.has(body.transformationMode as TransformationMode)
    ) {
      errors.push({
        field: "transformationMode",
        message:
          "transformationMode must be one of: preserve, optimize, pivot_soft, pivot_hard.",
      });
    } else {
      transformationMode = body.transformationMode as TransformationMode;
    }
  }

  let transformationModeSource: TransformationModeSource | undefined;
  if (body.transformationModeSource !== undefined) {
    if (
      typeof body.transformationModeSource !== "string" ||
      !TRANSFORMATION_MODE_SOURCES.has(
        body.transformationModeSource as TransformationModeSource,
      )
    ) {
      errors.push({
        field: "transformationModeSource",
        message: "transformationModeSource must be default or user_selected.",
      });
    } else {
      transformationModeSource =
        body.transformationModeSource as TransformationModeSource;
    }
  }

  if (transformationMode && !transformationModeSource) {
    errors.push({
      field: "transformationModeSource",
      message:
        "transformationModeSource is required when transformationMode is provided.",
    });
  }

  if (!transformationMode && transformationModeSource) {
    errors.push({
      field: "transformationMode",
      message:
        "transformationMode is required when transformationModeSource is provided.",
    });
  }

  const toneRecord = asRecord(body.tone);
  const toneCasingRaw = toneRecord?.casing;
  const toneRiskRaw = toneRecord?.risk;
  const casing =
    typeof toneCasingRaw === "string" ? (toneCasingRaw as ToneCasing) : null;
  const risk = typeof toneRiskRaw === "string" ? (toneRiskRaw as ToneRisk) : null;

  if (!casing || !TONE_CASINGS.has(casing)) {
    errors.push({
      field: "tone.casing",
      message: "tone.casing must be lowercase or normal.",
    });
  }

  if (!risk || !TONE_RISKS.has(risk)) {
    errors.push({
      field: "tone.risk",
      message: "tone.risk must be safe or bold.",
    });
  }

  let forceMock: boolean | undefined;
  if (body.forceMock !== undefined) {
    if (typeof body.forceMock !== "boolean") {
      errors.push({
        field: "forceMock",
        message: "forceMock must be a boolean when provided.",
      });
    } else {
      forceMock = body.forceMock;
    }
  }

  let forceFreshScrape: boolean | undefined;
  if (body.forceFreshScrape !== undefined) {
    if (typeof body.forceFreshScrape !== "boolean") {
      errors.push({
        field: "forceFreshScrape",
        message: "forceFreshScrape must be a boolean when provided.",
      });
    } else {
      forceFreshScrape = body.forceFreshScrape;
    }
  }

  if (errors.length > 0 || !account || !goal || !casing || !risk) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      account,
      goal,
      timeBudgetMinutes,
      transformationMode,
      transformationModeSource,
      tone: {
        casing,
        risk,
      },
      forceMock,
      forceFreshScrape,
    },
  };
}
