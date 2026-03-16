import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth/serverSession";
import {
  enforceSessionMutationRateLimit,
  parseJsonBody,
  requireAllowedOrigin,
} from "@/lib/security/requestValidation";

export async function GET() {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Determine the handles this user has engaged with based on Voice Profiles
    // 1. Fetch from VoiceProfiles
    const userProfiles = await prisma.voiceProfile.findMany({
      where: { userId: session.user.id },
      select: { xHandle: true },
    });

    // 2. Fetch from OnboardingRuns (since users might have scraped without chatting yet)
    const onboardingRuns = await prisma.onboardingRun.findMany({
      where: { userId: session.user.id },
      select: { input: true },
    });

    // Extract handles from Onboarding JSON inputs
    const onboardingHandles = onboardingRuns
      .map((run) => {
        const input = run.input as { account?: string } | null;
        return input?.account ? input.account.replace(/^@/, "").toLowerCase() : null;
      })
      .filter(Boolean);

    // Create a distinct list combining both sources
    const profileHandles = userProfiles
      .map((p) => p.xHandle)
      .filter((h): h is string => h !== null);
    const activeHandle = session.user.activeXHandle?.replace(/^@/, "").toLowerCase() ?? null;
    const handles = Array.from(
      new Set([
        ...profileHandles,
        ...onboardingHandles,
        ...(activeHandle ? [activeHandle] : []),
      ]),
    );

    return NextResponse.json({ ok: true, data: { handles } });
  } catch (error) {
    console.error("Failed to fetch user handles:", error);
    return NextResponse.json({ ok: false, error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const originError = requireAllowedOrigin(req);
  if (originError) {
    return originError;
  }

  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const rateLimitError = await enforceSessionMutationRateLimit(req, {
    userId: session.user.id,
    scope: "creator:profile_handles",
    user: {
      limit: 20,
      windowMs: 5 * 60 * 1000,
      message: "Too many handle updates. Please wait before trying again.",
    },
    ip: {
      limit: 50,
      windowMs: 5 * 60 * 1000,
      message: "Too many handle updates from this network. Please wait before trying again.",
    },
  });
  if (rateLimitError) {
    return rateLimitError;
  }

  try {
    const bodyResult = await parseJsonBody<{ handle?: unknown }>(req, {
      maxBytes: 4 * 1024,
    });
    if (!bodyResult.ok) {
      return bodyResult.response;
    }
    const { handle } = bodyResult.value;

    if (!handle || typeof handle !== "string") {
      return NextResponse.json({ ok: false, error: "Handle is required" }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { activeXHandle: handle },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to update active handle:", error);
    return NextResponse.json({ ok: false, error: "Internal Server Error" }, { status: 500 });
  }
}
