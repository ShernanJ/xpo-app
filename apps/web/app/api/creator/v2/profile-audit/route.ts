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

  let body: ProfileAuditRequestBody;
  try {
    body = (await request.json()) as ProfileAuditRequestBody;
  } catch {
    return NextResponse.json(
      { ok: false, errors: [{ field: "body", message: "Request body must be valid JSON." }] },
      { status: 400 },
    );
  }

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
