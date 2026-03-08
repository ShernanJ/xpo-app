import type { VoiceStyleCard } from "../core/styleProfile";
import type {
  ConversationState,
  DraftFormatPreference,
  DraftPreference,
  StrategyPlan,
} from "../contracts/chat";
import {
  buildAntiPatternBlock,
  buildConversationToneBlock,
  buildDraftPreferenceBlock,
  buildFormatPreferenceBlock,
  buildGoalHydrationBlock,
  buildStateHydrationBlock,
  buildVoiceHydrationBlock,
} from "../prompts/promptHydrator";
import {
  buildConcreteSceneDraftBlock,
  buildConcreteScenePlanBlock,
} from "../orchestrator/draftGrounding";
import { resolveWriterPromptGuardrails } from "./draftPromptGuards";

function buildHardGroundingBlock(activeConstraints: string[]): string | null {
  const groundingLines = activeConstraints
    .filter(
      (entry) =>
        /^Correction lock:/i.test(entry) || /^Topic grounding:/i.test(entry),
    )
    .map((entry) =>
      entry
        .replace(/^Correction lock:\s*/i, "")
        .replace(/^Topic grounding:\s*/i, "")
        .trim(),
    )
    .filter(Boolean);

  if (groundingLines.length === 0) {
    return null;
  }

  return `
FACTUAL GROUNDING:
${groundingLines.map((line) => `- ${line}`).join("\n")}

Treat these lines as source-of-truth facts.
Do NOT widen them into adjacent product categories, event framing, or mechanics the user did not state.
Do NOT turn the product into "another tool", a meetup, a hashtag engine, a growth hack, or any other nearby framing unless the grounding explicitly says that.
Do NOT invent first-person usage, personal testing, rollout history, or "i use / i tried / i let it" claims unless the grounding or chat explicitly says that.
`.trim();
}

export interface BuildPlanInstructionArgs {
  userMessage: string;
  topicSummary: string | null;
  activeConstraints: string[];
  recentHistory: string;
  activeDraft?: string;
  options?: {
    goal?: string;
    conversationState?: ConversationState;
    antiPatterns?: string[];
    draftPreference?: DraftPreference;
    formatPreference?: DraftFormatPreference;
  };
}

export function buildPlanInstruction(args: BuildPlanInstructionArgs): string {
  const isEditing = !!args.activeDraft;
  const goal = args.options?.goal || "audience growth";
  const conversationState = args.options?.conversationState || "collecting_context";
  const antiPatterns = args.options?.antiPatterns || [];
  const draftPreference = args.options?.draftPreference || "balanced";
  const formatPreference = args.options?.formatPreference || "shortform";
  const concreteSceneBlock = buildConcreteScenePlanBlock(args.userMessage);
  const hardGroundingBlock = buildHardGroundingBlock(args.activeConstraints);

  return `
You are shaping the strongest next post direction for an X growth coach / ghostwriter system.
Return a tight plan the writer can execute, not a presentation about your process.
Optimize for low mental load: if there is enough context to move, choose a clean draftable direction instead of turning the turn into discovery theater.
${isEditing
      ? `This turn is about revising an existing draft. Keep the core idea unless the user clearly wants a different angle.`
      : `This turn is about a new ${formatPreference === "longform" ? "longform" : "shortform"} post.`}

${buildConversationToneBlock()}
${buildGoalHydrationBlock(goal, "plan")}
${buildStateHydrationBlock(conversationState, "plan")}
${buildDraftPreferenceBlock(draftPreference, "plan")}
${buildFormatPreferenceBlock(formatPreference, "plan")}
${buildAntiPatternBlock(antiPatterns)}

${isEditing ? `EXISTING DRAFT TO EDIT:\n${args.activeDraft}\n\n` : ""}

RECENT CHAT HISTORY (For context on what they are replying to):
${args.recentHistory}

USER'S CORE TOPIC/SUMMARY:
${args.topicSummary || "None"}

USER'S DIRECT REQUEST:
${args.userMessage}

ACTIVE SESSION CONSTRAINTS (Rules the user has previously set):
${args.activeConstraints.join(" | ") || "None"}

${hardGroundingBlock ? `${hardGroundingBlock}\n` : ""}

${concreteSceneBlock ? `${concreteSceneBlock}\n` : ""}

${isEditing ? `REQUIREMENTS:
1. Identify EXACTLY what needs to change in the existing draft to satisfy the user's request.
2. Keep the core angle intact unless the user explicitly asks to change it.
3. If they ask to remove something (e.g. emojis), put that in "mustAvoid".
4. If they ask to add something, put that in "mustInclude".
5. If any active session constraint starts with "Correction lock:" or "Topic grounding:", treat it as hard factual grounding. Preserve it exactly and do not reintroduce the old assumption.` :
      `REQUIREMENTS:
1. Identify a compelling, non-obvious angle for this topic.
2. Choose a target lane (is this an original thought, or pushing back on common advice?)
3. Determine what must be included (proof points) and avoided (cliches).
4. CRITICAL: DO NOT invent fake metrics, backstory, or constraints that the user hasn't provided (e.g., if they say they built a tool, do not add "cut manual steps by 30%").
5. If the user names a product, extension, tool, or company but does NOT explain what it actually does, keep the plan generic. Do NOT invent hidden workflow steps, UI pain points, or product behavior.
6. If the user asks for a post about a concrete scene, event, conversation, game, meeting, or anecdote, keep the plan anchored to that exact scene. Do NOT swap in a product pitch, internal tool, growth mechanic, or lesson they never named.
7. If FACTUAL GROUNDING is present, use it as the source of truth for the plan. Do NOT broaden the product into a nearby category or implied mechanic that is not explicitly in that grounding.
8. If FACTUAL GROUNDING is present, do NOT add first-person product usage, adoption stories, or market comparisons unless the user explicitly gave them.
9. If enough context already exists to write from, choose a direction that can be drafted immediately. Do not ask the user to do extra thinking unless a missing fact truly blocks the post.
10. Specify the best hook type (e.g., "Counter-narrative", "Direct Action", "Framework").
11. Keep "pitchResponse" short, lowercase, natural, and collaborator-like. It should feel plain and useful, not warm or salesy. Never start with "got it", "let's", "here's the plan", or corporate framing.`}

STYLE:
- No internal workflow language.
- No consultant tone.
- No fluff or performative friendliness.
- No fake certainty if the topic is underspecified.
- The plan can be structured, but the pitch to the user should feel like a smart DM, not a strategy memo.

Respond ONLY with a valid JSON matching this schema:
{
  "objective": "...",
  "angle": "...",
  "targetLane": "original", // or "reply" or "quote"
  "mustInclude": ["specific detail 1"],
  "mustAvoid": ["generic word 1"],
  "hookType": "...",
  "pitchResponse": "Conversational pitch to the user..."
}
  `.trim();
}

export interface BuildWriterInstructionArgs {
  plan: StrategyPlan;
  styleCard: VoiceStyleCard | null;
  topicAnchors: string[];
  activeConstraints: string[];
  recentHistory: string;
  activeDraft?: string;
  options?: {
    conversationState?: ConversationState;
    antiPatterns?: string[];
    maxCharacterLimit?: number;
    goal?: string;
    draftPreference?: DraftPreference;
    formatPreference?: DraftFormatPreference;
    sourceUserMessage?: string;
  };
}

export function buildWriterInstruction(args: BuildWriterInstructionArgs): string {
  const isEditing = !!args.activeDraft;
  const conversationState = args.options?.conversationState || "draft_ready";
  const antiPatterns = args.options?.antiPatterns || [];
  const maxCharacterLimit = args.options?.maxCharacterLimit ?? 280;
  const goal = args.options?.goal || "audience growth";
  const draftPreference = args.options?.draftPreference || "balanced";
  const formatPreference =
    args.options?.formatPreference || args.plan.formatPreference || "shortform";
  const {
    noFabricatedAnecdotesGuardrail,
    sceneSource,
    concreteSceneMode,
    hardFactualGrounding,
  } = resolveWriterPromptGuardrails({
    planMustAvoid: args.plan.mustAvoid,
    activeConstraints: args.activeConstraints,
    sourceUserMessage: args.options?.sourceUserMessage,
    objective: args.plan.objective,
    angle: args.plan.angle,
    mustInclude: args.plan.mustInclude,
  });
  const concreteSceneBlock = concreteSceneMode
    ? buildConcreteSceneDraftBlock(sceneSource)
    : null;
  const hardGroundingBlock =
    hardFactualGrounding.length > 0
      ? `
FACTUAL GROUNDING:
${hardFactualGrounding.map((line) => `- ${line}`).join("\n")}

Treat these lines as source-of-truth facts.
Do NOT widen them into adjacent product categories, event framing, or mechanics the user did not state.
Do NOT turn the product into "another tool", a meetup, a hashtag engine, a growth hack, or any other nearby framing unless the grounding explicitly says that.
`.trim()
      : null;

  return `
You are an elite ghostwriter for X (Twitter).
${isEditing ? `Your task is to take a Strategy Plan and apply it to EDIT an existing draft.`
      : `Your task is to take a strict Strategy Plan and generate EXACTLY 1 focused, high-quality draft.`}

${buildConversationToneBlock()}
${buildGoalHydrationBlock(goal, "draft")}
${buildStateHydrationBlock(conversationState, "draft")}
${buildDraftPreferenceBlock(draftPreference, "draft")}
${buildFormatPreferenceBlock(formatPreference, "draft")}
${buildVoiceHydrationBlock(args.styleCard)}
${buildAntiPatternBlock(antiPatterns)}

${isEditing ? `EXISTING DRAFT TO EDIT (USE THIS AS YOUR BASELINE):\n${args.activeDraft}\n\n` : ""}

RECENT CHAT HISTORY (Provides context on what the user is replying to):
${args.recentHistory}

STRATEGY PLAN:
Objective: ${args.plan.objective}
Angle: ${args.plan.angle}
Target Lane: ${args.plan.targetLane}
Hook Type: ${args.plan.hookType}
Must Include: ${args.plan.mustInclude.join(" | ") || "None"}
Must Avoid: ${args.plan.mustAvoid.join(" | ") || "None"}
Active Session Constraints: ${args.activeConstraints.join(" | ") || "None"}

USER'S HISTORICAL POSTS (FOR VOICE AND THEMATIC REFERENCE):
${args.topicAnchors.join("\n---") || "None"}
CRITICAL: DO NOT copy facts, metrics, or personal stories from these historical posts into the new draft. Use them to understand the user's voice, pacing, and recurring thematic territory only.

${args.styleCard
      ? `
USER'S SPECIFIC WRITING STYLE:
- Sentence Openings: ${args.styleCard.sentenceOpenings.join(", ")}
- Sentence Closers: ${args.styleCard.sentenceClosers.join(", ")}
- Pacing: ${args.styleCard.pacing}
- Emojis: IF the user rarely uses emojis, DO NOT USE THEM. If they do, use them sparingly. (Pattern: ${args.styleCard.emojiPatterns.join(", ") || "None"})
- Slang/Vocabulary: ${args.styleCard.slangAndVocabulary.join(", ")}
- Formatting: ${args.styleCard.formattingRules.join(", ")}
${args.styleCard.customGuidelines.length > 0 ? `- EXPLICIT USER GUIDELINES (CRITICAL): ${args.styleCard.customGuidelines.join(" | ")}` : ""}
`
      : "No style card available. Write in a clean, punchy, conversational tone."
    }

${concreteSceneBlock ? `${concreteSceneBlock}\n` : ""}
${hardGroundingBlock ? `${hardGroundingBlock}\n` : ""}

REQUIREMENTS:
1. Generate EXACTLY 1 draft. Not 2. Not 3. One.
2. DO NOT invent random metrics, constraints, or backstory (like "juggling my day job" or "30% faster"). Stick ONLY to the facts the user provided in the chat history.
2a. NEVER invent specific counts or quantities (for example years, teammates, launches, percentages, revenue, follower counts, timelines, or attendance) unless that exact number is explicitly present in RECENT CHAT HISTORY or Active Session Constraints.
${concreteSceneMode
      ? `2b. STRICT FACTUAL MODE: Do NOT claim specific real-world events, attendance, conversations, travel, timelines, or named places (for example: "yesterday i was at ...") unless that fact is explicitly present in the chat history or active constraints. If details are missing, write a principle/opinion/framework post instead of an anecdote.`
      : ""}
${concreteSceneMode
      ? `2c. If the user's request is built around a concrete scene, event, conversation, game, meeting, or anecdote, preserve that exact setup. Do NOT replace it with a different product pitch, internal tool, metric, or lesson the user never mentioned.`
      : ""}
${isEditing ? `3. IMPORTANT: Do NOT rewrite the entire post from scratch unless the plan requires it. Keep the original structure and phrasing as much as possible, applying ONLY the edits requested in the "mustInclude", "mustAvoid", or "Angle" sections.` : `3. The draft should be the best possible execution of the plan.`}
4. Make it sound like the user actually wrote it — match their voice perfectly (e.g., if they write in all lowercase, YOU MUST write in all lowercase).
5. If the user did not specify a concrete topic, stay inside the user's usual subject matter and angles from their historical posts instead of drifting into random generic business content.
6. Provide an idea for a "supportAsset" (image/video idea to attach).
7. ANTI-RECYCLING: If the chat history contains a previous draft, you MUST write a COMPLETELY DIFFERENT structure, hook, and framing for the new draft. Do NOT reuse the same template, phrasing patterns, or CTA. Every draft must feel fresh.
8. If the user gave negative feedback about a previous draft (e.g. "i don't like the emoji usage", "it's all over the place"), treat that as a HARD constraint for this draft.
9. HARD LENGTH CAP: The "draft" field must stay at or under ${maxCharacterLimit.toLocaleString()} weighted X characters. This is a maximum, not a target.
10. If this is shortform, stay tight and get to the payoff fast. If this is longform, you may use more room for setup and development, but keep it readable and sharp.
11. Verification is not a professionalism signal. Do not make the writing more polished or corporate just because the account is verified.
12. If any Active Session Constraint starts with "Correction lock:" or "Topic grounding:", treat it as hard factual grounding. Preserve it exactly and do not drift back to the earlier assumption.
12a. If FACTUAL GROUNDING is present, build the post from those exact product facts. Do NOT widen them into adjacent mechanics, categories, or claims that sound plausible but were never stated.
12b. If FACTUAL GROUNDING is present, do NOT invent first-person product usage or testing claims such as "i tried", "i use", "i let it", or "we switched to it" unless the user explicitly said that in the chat.
13. X does NOT support markdown styling. Do not use bold, italics, headings, or other markdown markers like **text**, __text__, *text*, # heading, or backticks.
14. Do NOT use empty engagement-bait CTAs like "reply 'FOCUS'" or "comment 'X'" unless the reader clearly gets something specific in return (for example: a DM, a template, a checklist, a link, a copy, or access). If there is no real payoff, use a more natural CTA like asking for their take or asking them to try it and report back.

Respond ONLY with a valid JSON matching this schema:
{
  "angle": "...",
  "draft": "The actual post text...",
  "supportAsset": "...",
  "whyThisWorks": "...",
  "watchOutFor": "..."
}
  `.trim();
}
