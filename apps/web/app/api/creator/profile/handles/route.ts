import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth/serverSession";

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
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { handle } = await req.json();

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
