import type {
  OnboardingInput,
  ToneCasing,
  ToneRisk,
  UserGoal,
} from "./types";

type OnboardingField =
  | "account"
  | "goal"
  | "timeBudgetMinutes"
  | "tone.casing"
  | "tone.risk"
  | "forceMock";

export interface OnboardingValidationError {
  field: OnboardingField;
  message: string;
}

export type OnboardingValidationResult =
  | { ok: true; data: OnboardingInput }
  | { ok: false; errors: OnboardingValidationError[] };

const GOALS: ReadonlySet<UserGoal> = new Set(["followers", "leads", "authority"]);
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

  if (errors.length > 0 || !account || !goal || !casing || !risk) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      account,
      goal,
      timeBudgetMinutes,
      tone: {
        casing,
        risk,
      },
      forceMock,
    },
  };
}
