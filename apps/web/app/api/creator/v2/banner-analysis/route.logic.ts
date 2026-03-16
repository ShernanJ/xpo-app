export const BANNER_ANALYSIS_MAX_FILE_BYTES = 10 * 1024 * 1024;

export const BANNER_ANALYSIS_ACCEPTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type BannerAnalysisAcceptedMimeType =
  (typeof BANNER_ANALYSIS_ACCEPTED_MIME_TYPES)[number];

interface BannerUploadValidationSuccess {
  ok: true;
  mimeType: BannerAnalysisAcceptedMimeType;
}

interface BannerUploadValidationFailure {
  ok: false;
  field: string;
  message: string;
  status: number;
}

export type BannerUploadValidationResult =
  | BannerUploadValidationSuccess
  | BannerUploadValidationFailure;

function mimeTypeFromFilename(
  fileName: string,
): BannerAnalysisAcceptedMimeType | null {
  const lower = fileName.trim().toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lower.endsWith(".png")) {
    return "image/png";
  }
  if (lower.endsWith(".webp")) {
    return "image/webp";
  }
  return null;
}

export function validateBannerUpload(input: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): BannerUploadValidationResult {
  if (!input.fileName.trim()) {
    return {
      ok: false,
      field: "banner",
      message: "Banner image must include a file name.",
      status: 400,
    };
  }

  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return {
      ok: false,
      field: "banner",
      message: "Banner image is empty.",
      status: 400,
    };
  }

  if (input.sizeBytes > BANNER_ANALYSIS_MAX_FILE_BYTES) {
    return {
      ok: false,
      field: "banner",
      message: "Banner image is too large. Maximum size is 10MB.",
      status: 413,
    };
  }

  const normalizedMimeType = input.mimeType.trim().toLowerCase();
  const inferredMimeType =
    (BANNER_ANALYSIS_ACCEPTED_MIME_TYPES.find(
      (value) => value === normalizedMimeType,
    ) ??
      mimeTypeFromFilename(input.fileName)) ||
    null;

  if (!inferredMimeType) {
    return {
      ok: false,
      field: "banner",
      message: "Banner image must be a PNG, JPG, or WEBP file.",
      status: 415,
    };
  }

  return {
    ok: true,
    mimeType: inferredMimeType,
  };
}
