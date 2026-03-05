import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/serverSession";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  FeedbackAttachmentSchema,
  FeedbackCategorySchema,
  FeedbackSubmissionSchema,
  FeedbackSubmissionStatusSchema,
  StyleCardSchema,
} from "@/lib/agent-v2/core/styleProfile";
import {
  evaluateFeedbackSubmissionGuards,
  FEEDBACK_MAX_ATTACHMENTS,
} from "./route.logic";

const MAX_LEGACY_BACKFILL_COUNT = 250;
const MAX_GUARD_LOOKBACK_COUNT = 250;
const MAX_THUMBNAIL_DATA_URL_CHARS = 250_000;
const VALID_THUMBNAIL_PREFIX = /^data:image\/(png|jpeg|jpg);base64,/i;

const FeedbackRequestSchema = z.object({
  category: FeedbackCategorySchema,
  title: z.string().trim().min(2).max(140).nullable().optional(),
  message: z.string().trim().min(8).max(10000),
  fields: z.record(z.string(), z.string()).optional(),
  context: z
    .object({
      pagePath: z.string().optional(),
      threadId: z.string().nullable().optional(),
      activeModal: z.string().nullable().optional(),
      draftMessageId: z.string().nullable().optional(),
      viewportWidth: z.number().int().positive().optional(),
      viewportHeight: z.number().int().positive().optional(),
      userAgent: z.string().optional(),
      appSurface: z.string().optional(),
    })
    .optional(),
  attachments: z.array(FeedbackAttachmentSchema).max(FEEDBACK_MAX_ATTACHMENTS).optional(),
});

const FeedbackStatusUpdateRequestSchema = z.object({
  submissionId: z.string().trim().min(1),
  status: FeedbackSubmissionStatusSchema,
});

function getActiveHandle(session: {
  user?: {
    activeXHandle?: string | null;
  };
} | null): string | null {
  if (!session?.user?.activeXHandle || typeof session.user.activeXHandle !== "string") {
    return null;
  }

  const normalized = session.user.activeXHandle.trim();
  return normalized || null;
}

function sanitizeFields(fields?: Record<string, string>): Record<string, string> {
  if (!fields) {
    return {};
  }

  const entries = Object.entries(fields)
    .map(([key, value]) => [key.trim(), value.trim()] as const)
    .filter(([key, value]) => key.length > 0 && value.length > 0)
    .slice(0, 12);

  return Object.fromEntries(entries);
}

function sanitizeAttachments(
  attachments: z.infer<typeof FeedbackAttachmentSchema>[],
): z.infer<typeof FeedbackAttachmentSchema>[] {
  return attachments.map((attachment) => {
    const thumbnailDataUrl =
      typeof attachment.thumbnailDataUrl === "string" &&
      attachment.thumbnailDataUrl.length <= MAX_THUMBNAIL_DATA_URL_CHARS &&
      VALID_THUMBNAIL_PREFIX.test(attachment.thumbnailDataUrl)
        ? attachment.thumbnailDataUrl
        : null;

    return FeedbackAttachmentSchema.parse({
      ...attachment,
      thumbnailDataUrl,
    });
  });
}

function parseFeedbackAttachmentsJson(
  value: Prisma.JsonValue | null | undefined,
): z.infer<typeof FeedbackAttachmentSchema>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const parsed = z.array(FeedbackAttachmentSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

function toDateOrNow(value: string | null | undefined): Date {
  if (value) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return new Date(parsed);
    }
  }
  return new Date();
}

function mapRecordToSubmission(
  record: {
    id: string;
    userId: string;
    category: string;
    status: string;
    title: string | null;
    message: string;
    fields: Prisma.JsonValue;
    context: Prisma.JsonValue;
    attachments: Prisma.JsonValue;
    createdAt: Date;
    statusUpdatedAt: Date | null;
    statusUpdatedByUserId: string | null;
    submittedByUserHandle: string | null;
    submittedByXHandle: string | null;
  },
) {
  const parsedFields = z.record(z.string(), z.string()).safeParse(record.fields);
  const parsedContext = z
    .object({
      pagePath: z.string().default("/chat"),
      threadId: z.string().nullable().optional(),
      activeModal: z.string().nullable().optional(),
      draftMessageId: z.string().nullable().optional(),
      viewportWidth: z.number().int().positive().optional(),
      viewportHeight: z.number().int().positive().optional(),
      userAgent: z.string().optional(),
      appSurface: z.string().default("chat"),
    })
    .safeParse(record.context);

  return FeedbackSubmissionSchema.parse({
    id: record.id,
    createdAt: record.createdAt.toISOString(),
    category: record.category,
    status: record.status,
    statusUpdatedAt: record.statusUpdatedAt?.toISOString(),
    statusUpdatedByUserId: record.statusUpdatedByUserId,
    title: record.title,
    message: record.message,
    attachments: parseFeedbackAttachmentsJson(record.attachments),
    fields: parsedFields.success ? parsedFields.data : {},
    submittedBy: {
      userId: record.userId,
      userHandle: record.submittedByUserHandle ?? null,
      xHandle: record.submittedByXHandle ?? null,
    },
    context: parsedContext.success
      ? parsedContext.data
      : {
          pagePath: "/chat",
          appSurface: "chat",
        },
  });
}

async function backfillLegacyFeedbackSubmissions(args: {
  userId: string;
  xHandle: string;
}) {
  const voiceProfile = await prisma.voiceProfile.findFirst({
    where: {
      userId: args.userId,
      xHandle: args.xHandle,
    },
    select: {
      styleCard: true,
    },
  });

  if (!voiceProfile?.styleCard) {
    return;
  }

  const parsedStyleCard = StyleCardSchema.safeParse(voiceProfile.styleCard);
  if (!parsedStyleCard.success) {
    return;
  }

  const legacySubmissions = (parsedStyleCard.data.feedbackSubmissions ?? []).slice(
    -MAX_LEGACY_BACKFILL_COUNT,
  );
  if (legacySubmissions.length === 0) {
    return;
  }

  await prisma.feedbackSubmission.createMany({
    data: legacySubmissions.map((submission) => ({
      id: submission.id,
      userId: args.userId,
      xHandle: args.xHandle,
      category: submission.category,
      status: submission.status ?? "open",
      title: submission.title ?? null,
      message: submission.message,
      fields: sanitizeFields(submission.fields),
      context: submission.context,
      attachments: sanitizeAttachments(submission.attachments ?? []),
      submittedByUserHandle: submission.submittedBy?.userHandle ?? null,
      submittedByXHandle: submission.submittedBy?.xHandle ?? null,
      statusUpdatedAt: toDateOrNow(submission.statusUpdatedAt ?? submission.createdAt),
      statusUpdatedByUserId: submission.submittedBy?.userId ?? args.userId,
      createdAt: toDateOrNow(submission.createdAt),
    })),
    skipDuplicates: true,
  });
}

export async function GET() {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "auth", message: "Unauthorized" }] },
      { status: 401 },
    );
  }

  const xHandle = getActiveHandle(session);
  if (!xHandle) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "xHandle", message: "No active X profile selected." }] },
      { status: 400 },
    );
  }

  await backfillLegacyFeedbackSubmissions({
    userId: session.user.id,
    xHandle,
  });

  const submissions = await prisma.feedbackSubmission.findMany({
    where: {
      userId: session.user.id,
      xHandle,
    },
    orderBy: [{ createdAt: "desc" }],
    take: 30,
    select: {
      id: true,
      userId: true,
      category: true,
      status: true,
      title: true,
      message: true,
      fields: true,
      context: true,
      attachments: true,
      createdAt: true,
      statusUpdatedAt: true,
      statusUpdatedByUserId: true,
      submittedByUserHandle: true,
      submittedByXHandle: true,
    },
  });

  return NextResponse.json({
    ok: true,
    data: {
      submissions: submissions.map((submission) => mapRecordToSubmission(submission)),
    },
  });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "auth", message: "Unauthorized" }] },
      { status: 401 },
    );
  }

  const xHandle = getActiveHandle(session);
  if (!xHandle) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "xHandle", message: "No active X profile selected." }] },
      { status: 400 },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, errors: [{ field: "body", message: "Request body must be valid JSON." }] },
      { status: 400 },
    );
  }

  const parsedBody = FeedbackRequestSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "body", message: "Invalid feedback payload." }] },
      { status: 400 },
    );
  }

  await backfillLegacyFeedbackSubmissions({
    userId: session.user.id,
    xHandle,
  });

  const existingRecords = await prisma.feedbackSubmission.findMany({
    where: {
      userId: session.user.id,
      xHandle,
    },
    orderBy: [{ createdAt: "desc" }],
    take: MAX_GUARD_LOOKBACK_COUNT,
    select: {
      createdAt: true,
      message: true,
      attachments: true,
    },
  });
  const guardResult = evaluateFeedbackSubmissionGuards({
    existingSubmissions: existingRecords.map((record) => ({
      createdAt: record.createdAt.toISOString(),
      message: record.message,
      attachments: parseFeedbackAttachmentsJson(record.attachments),
    })),
    incomingMessage: parsedBody.data.message,
    incomingAttachments: sanitizeAttachments(parsedBody.data.attachments ?? []),
  });
  if (!guardResult.ok) {
    return NextResponse.json(
      {
        ok: false,
        errors: [
          {
            field: "feedback",
            message: guardResult.message,
          },
        ],
      },
      { status: guardResult.status },
    );
  }

  const createdAtIso = new Date().toISOString();
  const submission = FeedbackSubmissionSchema.parse({
    id: crypto.randomUUID(),
    createdAt: createdAtIso,
    category: parsedBody.data.category,
    status: "open",
    statusUpdatedAt: createdAtIso,
    title: parsedBody.data.title ?? null,
    message: parsedBody.data.message,
    fields: sanitizeFields(parsedBody.data.fields),
    submittedBy: {
      userId: session.user.id,
      userHandle: session.user.handle ?? null,
      xHandle,
    },
    context: {
      pagePath: parsedBody.data.context?.pagePath ?? "/chat",
      threadId: parsedBody.data.context?.threadId ?? null,
      activeModal: parsedBody.data.context?.activeModal ?? null,
      draftMessageId: parsedBody.data.context?.draftMessageId ?? null,
      viewportWidth: parsedBody.data.context?.viewportWidth,
      viewportHeight: parsedBody.data.context?.viewportHeight,
      userAgent: parsedBody.data.context?.userAgent,
      appSurface: parsedBody.data.context?.appSurface ?? "chat",
    },
    attachments: sanitizeAttachments(parsedBody.data.attachments ?? []),
  });

  await prisma.feedbackSubmission.create({
    data: {
      id: submission.id,
      userId: session.user.id,
      xHandle,
      category: submission.category,
      status: submission.status,
      title: submission.title ?? null,
      message: submission.message,
      fields: submission.fields,
      context: submission.context,
      attachments: submission.attachments,
      submittedByUserHandle: submission.submittedBy.userHandle ?? null,
      submittedByXHandle: submission.submittedBy.xHandle ?? null,
      statusUpdatedAt: toDateOrNow(submission.statusUpdatedAt ?? submission.createdAt),
      statusUpdatedByUserId: session.user.id,
      createdAt: toDateOrNow(submission.createdAt),
    },
  });

  return NextResponse.json({
    ok: true,
    data: {
      id: submission.id,
      createdAt: submission.createdAt,
    },
  });
}

export async function PATCH(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "auth", message: "Unauthorized" }] },
      { status: 401 },
    );
  }

  const xHandle = getActiveHandle(session);
  if (!xHandle) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "xHandle", message: "No active X profile selected." }] },
      { status: 400 },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, errors: [{ field: "body", message: "Request body must be valid JSON." }] },
      { status: 400 },
    );
  }

  const parsedBody = FeedbackStatusUpdateRequestSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "body", message: "Invalid feedback status payload." }] },
      { status: 400 },
    );
  }

  await backfillLegacyFeedbackSubmissions({
    userId: session.user.id,
    xHandle,
  });

  const existingSubmission = await prisma.feedbackSubmission.findFirst({
    where: {
      id: parsedBody.data.submissionId,
      userId: session.user.id,
      xHandle,
    },
    select: {
      id: true,
    },
  });
  if (!existingSubmission) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "feedback", message: "Submission not found." }] },
      { status: 404 },
    );
  }

  const statusUpdatedAt = new Date();
  const updatedSubmission = await prisma.feedbackSubmission.update({
    where: {
      id: existingSubmission.id,
    },
    data: {
      status: parsedBody.data.status,
      statusUpdatedAt,
      statusUpdatedByUserId: session.user.id,
    },
    select: {
      id: true,
      userId: true,
      category: true,
      status: true,
      title: true,
      message: true,
      fields: true,
      context: true,
      attachments: true,
      createdAt: true,
      statusUpdatedAt: true,
      statusUpdatedByUserId: true,
      submittedByUserHandle: true,
      submittedByXHandle: true,
    },
  });

  return NextResponse.json({
    ok: true,
    data: {
      submission: mapRecordToSubmission(updatedSubmission),
    },
  });
}
