import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/serverSession";

import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  StyleCardSchema,
  UserPreferencesSchema,
} from "@/lib/agent-v2/core/styleProfile";
import {
  DEFAULT_USER_PREFERENCES,
  normalizeUserPreferences,
} from "@/lib/agent-v2/core/preferenceConstraints";
import { resolveWorkspaceHandleForRequest } from "@/lib/workspaceHandle.server";

async function readVoiceProfile(userId: string, xHandle: string) {
  return prisma.voiceProfile.findFirst({
    where: { userId, xHandle },
  });
}

export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "auth", message: "Unauthorized" }] },
      { status: 401 },
    );
  }

  const workspaceHandle = await resolveWorkspaceHandleForRequest({
    request,
    session,
    allowSessionFallback: false,
  });
  if (!workspaceHandle.ok) {
    return workspaceHandle.response;
  }

  const voiceProfile = await readVoiceProfile(session.user.id, workspaceHandle.xHandle);
  const parsedStyleCard = voiceProfile?.styleCard
    ? StyleCardSchema.safeParse(voiceProfile.styleCard)
    : null;
  const preferences = normalizeUserPreferences(parsedStyleCard?.success ? parsedStyleCard.data.userPreferences : null);

  return NextResponse.json({
    ok: true,
    data: {
      preferences,
      defaults: DEFAULT_USER_PREFERENCES,
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

  const workspaceHandle = await resolveWorkspaceHandleForRequest({
    request,
    session,
  });
  if (!workspaceHandle.ok) {
    return workspaceHandle.response;
  }

  let body: { preferences?: unknown };
  try {
    body = (await request.json()) as { preferences?: unknown };
  } catch {
    return NextResponse.json(
      { ok: false, errors: [{ field: "body", message: "Request body must be valid JSON." }] },
      { status: 400 },
    );
  }

  const parsedPreferences = UserPreferencesSchema.safeParse(body.preferences);
  if (!parsedPreferences.success) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "preferences", message: "Invalid preferences payload." }] },
      { status: 400 },
    );
  }

  const nextPreferences = normalizeUserPreferences(parsedPreferences.data);
  const existingProfile = await readVoiceProfile(session.user.id, workspaceHandle.xHandle);
  const existingStyleCard = existingProfile?.styleCard
    ? StyleCardSchema.safeParse(existingProfile.styleCard)
    : null;

  const nextStyleCard = StyleCardSchema.parse({
    ...(existingStyleCard?.success ? existingStyleCard.data : {
      sentenceOpenings: [],
      sentenceClosers: [],
      pacing: "",
      emojiPatterns: [],
      slangAndVocabulary: [],
      formattingRules: [],
      customGuidelines: [],
      contextAnchors: [],
      antiExamples: [],
    }),
    userPreferences: nextPreferences,
  });

  const savedProfile = existingProfile
    ? await prisma.voiceProfile.update({
        where: { id: existingProfile.id },
        data: {
          styleCard: nextStyleCard as unknown as Prisma.InputJsonObject,
        },
      })
    : await prisma.voiceProfile.create({
        data: {
          userId: session.user.id,
          xHandle: workspaceHandle.xHandle,
          styleCard: nextStyleCard as unknown as Prisma.InputJsonObject,
        },
      });

  return NextResponse.json({
    ok: true,
    data: {
      preferences: nextPreferences,
      voiceProfileId: savedProfile.id,
    },
  });
}
