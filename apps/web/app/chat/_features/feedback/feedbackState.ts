"use client";

export type FeedbackCategory = "feature_request" | "feedback" | "bug_report";
export type FeedbackReportStatus = "open" | "resolved" | "cancelled";
export type FeedbackReportFilter = "all" | FeedbackReportStatus;

export interface FeedbackImageDraft {
  id: string;
  file: File;
  previewUrl: string;
}

export interface FeedbackAttachmentPayload {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  status: "pending_upload";
  signatureHex?: string | null;
  thumbnailDataUrl?: string | null;
}

export interface FeedbackHistoryItem {
  id: string;
  createdAt: string;
  category: FeedbackCategory;
  status?: FeedbackReportStatus;
  statusUpdatedAt?: string;
  statusUpdatedByUserId?: string | null;
  title?: string | null;
  message: string;
  attachments: FeedbackAttachmentPayload[];
}

interface FeedbackCategoryConfig {
  label: string;
  helper: string;
  defaultTitle: string;
  template: string;
  exampleTitle: string;
  exampleBody: string;
}

export const FEEDBACK_MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
export const FEEDBACK_MAX_FILES = 6;
const FEEDBACK_SUPPORTED_FILE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "video/mp4",
]);

export const FEEDBACK_HISTORY_FILTER_OPTIONS: Array<{
  value: FeedbackReportFilter;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
  { value: "cancelled", label: "Cancelled" },
];

export const FEEDBACK_CATEGORY_ORDER: FeedbackCategory[] = [
  "feedback",
  "feature_request",
  "bug_report",
];

export const FEEDBACK_CATEGORY_CONFIG: Record<
  FeedbackCategory,
  FeedbackCategoryConfig
> = {
  feature_request: {
    label: "Feature Request",
    helper: "Share the missing workflow and why it matters in your day-to-day.",
    defaultTitle: "Feature request",
    template:
      "**🚧 Problem:**\nWhat slows you down right now?\n\n**✨ Requested feature:**\nWhat should happen instead?\n\n**📈 Expected impact:**\nHow this would improve your workflow or outcomes.",
    exampleTitle: "Good example",
    exampleBody:
      "Problem: when i'm refining drafts, i keep opening each card to compare versions and lose context.\n\nRequested feature: add an inline diff toggle in the draft editor that shows added/removed lines between the selected version and current version.\n\nExpected impact: i'd ship revisions faster because i can compare changes in one view without bouncing around the thread.",
  },
  feedback: {
    label: "Feedback",
    helper: "Tell us what feels good and what still feels off in normal use.",
    defaultTitle: "Feedback",
    template:
      "**✅ What worked well:**\n\n**🤔 What felt confusing or slow:**\n\n**🛠️ Suggested improvement:**\n\n**📝 Anything else:**",
    exampleTitle: "Good example",
    exampleBody:
      "What worked well: the new growth guide is way easier to skim.\n\nWhat felt confusing or slow: evidence cards in profile analysis all look the same at first glance.\n\nSuggested improvement: add one-line labels that explain each card's unique signal before the post text.\n\nAnything else: i'm using this mostly on laptop + devtools split view.",
  },
  bug_report: {
    label: "Bug Report",
    helper: "Include repro steps + expected vs actual so we can fix it quickly.",
    defaultTitle: "Bug report",
    template:
      "**🐞 Summary:**\n\n**🧪 Steps to reproduce:**\n1.\n2.\n3.\n\n**✅ Expected result:**\n\n**❌ Actual result:**\n\n**📊 Frequency / impact:**",
    exampleTitle: "Good example",
    exampleBody:
      "Summary: draft editor jumps to 1/1 after pressing Back once.\n\nSteps to reproduce:\n1. open a draft with at least 3 versions.\n2. press Back in the version navigator.\n3. try pressing Forward.\n\nExpected result: forward returns to the newer version.\n\nActual result: it shows 1/1 and forward stays disabled.\n\nFrequency / impact: always reproducible. blocks revision workflow.",
  },
};

export function buildDefaultFeedbackDrafts(): Record<FeedbackCategory, string> {
  return FEEDBACK_CATEGORY_ORDER.reduce(
    (acc, category) => {
      acc[category] = FEEDBACK_CATEGORY_CONFIG[category].template;
      return acc;
    },
    {
      feature_request: "",
      feedback: "",
      bug_report: "",
    } as Record<FeedbackCategory, string>,
  );
}

export function buildDefaultFeedbackTitles(): Record<FeedbackCategory, string> {
  return FEEDBACK_CATEGORY_ORDER.reduce(
    (acc, category) => {
      acc[category] = FEEDBACK_CATEGORY_CONFIG[category].defaultTitle;
      return acc;
    },
    {
      feedback: "",
      feature_request: "",
      bug_report: "",
    } as Record<FeedbackCategory, string>,
  );
}

export async function readFeedbackFileSignatureHex(file: File): Promise<string | null> {
  try {
    const signatureBytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    if (signatureBytes.length === 0) {
      return null;
    }

    return Array.from(signatureBytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

export async function buildFeedbackImageThumbnailDataUrl(
  file: File,
): Promise<string | null> {
  if (!file.type.toLowerCase().startsWith("image/")) {
    return null;
  }

  try {
    const sourceDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
        } else {
          reject(new Error("Invalid image data"));
        }
      };
      reader.onerror = () => reject(reader.error ?? new Error("Failed to read image"));
      reader.readAsDataURL(file);
    });

    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new window.Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error("Failed to decode image"));
      nextImage.src = sourceDataUrl;
    });

    const maxDimension = 220;
    const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }

    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.72);
  } catch {
    return null;
  }
}

export function normalizeFeedbackStatus(
  status: FeedbackReportStatus | undefined,
): FeedbackReportStatus {
  return status ?? "open";
}

export function formatFeedbackStatusLabel(status: FeedbackReportStatus): string {
  switch (status) {
    case "resolved":
      return "Resolved";
    case "cancelled":
      return "Cancelled";
    default:
      return "Open";
  }
}

export function getFeedbackStatusPillClassName(status: FeedbackReportStatus): string {
  if (status === "resolved") {
    return "border-emerald-300/30 bg-emerald-300/10 text-emerald-200";
  }

  if (status === "cancelled") {
    return "border-rose-300/30 bg-rose-300/10 text-rose-200";
  }

  return "border-white/10 text-zinc-300";
}

export function getFeedbackHistoryActivityTimestamp(entry: FeedbackHistoryItem): number {
  const candidate = entry.statusUpdatedAt ?? entry.createdAt;
  const parsed = Date.parse(candidate);
  if (Number.isFinite(parsed)) {
    return parsed;
  }

  const createdAt = Date.parse(entry.createdAt);
  return Number.isFinite(createdAt) ? createdAt : 0;
}

export function isSupportedFeedbackFile(file: File): boolean {
  const mimeType = file.type.toLowerCase();
  if (FEEDBACK_SUPPORTED_FILE_MIME_TYPES.has(mimeType)) {
    return true;
  }

  const lowerName = file.name.toLowerCase();
  return (
    lowerName.endsWith(".png") ||
    lowerName.endsWith(".jpg") ||
    lowerName.endsWith(".jpeg") ||
    lowerName.endsWith(".mp4")
  );
}

export function extractFeedbackTemplateFields(text: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const lines = text.split(/\r?\n/);
  let currentKey: string | null = null;
  let currentValue: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const normalizedHeading = line.replace(/\*\*/g, "").trim();
    if (/^[^:]{1,80}:$/.test(normalizedHeading)) {
      if (currentKey && currentValue.length > 0) {
        fields[currentKey] = currentValue.join(" ").trim();
      }
      currentKey = normalizedHeading.replace(/:$/, "").toLowerCase();
      currentValue = [];
      continue;
    }

    if (!line) {
      continue;
    }

    if (currentKey) {
      currentValue.push(line.replace(/^\d+\.\s*/, ""));
    }
  }

  if (currentKey && currentValue.length > 0) {
    fields[currentKey] = currentValue.join(" ").trim();
  }

  return fields;
}
