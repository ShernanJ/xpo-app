import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";

import { buildCreatorProfileHintsFromOnboarding } from "@/lib/agent-v2/grounding/creatorProfileHints";
import { buildProfileReplyContext } from "@/lib/agent-v2/grounding/profileReplyContext";
import { authenticateExtensionRequest } from "@/lib/extension/auth";
import { loadExtensionUserContext } from "@/lib/extension/context";
import {
  buildReplyDraftGenerationContext,
  cleanReplyDraftStreamChunk,
  finalizeReplyDraftText,
  prepareExtensionReplyDraftPromptPacket,
} from "@/lib/extension/replyDraft";
import {
  buildStrategyAdjustments,
  getReplyInsightsForUser,
  upsertReplyOpportunityLifecycle,
} from "@/lib/extension/replyOpportunities";
import { recordProductEvent } from "@/lib/productEvents";
import { generateReplyDraftText, looksAcceptableReplyDraft } from "@/lib/reply-engine/index";
import { parseExtensionReplyDraftRequest } from "./route.logic";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const DEFAULT_REPLY_DRAFT_MODEL =
  process.env.GROQ_REPLY_DRAFT_MODEL?.trim() ||
  process.env.GROQ_MODEL?.trim() ||
  "openai/gpt-oss-120b";
const FALLBACK_REPLY_DRAFT_MODEL =
  process.env.GROQ_REPLY_DRAFT_FALLBACK_MODEL?.trim() ||
  "llama-3.3-70b-versatile";

function isOpenAiModel(model: string) {
  return model.startsWith("openai/");
}

function extractTextContent(
  content: string | null | Array<{ text?: string | null }> | undefined,
): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((entry) => (typeof entry?.text === "string" ? entry.text : ""))
      .join("");
  }

  return "";
}

export async function POST(request: NextRequest) {
  const auth = await authenticateExtensionRequest(request);
  if (!auth?.user?.id) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "auth", message: "Unauthorized" }] },
      { status: 401 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, errors: [{ field: "body", message: "Request body must be valid JSON." }] },
      { status: 400 },
    );
  }

  const parsed = parseExtensionReplyDraftRequest(body);
  if (!parsed.ok) {
    const bodyKeys =
      body && typeof body === "object" && !Array.isArray(body)
        ? Object.keys(body as Record<string, unknown>).slice(0, 12)
        : [];
    console.warn("[extension:reply-draft] invalid request", {
      message: parsed.message,
      bodyKeys,
    });
    return NextResponse.json(
      { ok: false, errors: [{ field: "body", message: parsed.message }] },
      { status: 400 },
    );
  }

  if (!process.env.GROQ_API_KEY?.trim()) {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ field: "server", message: "GROQ_API_KEY is not configured." }],
      },
      { status: 500 },
    );
  }

  const userContext = await loadExtensionUserContext({
    userId: auth.user.id,
    activeXHandle: auth.user.activeXHandle,
  });
  if (!userContext.ok) {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ field: userContext.field, message: userContext.message }],
      },
      { status: userContext.status },
    );
  }

  const replyInsights = await getReplyInsightsForUser({
    userId: auth.user.id,
    xHandle: userContext.xHandle,
  });
  const strategyAdjustments = buildStrategyAdjustments({
    strategySnapshot: userContext.context.growthStrategySnapshot,
    replyInsights,
  });
  const generation = buildReplyDraftGenerationContext({
    request: parsed.data,
    strategy: userContext.context.growthStrategySnapshot,
    replyInsights,
  });
  const creatorProfileHints = buildCreatorProfileHintsFromOnboarding({
    runId: userContext.storedRun.runId,
    onboarding: userContext.storedRun.result,
  });
  const profileReplyContext = buildProfileReplyContext({
    onboardingResult: userContext.storedRun.result,
    creatorProfileHints,
    creatorAgentContext: userContext.context,
  });
  const promptPacket = await prepareExtensionReplyDraftPromptPacket({
    request: parsed.data,
    strategy: userContext.context.growthStrategySnapshot,
    replyInsights,
    styleCard: userContext.styleCard,
    generation,
    creatorProfileHints,
    creatorAgentContext: userContext.context,
    profileReplyContext,
  });

  const chatCompletion = await groq.chat.completions.create({
    model: DEFAULT_REPLY_DRAFT_MODEL,
    temperature: 0.65,
    ...(isOpenAiModel(DEFAULT_REPLY_DRAFT_MODEL)
      ? {
          max_completion_tokens: 220,
          reasoning_effort: "low" as const,
        }
        : {
            max_tokens: 220,
        }),
    stream: true,
    messages: promptPacket.messages,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let streamedDraft = "";
      let hasEmittedContent = false;

      try {
        for await (const chunk of chatCompletion) {
          const rawContent = extractTextContent(chunk.choices[0]?.delta?.content);
          const content = cleanReplyDraftStreamChunk(rawContent, hasEmittedContent);
          if (!content) {
            continue;
          }

          streamedDraft += content;
          hasEmittedContent = true;
          controller.enqueue(encoder.encode(content));
        }

        const finalDraft = finalizeReplyDraftText(streamedDraft);
        const resolvedDraft = finalDraft
          ? {
              draft: finalDraft,
              model: DEFAULT_REPLY_DRAFT_MODEL,
            }
          : await generateReplyDraftText({
              promptPacket,
              model: DEFAULT_REPLY_DRAFT_MODEL,
              fallbackModel: FALLBACK_REPLY_DRAFT_MODEL,
            });

        if (!finalDraft) {
          controller.enqueue(encoder.encode(resolvedDraft.draft));
        }

        controller.close();

        const notes = [
          ...generation.notes,
          ...replyInsights.bestSignals.slice(0, 1),
          ...strategyAdjustments.experiments.slice(0, 1),
        ].slice(0, 4);
        const generatedOption = {
          id: "draft-1",
          label: parsed.data.tone === "bold" ? "bold" : "safe",
          text: resolvedDraft.draft,
          intent: generation.intent,
        };

        void (async () => {
          try {
            await upsertReplyOpportunityLifecycle({
              userId: auth.user.id,
              xHandle: userContext.xHandle,
              tweetId: parsed.data.tweetId,
              tweetText: parsed.data.tweetText,
              authorHandle: parsed.data.authorHandle,
              tweetUrl: parsed.data.tweetUrl,
              stage: parsed.data.stage,
              tone: parsed.data.tone,
              goal: parsed.data.goal,
              eventType: "generated",
              heuristicScore: parsed.data.heuristicScore,
              heuristicTier: parsed.data.heuristicTier,
              strategyPillar: generation.strategyPillar,
              generatedAngleLabel: generation.angleLabel,
              generatedOptions: [generatedOption],
              notes,
            });

            await recordProductEvent({
              userId: auth.user.id,
              xHandle: userContext.xHandle,
              eventType: "extension_reply_generated",
              properties: {
                tweetId: parsed.data.tweetId,
                stage: parsed.data.stage,
                tone: parsed.data.tone,
                goal: parsed.data.goal,
                strategyPillar: generation.strategyPillar,
                angleLabel: generation.angleLabel,
                positioningConfidence: userContext.context.growthStrategySnapshot.confidence.positioning,
                groqModel: resolvedDraft.model,
                usedFallback: resolvedDraft.model !== DEFAULT_REPLY_DRAFT_MODEL,
                replyLane: promptPacket.voiceTarget.lane,
                usedVisualContext: Boolean(promptPacket.visualContext),
                streamAccepted: looksAcceptableReplyDraft({
                  draft: resolvedDraft.draft,
                  sourceContext: promptPacket.sourceContext,
                }),
              },
            });
          } catch (error) {
            console.error("Failed to persist extension reply generation:", error);
          }
        })();
      } catch (error) {
        console.error("Failed to stream extension reply draft:", error);
        controller.error(error);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
