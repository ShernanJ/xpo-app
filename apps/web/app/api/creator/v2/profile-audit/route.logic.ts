import {
  createEmptyStyleCard,
  ProfileAuditHeaderClaritySchema,
  ProfileAuditStateSchema,
  type ProfileAuditHeaderClarity,
  type VoiceStyleCard,
} from "../../../../../lib/agent-v2/core/styleProfile.ts";

export interface ProfileAuditRequestBody {
  lastDismissedFingerprint?: unknown;
  headerClarity?: unknown;
  headerClarityBannerUrl?: unknown;
}

export interface ProfileAuditPatchInput {
  lastDismissedFingerprint?: string | null;
  headerClarity?: ProfileAuditHeaderClarity | null;
  headerClarityBannerUrl?: string | null;
}

export interface ProfileAnalysisConversationPatchInput {
  analysisGoal?: string | null;
  analysisCorrectionDetail?: string | null;
}

interface ValidationError {
  field: string;
  message: string;
}

interface ParseProfileAuditPatchSuccess {
  ok: true;
  data: ProfileAuditPatchInput;
}

interface ParseProfileAuditPatchFailure {
  ok: false;
  errors: ValidationError[];
}

export function parseProfileAuditPatchRequest(
  body: ProfileAuditRequestBody,
): ParseProfileAuditPatchSuccess | ParseProfileAuditPatchFailure {
  const lastDismissedFingerprint =
    body.lastDismissedFingerprint === undefined
      ? undefined
      : body.lastDismissedFingerprint === null
        ? null
        : typeof body.lastDismissedFingerprint === "string"
          ? body.lastDismissedFingerprint.trim()
          : false;
  if (lastDismissedFingerprint === false) {
    return {
      ok: false,
      errors: [
        {
          field: "lastDismissedFingerprint",
          message: "Fingerprint must be a string or null.",
        },
      ],
    };
  }

  const headerClarity =
    body.headerClarity === undefined
      ? undefined
      : body.headerClarity === null
        ? null
        : ProfileAuditHeaderClaritySchema.safeParse(body.headerClarity).success
          ? (body.headerClarity as ProfileAuditHeaderClarity)
          : false;
  if (headerClarity === false) {
    return {
      ok: false,
      errors: [
        {
          field: "headerClarity",
          message: "headerClarity must be clear, unclear, unsure, or null.",
        },
      ],
    };
  }

  const headerClarityBannerUrl =
    body.headerClarityBannerUrl === undefined
      ? undefined
      : body.headerClarityBannerUrl === null
        ? null
        : typeof body.headerClarityBannerUrl === "string"
          ? body.headerClarityBannerUrl.trim() || null
          : false;
  if (headerClarityBannerUrl === false) {
    return {
      ok: false,
      errors: [
        {
          field: "headerClarityBannerUrl",
          message: "Banner URL must be a string or null.",
        },
      ],
    };
  }

  return {
    ok: true,
    data: {
      ...(lastDismissedFingerprint !== undefined ? { lastDismissedFingerprint } : {}),
      ...(headerClarity !== undefined ? { headerClarity } : {}),
      ...(headerClarityBannerUrl !== undefined ? { headerClarityBannerUrl } : {}),
    },
  };
}

export function applyProfileAuditPatchToStyleCard(args: {
  styleCard: VoiceStyleCard;
  patch: ProfileAuditPatchInput;
  nowIso?: string;
}): VoiceStyleCard {
  const previousState = ProfileAuditStateSchema.parse(args.styleCard.profileAuditState ?? {});
  const nowIso = args.nowIso ?? new Date().toISOString();

  const nextState = ProfileAuditStateSchema.parse({
    ...previousState,
    ...(args.patch.lastDismissedFingerprint !== undefined
      ? { lastDismissedFingerprint: args.patch.lastDismissedFingerprint }
      : {}),
    ...(args.patch.headerClarity !== undefined
      ? {
          headerClarity: args.patch.headerClarity,
          headerClarityAnsweredAt: args.patch.headerClarity ? nowIso : null,
          headerClarityBannerUrl: args.patch.headerClarity
            ? (args.patch.headerClarityBannerUrl ?? previousState.headerClarityBannerUrl ?? null)
            : null,
        }
      : {}),
  });

  return {
    ...args.styleCard,
    profileAuditState: nextState,
  };
}

function normalizeAnalysisGoal(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return value === null ? null : null;
  }

  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : null;
}

function normalizeCorrectionDetail(value: string): string {
  return value.trim().replace(/\s+/g, " ").replace(/[.?!]+$/g, "");
}

export function applyProfileAnalysisConversationPatchToStyleCard(args: {
  styleCard?: VoiceStyleCard | null;
  patch: ProfileAnalysisConversationPatchInput;
  nowIso?: string;
}): VoiceStyleCard {
  const baseStyleCard = args.styleCard ?? createEmptyStyleCard();
  const previousState = ProfileAuditStateSchema.parse(baseStyleCard.profileAuditState ?? {});
  const nowIso = args.nowIso ?? new Date().toISOString();
  const normalizedGoal = normalizeAnalysisGoal(args.patch.analysisGoal);
  const normalizedCorrection =
    typeof args.patch.analysisCorrectionDetail === "string"
      ? normalizeCorrectionDetail(args.patch.analysisCorrectionDetail)
      : null;

  const nextCorrections = normalizedCorrection
    ? [
        {
          id: `analysis_correction_${nowIso}`,
          detail: normalizedCorrection,
          createdAt: nowIso,
        },
        ...previousState.analysisCorrections.filter(
          (entry) => entry.detail.trim().toLowerCase() !== normalizedCorrection.toLowerCase(),
        ),
      ].slice(0, 8)
    : previousState.analysisCorrections;

  const nextState = ProfileAuditStateSchema.parse({
    ...previousState,
    ...(args.patch.analysisGoal !== undefined ? { analysisGoal: normalizedGoal } : {}),
    ...(normalizedCorrection ? { analysisCorrections: nextCorrections } : {}),
  });

  return {
    ...baseStyleCard,
    profileAuditState: nextState,
  };
}
