import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth/authOptions";
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

function buildEmptyStyleCard() {
  return StyleCardSchema.parse({
    sentenceOpenings: [],
    sentenceClosers: [],
    pacing: "",
    emojiPatterns: [],
    slangAndVocabulary: [],
    formattingRules: [],
    customGuidelines: [],
    contextAnchors: [],
    antiExamples: [],
  });
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

export async function GET() {
  const session = await getServerSession(authOptions);
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

  const voiceProfile = await prisma.voiceProfile.findFirst({
    where: {
      userId: session.user.id,
      xHandle,
    },
  });

  const parsedStyleCard = voiceProfile?.styleCard
    ? StyleCardSchema.safeParse(voiceProfile.styleCard)
    : null;
  const feedbackSubmissions = parsedStyleCard?.success
    ? [...(parsedStyleCard.data.feedbackSubmissions ?? [])]
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, 30)
    : [];

  return NextResponse.json({
    ok: true,
    data: {
      submissions: feedbackSubmissions,
    },
  });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
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

  const currentProfile = await prisma.voiceProfile.findFirst({
    where: {
      userId: session.user.id,
      xHandle,
    },
  });

  const parsedCurrentStyle = currentProfile?.styleCard
    ? StyleCardSchema.safeParse(currentProfile.styleCard)
    : null;
  const baseStyleCard =
    parsedCurrentStyle?.success && parsedCurrentStyle.data
      ? parsedCurrentStyle.data
      : buildEmptyStyleCard();
  const existingSubmissions = baseStyleCard.feedbackSubmissions ?? [];
  const guardResult = evaluateFeedbackSubmissionGuards({
    existingSubmissions,
    incomingMessage: parsedBody.data.message,
    incomingAttachments: parsedBody.data.attachments ?? [],
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
    status: "open",
    statusUpdatedAt: createdAtIso,
    category: parsedBody.data.category,
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
    attachments: parsedBody.data.attachments ?? [],
  });

  const nextStyleCard = StyleCardSchema.parse({
    ...baseStyleCard,
    feedbackSubmissions: [
      ...(baseStyleCard.feedbackSubmissions ?? []),
      submission,
    ].slice(-100),
  });

  const savedProfile = currentProfile
    ? await prisma.voiceProfile.update({
        where: { id: currentProfile.id },
        data: {
          styleCard: nextStyleCard as unknown as Prisma.InputJsonObject,
        },
      })
    : await prisma.voiceProfile.create({
        data: {
          userId: session.user.id,
          xHandle,
          styleCard: nextStyleCard as unknown as Prisma.InputJsonObject,
        },
      });

  return NextResponse.json({
    ok: true,
    data: {
      id: submission.id,
      createdAt: submission.createdAt,
      profileId: savedProfile.id,
    },
  });
}

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
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

  const currentProfile = await prisma.voiceProfile.findFirst({
    where: {
      userId: session.user.id,
      xHandle,
    },
  });

  if (!currentProfile?.styleCard) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "feedback", message: "No feedback submissions found." }] },
      { status: 404 },
    );
  }

  const parsedCurrentStyle = StyleCardSchema.safeParse(currentProfile.styleCard);
  if (!parsedCurrentStyle.success) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "feedback", message: "Feedback store is invalid." }] },
      { status: 500 },
    );
  }

  const existingSubmissions = parsedCurrentStyle.data.feedbackSubmissions ?? [];
  const submissionIndex = existingSubmissions.findIndex(
    (submission) => submission.id === parsedBody.data.submissionId,
  );
  if (submissionIndex === -1) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "feedback", message: "Submission not found." }] },
      { status: 404 },
    );
  }

  const statusUpdatedAt = new Date().toISOString();
  const updatedSubmission = FeedbackSubmissionSchema.parse({
    ...existingSubmissions[submissionIndex],
    status: parsedBody.data.status,
    statusUpdatedAt,
  });
  const nextSubmissions = [...existingSubmissions];
  nextSubmissions[submissionIndex] = updatedSubmission;

  const nextStyleCard = StyleCardSchema.parse({
    ...parsedCurrentStyle.data,
    feedbackSubmissions: nextSubmissions,
  });

  await prisma.voiceProfile.update({
    where: { id: currentProfile.id },
    data: {
      styleCard: nextStyleCard as unknown as Prisma.InputJsonObject,
    },
  });

  return NextResponse.json({
    ok: true,
    data: {
      submission: updatedSubmission,
    },
  });
}
