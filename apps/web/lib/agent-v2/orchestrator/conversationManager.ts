import { classifyIntent } from "../agents/classifier";
import { generateCoachReply } from "../agents/coach";
import { generatePlan } from "../agents/planner";
import { generateIdeasMenu } from "../agents/ideator";
import { generateDrafts } from "../agents/writer";
import { critiqueDrafts } from "../agents/critic";
import { extractStyleRules } from "../agents/styleExtractor";
import { extractCoreFacts } from "../agents/factExtractor";

import { getConversationMemory, createConversationMemory, updateConversationMemory } from "../memory/memoryStore";
import { retrieveAnchors } from "../core/retrieval";
import { generateStyleProfile, saveStyleProfile } from "../core/styleProfile";
import { checkDeterministicNovelty } from "../core/noveltyGate";
import { prisma } from "../../db";

export interface OrchestratorInput {
  userId: string;
  xHandle?: string | null;
  runId?: string;
  threadId?: string;
  userMessage: string;
  recentHistory: string; // Condensed history for LLM context
  explicitIntent?: "coach" | "ideate" | "draft" | "review" | "edit" | "answer_question" | null;
  activeDraft?: string; // Existing draft text to edit
}

export type OrchestratorResponse = {
  mode: "coach" | "ideate" | "draft" | "error";
  response: string;
  data?: unknown;
};

/**
 * The V2 State Machine. Replaces `chatAgent.ts`.
 * Wires together memory, retrieval, decoupled prompts, and novelty gating.
 */
export async function manageConversationTurn(
  input: OrchestratorInput
): Promise<OrchestratorResponse> {
  const { userId, xHandle, runId, threadId, userMessage, recentHistory, explicitIntent, activeDraft } = input;
  const effectiveXHandle = xHandle || "default";

  // 1. Fetch Memory
  let memory = await getConversationMemory({ runId, threadId });
  if (!memory) {
    memory = await createConversationMemory({ runId, threadId, userId: userId === "anonymous" ? null : userId });
  }
  const activeConstraints = memory?.activeConstraints as string[] || [];
  const topicSummary = memory?.topicSummary || null;
  const concreteAnswerCount = memory?.concreteAnswerCount || 0;

  // 2. Classify Intent (Skip if explicitly provided by UI like selecting an angle)
  let classification;
  if (!explicitIntent) {
    classification = await classifyIntent(userMessage, recentHistory);
    if (!classification) {
      return { mode: "error", response: "Failed to classify intent." };
    }
  } else {
    classification = { intent: explicitIntent, needs_memory_update: false, confidence: 1 };
  }

  // 3. Update Memory Constraints (if requested by classifier)
  if (classification.needs_memory_update) {
    // For MVP, we just append the user message if it's a constraint, but realistically 
    // a separate LLM call would condense it. We will append it directly for now.
    const newConstraints = [...activeConstraints, userMessage];
    await updateConversationMemory({
      runId,
      threadId,
      activeConstraints: newConstraints,
    });
    activeConstraints.push(userMessage); // Update local state for this turn
  }

  // 4. Mode Selection Logic Rules (Deterministic over LLM preference)
  let mode = classification.intent;

  // Rule 4: System may *never* generate a draft if user just says "Hello" or "Help me grow".
  if (!explicitIntent && ["hello", "hi", "help me grow", "i want to grow"].includes(userMessage.toLowerCase().trim())) {
    mode = "coach";
  }

  // Rule 2: Switch to Ideate IF broad topic but lacks angle AND concrete answers < 2
  if (!explicitIntent && mode === "draft" && !topicSummary && concreteAnswerCount < 2) {
    mode = "ideate";
  }

  // 5. Pre-fetch context required for generation, regardless of mode (Persona & Retrieval)
  const [styleCard, anchors, extractedRules, extractedFacts] = await Promise.all([
    generateStyleProfile(userId, effectiveXHandle, 20),
    retrieveAnchors(userId, effectiveXHandle, userMessage || topicSummary || "growth"),
    userId !== "anonymous" ? extractStyleRules(userMessage, recentHistory) : Promise.resolve(null),
    userId !== "anonymous" ? extractCoreFacts(userMessage, recentHistory) : Promise.resolve(null)
  ]);

  // If the user commanded new stylistic rules, permanently apply them to the active profile
  if (styleCard && extractedRules && extractedRules.length > 0) {
    styleCard.customGuidelines = Array.from(new Set([...(styleCard.customGuidelines || []), ...extractedRules]));
    saveStyleProfile(userId, effectiveXHandle, styleCard).catch(e => console.error("Failed to save style profile:", e));
  }

  // If the user stated explicit new facts, permanently apply them to the active profile context
  if (styleCard && extractedFacts && extractedFacts.length > 0) {
    styleCard.contextAnchors = Array.from(new Set([...(styleCard.contextAnchors || []), ...extractedFacts]));
    saveStyleProfile(userId, effectiveXHandle, styleCard).catch(e => console.error("Failed to save style profile:", e));
  }

  const storedRun = await prisma.onboardingRun.findUnique({ where: { id: runId } });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const oResult = storedRun?.result as Record<string, any>;
  const stage = oResult?.growthStage || "Unknown";
  const goal = oResult?.strategyState?.goal || "Unknown";
  const contextAnchorsStr = styleCard && styleCard.contextAnchors?.length > 0
    ? `\n- Known Facts: ${styleCard.contextAnchors.join(" | ")}`
    : "";

  const userContextString = `
User Profile Summary:
- Stage: ${stage}
- Primary Goal: ${goal}${contextAnchorsStr}
`.trim();

  // 5. Execute Mode
  switch (mode) {
    case "coach":
    case "answer_question":
    default: {
      const coachReply = await generateCoachReply(userMessage, recentHistory, topicSummary, styleCard, anchors.topicAnchors, userContextString);

      // Update memory concrete count if they actually answered something
      if (userMessage.length > 15) {
        await updateConversationMemory({ runId, threadId, concreteAnswerCount: concreteAnswerCount + 1 });
      }

      return {
        mode: "coach",
        response: coachReply?.response || "I hear you. Can you tell me more?",
        data: { probingQuestion: coachReply?.probingQuestion },
      };
    }

    case "ideate": {
      const ideas = await generateIdeasMenu(userMessage, topicSummary, recentHistory, styleCard, anchors.topicAnchors, userContextString);

      // Update memory summary 
      await updateConversationMemory({ runId, threadId, topicSummary: userMessage });

      return {
        mode: "ideate",
        response: ideas?.close || "here are a few angles — which one feels right?",
        data: ideas,
      };
    }

    case "draft":
    case "review":
    case "edit": {
      // Fetch historical posts for Novelty Gate
      const pastPosts = await prisma.post.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { text: true }
      });
      const historicalTexts = pastPosts.map(p => p.text);

      // Step B: Formulate Strategy Plan
      const plan = await generatePlan(userMessage, topicSummary, activeConstraints, recentHistory, activeDraft);
      if (!plan) return { mode: "error", response: "Failed to generate strategy plan." };

      // Step C: Generate single draft
      const writerOutput = await generateDrafts(plan, styleCard, anchors.topicAnchors, activeConstraints, recentHistory, activeDraft);
      if (!writerOutput) return { mode: "error", response: "Failed to write draft." };

      // Step D: Critique & Refine
      const criticOutput = await critiqueDrafts(writerOutput, activeConstraints, styleCard);
      if (!criticOutput) return { mode: "error", response: "Failed to critique draft." };

      // Step E: Novelty Gate
      const noveltyCheck = checkDeterministicNovelty(criticOutput.finalDraft, historicalTexts);
      if (!noveltyCheck.isNovel) {
        return {
          mode: "coach",
          response: "i wrote a draft but it sounded too similar to something you've already posted. can we approach this from a different angle?",
        };
      }

      // Update memory
      await updateConversationMemory({ runId, threadId, topicSummary: plan.objective });

      return {
        mode: "draft",
        response: criticOutput.finalResponse,
        data: {
          angle: criticOutput.finalAngle,
          draft: criticOutput.finalDraft,
          supportAsset: writerOutput.supportAsset,
          issuesFixed: criticOutput.issues,
        },
      };
    }
  }
}
