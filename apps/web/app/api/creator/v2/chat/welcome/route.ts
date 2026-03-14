import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readOnboardingRunById } from "@/lib/onboarding/store/onboardingRunStore";
import { buildCreatorAgentContext } from "@/lib/onboarding/strategy/agentContext";
import { generateWelcome } from "@/lib/agent-v2/agents/coach";
import {
  buildWelcomeFallbackMessage,
  buildWelcomeTopicHint,
  buildWelcomeVoiceContext,
} from "@/lib/agent-v2/welcomeMessage";

export async function GET(
  request: NextRequest,
) {
  const searchParams = request.nextUrl.searchParams;
  const runId = searchParams.get("runId");
  const accountName = searchParams.get("account");

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

    const agentContext = buildCreatorAgentContext({
      runId: storedRun.runId,
      onboarding: storedRun.result,
    });
    const resolvedAccountName = accountName || agentContext.account || "there";
    const topicHint = buildWelcomeTopicHint(agentContext.creatorProfile);
    const recentUserMessages = await prisma.chatMessage.findMany({
      where: {
        role: "user",
        thread: {
          memories: {
            some: { runId },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: { content: true },
    });
    const recentUserMessageContents = recentUserMessages.map((message) => message.content);
    const voiceContext = buildWelcomeVoiceContext({
      creatorProfile: agentContext.creatorProfile,
      recentUserMessages: recentUserMessageContents,
    });
    const welcome = await generateWelcome(
      resolvedAccountName,
      topicHint,
      voiceContext.toneGuide,
      voiceContext.voiceExamples,
      voiceContext.conversationExamples,
    );

    if (!welcome) {
      return NextResponse.json(
        {
          ok: true,
          data: {
            response: buildWelcomeFallbackMessage({
              accountName: resolvedAccountName,
              creatorProfile: agentContext.creatorProfile,
              topicHint,
              recentUserMessages: recentUserMessageContents,
              voiceExamples: voiceContext.voiceExamples,
              conversationExamples: voiceContext.conversationExamples,
            }),
          },
        },
        { status: 200 },
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
