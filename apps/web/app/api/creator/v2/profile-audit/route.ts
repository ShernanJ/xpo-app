import { NextRequest, NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth/serverSession";
import { prisma } from "@/lib/db";
import {
  StyleCardSchema,
  saveStyleProfile,
} from "@/lib/agent-v2/core/styleProfile";
import { resolveWorkspaceHandleForRequest } from "@/lib/workspaceHandle.server";
import {
  applyProfileAuditPatchToStyleCard,
  parseProfileAuditPatchRequest,
  type ProfileAuditRequestBody,
} from "./route.logic";
import {
  enforceSessionMutationRateLimit,
  parseJsonBody,
  requireAllowedOrigin,
} from "@/lib/security/requestValidation";

function buildDefaultStyleCard() {
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
    feedbackSubmissions: [],
  });
}

export async function PATCH(request: NextRequest) {
  const originError = requireAllowedOrigin(request);
  if (originError) {
    return originError;
  }

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

  const rateLimitError = await enforceSessionMutationRateLimit(request, {
    userId: session.user.id,
    scope: "creator:v2_profile_audit",
    user: {
      limit: 12,
      windowMs: 5 * 60 * 1000,
      message: "Too many profile audit updates. Please wait before trying again.",
    },
    ip: {
      limit: 30,
      windowMs: 5 * 60 * 1000,
      message: "Too many profile audit updates from this network. Please wait before trying again.",
    },
  });
  if (rateLimitError) {
    return rateLimitError;
  }

  const bodyResult = await parseJsonBody<ProfileAuditRequestBody>(request, {
    maxBytes: 16 * 1024,
  });
  if (!bodyResult.ok) {
    return bodyResult.response;
  }
  const body = bodyResult.value;

  const parsedPatch = parseProfileAuditPatchRequest(body);
  if (!parsedPatch.ok) {
    return NextResponse.json(
      { ok: false, errors: parsedPatch.errors },
      { status: 400 },
    );
  }

  const existingProfile = await prisma.voiceProfile.findFirst({
    where: {
      userId: session.user.id,
      xHandle: workspaceHandle.xHandle,
    },
  });
  const parsedStyleCard = existingProfile?.styleCard
    ? StyleCardSchema.safeParse(existingProfile.styleCard)
    : null;
  const baseStyleCard = parsedStyleCard?.success ? parsedStyleCard.data : buildDefaultStyleCard();
  const nextStyleCard = applyProfileAuditPatchToStyleCard({
    styleCard: baseStyleCard,
    patch: parsedPatch.data,
  });

  await saveStyleProfile(session.user.id, workspaceHandle.xHandle, nextStyleCard);

  return NextResponse.json({
    ok: true,
    data: {
      profileAuditState: nextStyleCard.profileAuditState,
    },
  });
}
