export interface FeedbackAttachmentGuardInput {
  name: string;
  mimeType: string;
  sizeBytes: number;
  signatureHex?: string | null;
}

export interface FeedbackSubmissionGuardInput {
  createdAt: string;
  message: string;
  attachments: FeedbackAttachmentGuardInput[];
}

export const FEEDBACK_MAX_ATTACHMENTS = 6;
export const FEEDBACK_MAX_ATTACHMENT_TOTAL_BYTES = 75 * 1024 * 1024;
export const FEEDBACK_RATE_LIMIT_MAX_PER_10_MINUTES = 3;
export const FEEDBACK_RATE_LIMIT_MAX_PER_DAY = 20;
export const FEEDBACK_RATE_LIMIT_MEDIA_MAX_PER_DAY = 5;
export const FEEDBACK_COOLDOWN_MS = 45_000;
export const FEEDBACK_DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

interface FeedbackGuardSuccess {
  ok: true;
}

interface FeedbackGuardFailure {
  ok: false;
  status: 409 | 429;
  message: string;
}

export type FeedbackGuardResult = FeedbackGuardSuccess | FeedbackGuardFailure;

function getTimestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeFeedbackText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function getLatestSubmissionTimestamp(submissions: FeedbackSubmissionGuardInput[]): number | null {
  let latest: number | null = null;
  for (const submission of submissions) {
    const createdAt = getTimestamp(submission.createdAt);
    if (createdAt === null) {
      continue;
    }
    latest = latest === null ? createdAt : Math.max(latest, createdAt);
  }
  return latest;
}

function getAttachmentExtension(name: string): "png" | "jpg" | "jpeg" | "mp4" | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) {
    return "png";
  }
  if (lower.endsWith(".jpg")) {
    return "jpg";
  }
  if (lower.endsWith(".jpeg")) {
    return "jpeg";
  }
  if (lower.endsWith(".mp4")) {
    return "mp4";
  }
  return null;
}

function inferSignatureType(signatureHex?: string | null): "png" | "jpeg" | "mp4" | null {
  if (!signatureHex) {
    return null;
  }

  const normalized = signatureHex.toLowerCase();
  if (normalized.startsWith("89504e470d0a1a0a".toLowerCase())) {
    return "png";
  }

  if (normalized.startsWith("ffd8ff")) {
    return "jpeg";
  }

  if (normalized.length >= 16 && normalized.slice(8, 16) === "66747970") {
    return "mp4";
  }

  return null;
}

function isAttachmentSignatureValid(attachment: FeedbackAttachmentGuardInput): boolean {
  const signatureType = inferSignatureType(attachment.signatureHex);
  if (!signatureType) {
    return false;
  }

  const mimeType = attachment.mimeType.toLowerCase();
  const extension = getAttachmentExtension(attachment.name);

  if (mimeType === "image/png") {
    return signatureType === "png" && extension === "png";
  }

  if (mimeType === "image/jpeg") {
    return signatureType === "jpeg" && (extension === "jpg" || extension === "jpeg");
  }

  if (mimeType === "video/mp4") {
    return signatureType === "mp4" && extension === "mp4";
  }

  return false;
}

export function evaluateFeedbackSubmissionGuards(args: {
  existingSubmissions: FeedbackSubmissionGuardInput[];
  incomingMessage: string;
  incomingAttachments: FeedbackAttachmentGuardInput[];
  nowMs?: number;
}): FeedbackGuardResult {
  const { existingSubmissions, incomingMessage, incomingAttachments } = args;
  const nowMs = args.nowMs ?? Date.now();

  if (incomingAttachments.length > FEEDBACK_MAX_ATTACHMENTS) {
    return {
      ok: false,
      status: 429,
      message: `You can upload up to ${FEEDBACK_MAX_ATTACHMENTS} attachments per report.`,
    };
  }

  const submissionsInLast10Minutes = existingSubmissions.filter((submission) => {
    const createdAt = getTimestamp(submission.createdAt);
    return createdAt !== null && nowMs - createdAt < 10 * 60 * 1000;
  });
  if (submissionsInLast10Minutes.length >= FEEDBACK_RATE_LIMIT_MAX_PER_10_MINUTES) {
    return {
      ok: false,
      status: 429,
      message: "Too many submissions in a short window. Please wait a few minutes and try again.",
    };
  }

  const submissionsInLastDay = existingSubmissions.filter((submission) => {
    const createdAt = getTimestamp(submission.createdAt);
    return createdAt !== null && nowMs - createdAt < 24 * 60 * 60 * 1000;
  });
  if (submissionsInLastDay.length >= FEEDBACK_RATE_LIMIT_MAX_PER_DAY) {
    return {
      ok: false,
      status: 429,
      message: "Daily feedback limit reached for this profile. Please try again tomorrow.",
    };
  }

  const latestSubmissionTimestamp = getLatestSubmissionTimestamp(existingSubmissions);
  if (latestSubmissionTimestamp !== null) {
    const elapsedMs = nowMs - latestSubmissionTimestamp;
    if (elapsedMs < FEEDBACK_COOLDOWN_MS) {
      const waitSeconds = Math.ceil((FEEDBACK_COOLDOWN_MS - elapsedMs) / 1000);
      return {
        ok: false,
        status: 429,
        message: `Please wait ${waitSeconds}s before submitting another report.`,
      };
    }
  }

  const incomingAttachmentBytes = incomingAttachments.reduce(
    (total, attachment) => total + attachment.sizeBytes,
    0,
  );
  if (incomingAttachmentBytes > FEEDBACK_MAX_ATTACHMENT_TOTAL_BYTES) {
    return {
      ok: false,
      status: 429,
      message: "Total attachment size is too large for one report.",
    };
  }

  if (incomingAttachments.length > 0) {
    const mediaSubmissionsInLastDay = submissionsInLastDay.filter(
      (submission) => submission.attachments.length > 0,
    );
    if (mediaSubmissionsInLastDay.length >= FEEDBACK_RATE_LIMIT_MEDIA_MAX_PER_DAY) {
      return {
        ok: false,
        status: 429,
        message: "Daily media feedback limit reached for this profile. Please try again tomorrow.",
      };
    }
  }

  const invalidAttachment = incomingAttachments.find(
    (attachment) => !isAttachmentSignatureValid(attachment),
  );
  if (invalidAttachment) {
    return {
      ok: false,
      status: 429,
      message:
        "One or more attachments failed media validation. Re-attach the original PNG/JPG/MP4 file and try again.",
    };
  }

  const normalizedIncomingMessage = normalizeFeedbackText(incomingMessage);
  const duplicateExists = submissionsInLastDay.some((submission) => {
    const createdAt = getTimestamp(submission.createdAt);
    if (createdAt === null || nowMs - createdAt > FEEDBACK_DUPLICATE_WINDOW_MS) {
      return false;
    }
    return normalizeFeedbackText(submission.message) === normalizedIncomingMessage;
  });
  if (duplicateExists) {
    return {
      ok: false,
      status: 409,
      message: "This report looks like a duplicate of a recent submission.",
    };
  }

  return { ok: true };
}
