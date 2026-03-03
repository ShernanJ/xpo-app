import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Determine the handles this user has engaged with based on Voice Profiles
    const userProfiles = await prisma.voiceProfile.findMany({
      where: { userId: session.user.id },
      select: { xHandle: true },
    });

    // Create a distinct list of strings, filtering out nulls
    const handles = Array.from(new Set(userProfiles.map(p => p.xHandle).filter((h): h is string => h !== null)));

    return NextResponse.json({ ok: true, data: { handles } });
  } catch (error) {
    console.error("Failed to fetch user handles:", error);
    return NextResponse.json({ ok: false, error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
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
