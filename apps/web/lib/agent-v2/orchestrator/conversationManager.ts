import { classifyIntent } from "../agents/classifier";
import { generateCoachReply } from "../agents/coach";
import { generatePlan } from "../agents/planner";
import { generateIdeasMenu } from "../agents/ideator";
import { generateDrafts } from "../agents/writer";
import { critiqueDrafts } from "../agents/critic";

import { getConversationMemory, updateConversationMemory } from "../memory/memoryStore";
import { retrieveAnchors } from "../core/retrieval";
import { generateStyleProfile } from "../core/styleProfile";
import { checkDeterministicNovelty } from "../core/noveltyGate";
import { prisma } from "../../db";

export interface OrchestratorInput {
  userId: string;
  runId: string;
  userMessage: string;
  recentHistory: string; // Condensed history for LLM context
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
  const { userId, runId, userMessage, recentHistory } = input;

  // 1. Fetch Memory
  const memory = await getConversationMemory(runId);
  const activeConstraints = memory?.activeConstraints as string[] || [];
  const topicSummary = memory?.topicSummary || null;
  const concreteAnswerCount = memory?.concreteAnswerCount || 0;

  // 2. Classify Intent
  const classification = await classifyIntent(userMessage, recentHistory);

  if (!classification) {
    return { mode: "error", response: "Failed to classify intent." };
  }

  // 3. Update Memory Constraints (if requested by classifier)
  if (classification.needs_memory_update) {
    // For MVP, we just append the user message if it's a constraint, but realistically 
    // a separate LLM call would condense it. We will append it directly for now.
    const newConstraints = [...activeConstraints, userMessage];
    await updateConversationMemory({
      runId,
      activeConstraints: newConstraints,
    });
    activeConstraints.push(userMessage); // Update local state for this turn
  }

  // 4. Mode Selection Logic Rules (Deterministic over LLM preference)
  let mode = classification.intent;

  // Rule 4: System may *never* generate a draft if user just says "Hello" or "Help me grow".
  if (["hello", "hi", "help me grow", "i want to grow"].includes(userMessage.toLowerCase().trim())) {
    mode = "coach";
  }

  // Rule 2: Switch to Ideate IF broad topic but lacks angle AND concrete answers < 2
  if (mode === "draft" && !topicSummary && concreteAnswerCount < 2) {
    mode = "ideate";
  }

  // Pre-fetch style profile if we are drafting
  const styleCard = mode === "draft" ? await generateStyleProfile(userId, 20) : null;

  // 5. Execute Mode
  switch (mode) {
    case "coach":
    case "answer_question":
    default: {
      const coachReply = await generateCoachReply(userMessage, recentHistory, topicSummary);

      // Update memory concrete count if they actually answered something
      if (userMessage.length > 15) {
        await updateConversationMemory({ runId, concreteAnswerCount: concreteAnswerCount + 1 });
      }

      return {
        mode: "coach",
        response: coachReply?.response || "I hear you. Can you tell me more?",
        data: { probingQuestion: coachReply?.probingQuestion },
      };
    }

    case "ideate": {
      const ideas = await generateIdeasMenu(userMessage, topicSummary, recentHistory);

      // Update memory summary 
      await updateConversationMemory({ runId, topicSummary: userMessage });

      return {
        mode: "ideate",
        response: "Here are a few angles we could take. Which one feels right?",
        data: ideas,
      };
    }

    case "draft":
    case "review":
    case "edit": {
      // Step A: Dynamic Retrieval
      const anchors = await retrieveAnchors(userId, userMessage || topicSummary || "growth");

      // Fetch historical posts for Novelty Gate
      const pastPosts = await prisma.post.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { text: true }
      });
      const historicalTexts = pastPosts.map(p => p.text);

      // Step B: Formulate Strategy Plan
      const plan = await generatePlan(userMessage, topicSummary, activeConstraints);
      if (!plan) return { mode: "error", response: "Failed to generate strategy plan." };

      // Step C: Generate Drafts
      const writerOutput = await generateDrafts(plan, styleCard, anchors.topicAnchors, activeConstraints);
      if (!writerOutput) return { mode: "error", response: "Failed to write drafts." };

      // Step D: Critique & Refine
      const criticOutput = await critiqueDrafts(writerOutput, activeConstraints);
      if (!criticOutput) return { mode: "error", response: "Failed to critique drafts." };

      // Step E: Novelty Gate
      const vettedDrafts: string[] = [];
      const vettedAngles: string[] = [];

      for (let i = 0; i < criticOutput.finalDrafts.length; i++) {
        const d = criticOutput.finalDrafts[i];
        const angle = criticOutput.finalAngles[i];

        const noveltyCheck = checkDeterministicNovelty(d, historicalTexts);
        if (noveltyCheck.isNovel) {
          vettedDrafts.push(d);
          vettedAngles.push(angle);
        } else {
          console.log(`Draft rejected by novelty gate: ${noveltyCheck.reason}`);
        }
      }

      if (vettedDrafts.length === 0) {
        return {
          mode: "coach",
          response: "I wrote a few drafts, but they sounded too similar to things you've already posted. Can we approach this from a completely new angle?",
        };
      }

      // Update memory
      await updateConversationMemory({ runId, topicSummary: plan.objective });

      return {
        mode: "draft",
        response: criticOutput.finalResponse,
        data: {
          angles: vettedAngles,
          drafts: vettedDrafts,
          supportAsset: writerOutput.supportAsset,
          issuesFixed: criticOutput.issues,
        },
      };
    }
  }
}
