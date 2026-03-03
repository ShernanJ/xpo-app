import { NextRequest, NextResponse } from "next/server";
import { readOnboardingRunById } from "@/lib/onboarding/store";
import { generateStyleProfile } from "@/lib/agent-v2/core/styleProfile";
import { generateWelcome } from "@/lib/agent-v2/agents/coach";

export async function GET(
  request: NextRequest,
) {
  const searchParams = request.nextUrl.searchParams;
  const runId = searchParams.get("runId");
  const accountName = searchParams.get("account") || "there";

  if (!runId) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "runId", message: "Missing runId." }] },
      { status: 400 },
    );
  }

  try {
    const storedRun = await readOnboardingRunById(runId);
    if (!storedRun) {
      return NextResponse.json(
        { ok: false, errors: [{ field: "runId", message: "Onboarding run not found." }] },
        { status: 404 },
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const oResult = storedRun.result as Record<string, any>;
    const topPosts = oResult?.creatorProfile?.examples?.bestPerforming ?? [];
    const topicHint = topPosts.length > 0
      ? topPosts[0].text.substring(0, 100).replace(/\n/g, " ").trim()
      : null;

    // Get tone guidelines from style card, default gracefully
    const styleCard = await generateStyleProfile("anonymous", accountName, 20);
    const toningCues = styleCard
      ? `Pacing: ${styleCard.pacing}. Formatting: ${styleCard.formattingRules.join(", ")}`
      : "Mirror a casual, lowercase peer.";

    const welcome = await generateWelcome(accountName, topicHint, toningCues);

    if (!welcome) {
      return NextResponse.json(
        { ok: false, errors: [{ field: "llm", message: "Failed to generate welcome." }] },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        response: welcome.response,
      },
    });
  } catch (error) {
    console.error("Welcome route failed:", error);
    return NextResponse.json(
      { ok: false, errors: [{ message: "Internal server error." }] },
      { status: 500 },
    );
  }
}

