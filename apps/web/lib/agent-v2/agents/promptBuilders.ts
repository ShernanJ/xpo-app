import type { VoiceStyleCard } from "../core/styleProfile";
import type { VoiceTarget } from "../core/voiceTarget";
import type { ThreadFramingStyle } from "../../onboarding/draftArtifacts";
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
import type {
  CreatorProfileHints,
  GroundingPacket,
} from "../orchestrator/groundingPacket";
import { buildGroundingPromptBlock } from "./groundingPromptBlock";
import {
  buildPlannerJsonContract,
  buildWriterJsonContract,
} from "./jsonPromptContracts";
import { resolveWriterPromptGuardrails } from "./draftPromptGuards";
import {
  buildEngagementBaitRule,
  buildMarkdownStylingRule,
  buildThreadFramingRequirement,
  buildVerificationProfessionalismRule,
} from "./xPostPromptRules";

function buildArtifactContextBlock(args: {
  activePlan?: StrategyPlan | null;
  activeDraft?: string;
  latestRefinementInstruction?: string | null;
  lastIdeationAngles?: string[];
}): string | null {
  const lines: string[] = [];

  if (args.activePlan) {
    lines.push(
      `- Active plan objective: ${args.activePlan.objective}`,
      `- Active plan angle: ${args.activePlan.angle}`,
      `- Active plan format: ${args.activePlan.formatPreference || "shortform"}`,
    );
  }

  if (args.activeDraft?.trim()) {
    lines.push("- Active draft artifact: present");
  }

  if (args.latestRefinementInstruction?.trim()) {
    lines.push(`- Latest refinement instruction: ${args.latestRefinementInstruction.trim()}`);
  }

  if (args.lastIdeationAngles && args.lastIdeationAngles.length > 0) {
    lines.push(
      `- Ideation options in scope: ${args.lastIdeationAngles.slice(0, 3).join(" | ")}`,
    );
  }

  if (lines.length === 0) {
    return null;
  }

  return `
ACTIVE ARTIFACT CONTEXT:
${lines.join("\n")}

Use this block to continue the current plan/draft/idea set even if the latest user turn is short.
Treat this artifact context as more reliable than vague transcript wording when they conflict.
Do NOT reset to a fresh direction if the user is clearly continuing the active artifact.
  `.trim();
}

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

const EXPLICIT_CONTRAST_REQUEST_PATTERNS = [
  /\bvs\b/i,
  /\bversus\b/i,
  /\bcompare(?:d)?\s+to\b/i,
  /\bbetter\s+than\b/i,
  /\bworse\s+than\b/i,
  /\binstead\s+of\b/i,
  /\bunlike\b/i,
  /\bnot\s+just\b/i,
  /\bnot\s+another\b/i,
  /\bmyth\b/i,
  /\bmyths\b/i,
  /\bcontrarian\b/i,
  /\bpush\s+back\b/i,
  /\bpushback\b/i,
  /\bwrong\s+about\b/i,
  /\boverrated\b/i,
  /\bunderrated\b/i,
  /\bbeats?\b/i,
];

function shouldUsePlainFactualProductMode(args: {
  sourceText: string;
  activeConstraints: string[];
}): boolean {
  const groundingLines = args.activeConstraints.filter(
    (entry) =>
      /^Correction lock:/i.test(entry) || /^Topic grounding:/i.test(entry),
  );

  if (groundingLines.length === 0) {
    return false;
  }

  return !EXPLICIT_CONTRAST_REQUEST_PATTERNS.some((pattern) =>
    pattern.test(args.sourceText),
  );
}

function buildPlainFactualProductBlock(args: {
  sourceText: string;
  activeConstraints: string[];
}): string | null {
  if (!shouldUsePlainFactualProductMode(args)) {
    return null;
  }

  return `
PLAIN FACTUAL PRODUCT MODE:
- The user gave grounded product facts, not a comparison brief.
- Default to a plain descriptive angle before reaching for a contrarian or market-level framing.
- Do NOT open with universal claims like "every tool", "most tools", "most people", "everyone", "just another tool", or similar broad contrast unless the user explicitly asked for that angle.
- Do NOT invent launch language, proof points, or promo CTA copy unless the user explicitly gave them.
- Avoid adding payoff phrasing like "post-ready tweets", "quicker follower growth", "give it a try", or "see for yourself" when those details were not in the grounding.
- If the grounding already contains clear usable wording, stay close to it instead of rewriting it into new marketing language or synonyms.
- Do NOT add an invented before-state or pain-point setup like "tired of...", "stopped overthinking...", or similar framing unless the user actually gave that setup.
- Do NOT restate the same grounded benefit a second time with a new synonym. If the grounding already says "without the mental load", do not add another line like "no extra thinking required."
- If the grounding is simple, keep the framing simple.
  `.trim();
}

function buildGroundingPacketBlock(
  groundingPacket: GroundingPacket | null | undefined,
): string | null {
  return buildGroundingPromptBlock({
    groundingPacket,
    title: "GROUNDING PACKET",
    sourceMaterialLimit: 2,
    claimLabel: "claim seed",
    snippetLabel: "snippet seed",
    guidanceLines: [
      "Use this packet as the authority for autobiographical, numeric, and factual specificity.",
      "Voice context hints can guide territory, framing, or emphasis, but they are NOT proof on their own.",
      "Historical posts, creator-profile hints, and voice examples are NOT factual authority unless the same detail appears in this packet.",
      "If source material details are present, prefer their saved claim/snippet seeds over invented framing.",
      "If Allowed first-person claims is empty, do NOT choose or draft a lived-experience story. Default to framework, opinion, or principle language instead.",
      "If a detail is missing from this packet, the chat history, or hard grounding, do not invent it.",
    ],
  });
}

function buildSafeFrameworkFallbackBlock(
  groundingPacket: GroundingPacket | null | undefined,
): string | null {
  if (!groundingPacket) {
    return null;
  }

  if (
    groundingPacket.unknowns.length === 0 ||
    groundingPacket.allowedFirstPersonClaims.length > 0
  ) {
    return null;
  }

  return `
SAFE FRAMEWORK FALLBACK MODE:
- Grounding is too thin for a lived story, proof-heavy claim, or concrete case-study framing.
- Prefer an opinionated take with honest hedging over a generic framework. If you have a real angle, write it with confidence on the parts you know and honest uncertainty on the parts you don't.
- Do NOT invent specifics just to make the draft or plan feel complete.
- If a concrete result, customer, metric, timeline, or first-person proof is missing, leave it out instead of filling it in.
- A strong opinion post with "i think" or "here's what i've seen" is better than a templated "3 things about X" framework.
  `.trim();
}

function buildCreatorProfileHintsBlock(
  creatorProfileHints: CreatorProfileHints | null | undefined,
): string | null {
  if (!creatorProfileHints) {
    return null;
  }

  return `
CREATOR PROFILE HINTS:
- Preferred output shape: ${creatorProfileHints.preferredOutputShape}
- Thread bias: ${creatorProfileHints.threadBias}
- Preferred hook patterns: ${creatorProfileHints.preferredHookPatterns.join(" | ") || "None"}
- Tone guidelines: ${creatorProfileHints.toneGuidelines.join(" | ") || "None"}
- CTA policy: ${creatorProfileHints.ctaPolicy || "None"}
- Top example snippets: ${creatorProfileHints.topExampleSnippets.join(" | ") || "None"}
- Known for: ${creatorProfileHints.knownFor || "None"}
- Target audience: ${creatorProfileHints.targetAudience || "None"}
- Content pillars: ${creatorProfileHints.contentPillars?.join(" | ") || "None"}
- Reply goals: ${creatorProfileHints.replyGoals?.join(" | ") || "None"}
- Profile conversion cues: ${creatorProfileHints.profileConversionCues?.join(" | ") || "None"}
- Off-brand themes: ${creatorProfileHints.offBrandThemes?.join(" | ") || "None"}
- Ambiguities: ${creatorProfileHints.ambiguities?.join(" | ") || "None"}
- Learning signals: ${creatorProfileHints.learningSignals?.join(" | ") || "None"}

Use these hints to bias format, hook shape, pacing, and CTA choices before you improvise.
They should shape the structure of the draft without turning into copied wording.
If ambiguities are present, choose the narrowest useful interpretation instead of acting certain.
Every draft or reply must clearly map to at least one current content pillar or learning signal.
Reject broad motivational filler, generic praise-only replies, and off-brand side quests even if they sound polished.
  `.trim();
}

export interface BuildPlanInstructionArgs {
  userMessage: string;
  topicSummary: string | null;
  activeConstraints: string[];
  recentHistory: string;
  activeDraft?: string;
  voiceTarget?: VoiceTarget | null;
  groundingPacket?: GroundingPacket | null;
  creatorProfileHints?: CreatorProfileHints | null;
  options?: {
    goal?: string;
    conversationState?: ConversationState;
    antiPatterns?: string[];
    draftPreference?: DraftPreference;
    formatPreference?: DraftFormatPreference;
    activePlan?: StrategyPlan | null;
    latestRefinementInstruction?: string | null;
    lastIdeationAngles?: string[];
  };
}

function buildPlanRequirementsBlock(args: {
  isEditing: boolean;
}): string {
  if (args.isEditing) {
    return `REQUIREMENTS:
1. Identify EXACTLY what needs to change in the existing draft to satisfy the user's request.
2. Keep the core angle intact unless the user explicitly asks to change it.
3. Put additions in "mustInclude" and removals in "mustAvoid".
4. If any active session constraint starts with "Correction lock:" or "Topic grounding:", treat it as hard factual grounding. Preserve it exactly and do not reintroduce the old assumption.`;
  }

  return `REQUIREMENTS:
1. Pick a compelling, draftable angle for this exact request. If enough context already exists to write from, choose a direction that can be drafted immediately instead of turning the turn into extra discovery.
2. Choose the right target lane (original / reply / quote) and the strongest hook type for that angle. The hook should come from a real tension, surprise, contradiction, stake, or concrete moment in the request, not a generic "thoughts on" setup.
3. Use "mustInclude" for concrete proof, scenes, stakes, outcomes, or facts that make the draft feel earned. Use "mustAvoid" for cliches, stale framing, or user-rejected patterns. Do NOT fill either list with meta writing advice like "be clear", "make it engaging", or "keep it concise."
4. Do NOT invent fake metrics, backstory, hidden workflow steps, UI pain points, product behavior, or constraints the user never gave.
5. If the user names a product, extension, tool, or company but does NOT explain what it actually does, keep the plan generic rather than filling in imagined specifics.
6. If the user asks for a post about a concrete scene, event, conversation, game, meeting, or anecdote, keep the plan anchored to that exact scene. Do NOT swap in a product pitch, internal tool, growth mechanic, or lesson they never named.
7. If FACTUAL GROUNDING or hard grounding is present, use it as the source of truth. Do NOT broaden the product into a nearby category, implied mechanic, market comparison, or first-person usage story that was not explicitly grounded.
8. If PLAIN FACTUAL PRODUCT MODE is present, prefer a descriptive angle over a contrarian one. Do not force a "most people get this wrong" or "every tool..." setup unless the user explicitly asked for comparison or pushback.
9. If RECENT CHAT HISTORY includes an earlier assistant guess or rejected draft that the user corrected, treat the correction as the source of truth and ignore the older assistant wording.
10. If GROUNDING PACKET says Allowed first-person claims is empty, do NOT choose a lived-experience story angle. Pick a framework, opinion, or plain factual angle instead.
11. If SAFE FRAMEWORK FALLBACK MODE is present, treat that as the preferred fallback instead of squeezing in invented specifics.
12. Use CREATOR PROFILE HINTS to bias target lane, hook family, and format preference when the user did not explicitly override them.
13. Keep "pitchResponse" short, lowercase, natural, and action-oriented. It should describe the direction itself, not your process.
14. Good \`pitchResponse\`: "lead with the contradiction between the promise and what actually changed"
15. Bad \`pitchResponse\`: "got it, here's the plan", "let's do...", "i'm thinking we should...", "want me to draft it?"`;
}

function buildThreadBeatPlanningBlock(): string {
  return `
THREAD BEAT PLANNING:
Since this is a thread, you MUST include a "posts" array in your output.
Each post object has: role, objective, proofPoints, transitionHint.

Roles to choose from:
- "hook": Opens curiosity or stakes. Must NOT summarize the whole thread.
- "setup": Defines the context, frames the problem or question.
- "proof": Delivers a distinct beat - one fact, example, observation, or argument.
- "turn": Introduces a twist, counterpoint, or shift in perspective.
- "payoff": Delivers the core insight or takeaway the reader came for.
- "close": Wraps up with a clear ending - call to action, reflection, or punchline.

Rules for thread planning:
- 3 to 6 posts. Default to 4 or 5 unless the material clearly earns 6.
- Each post must carry ONE clear beat, not a compressed summary or catch-all bucket.
- Each "proofPoints" array should contain 1 to 2 specific points, not every sub-idea from the whole thread.
- Proof points must be concrete evidence, scenes, constraints, examples, or sharp claims from the request/grounding. Do NOT use meta reminders like "be specific", "make it clear", or "keep it engaging" as proof points.
- The hook post must open a loop or create tension, NOT summarize. Use one specific contradiction, surprise, stake, or scene from the source material to earn the hook.
- Every post must advance the thread, not restate the previous beat in new words.
- transitionHint should explain how the next post earns its place. Use null only for the last post.
- Do NOT plan an essay that will be chopped into posts.
- Do NOT repeat the same proof point, hook framing, or payoff line across multiple posts.
`.trim();
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
  const plainFactualProductBlock = buildPlainFactualProductBlock({
    sourceText: args.userMessage,
    activeConstraints: args.activeConstraints,
  });
  const groundingPacketBlock = buildGroundingPacketBlock(args.groundingPacket);
  const safeFrameworkFallbackBlock = buildSafeFrameworkFallbackBlock(args.groundingPacket);
  const creatorHintsBlock = buildCreatorProfileHintsBlock(args.creatorProfileHints);
  const artifactContextBlock = buildArtifactContextBlock({
    activePlan: args.options?.activePlan || null,
    activeDraft: args.activeDraft,
    latestRefinementInstruction: args.options?.latestRefinementInstruction || null,
    lastIdeationAngles: args.options?.lastIdeationAngles || [],
  });

  return `
You are shaping the strongest next post direction for an X growth coach / ghostwriter system.
Return a tight plan the writer can execute, not a presentation about your process.
Optimize for low mental load: if there is enough context to move, choose a clean draftable direction instead of turning the turn into discovery theater.
${isEditing
      ? `This turn is about revising an existing draft. Keep the core idea unless the user clearly wants a different angle.`
      : `This turn is about a new ${formatPreference === "longform" ? "longform" : formatPreference === "thread" ? "thread" : "shortform"} post.`}

${buildConversationToneBlock("plan")}
${buildGoalHydrationBlock(goal, "plan")}
${buildStateHydrationBlock(conversationState, "plan")}
${buildDraftPreferenceBlock(draftPreference, "plan")}
${buildFormatPreferenceBlock(formatPreference, "plan")}
${buildVoiceHydrationBlock(null, args.voiceTarget)}
${buildAntiPatternBlock(antiPatterns)}

${isEditing ? `EXISTING DRAFT TO EDIT:\n${args.activeDraft}\n\n` : ""}
${artifactContextBlock ? `${artifactContextBlock}\n\n` : ""}

RECENT CHAT HISTORY (For context on what they are replying to):
${args.recentHistory}

USER'S CORE TOPIC/SUMMARY:
${args.topicSummary || "None"}

USER'S DIRECT REQUEST:
${args.userMessage}

ACTIVE SESSION CONSTRAINTS (Rules the user has previously set):
${args.activeConstraints.join(" | ") || "None"}

${hardGroundingBlock ? `${hardGroundingBlock}\n` : ""}

${groundingPacketBlock ? `${groundingPacketBlock}\n` : ""}
${safeFrameworkFallbackBlock ? `${safeFrameworkFallbackBlock}\n` : ""}

${creatorHintsBlock ? `${creatorHintsBlock}\n` : ""}

${plainFactualProductBlock ? `${plainFactualProductBlock}\n` : ""}

${concreteSceneBlock ? `${concreteSceneBlock}\n` : ""}

${buildPlanRequirementsBlock({ isEditing })}

${formatPreference === "thread" ? `${buildThreadBeatPlanningBlock()}\n` : ""}

STYLE:
- No internal workflow language.
- No consultant tone.
- No fluff or performative friendliness.
- No fake certainty if the topic is underspecified.
- The plan can be structured, but the pitch to the user should feel like a plain next-step DM, not a strategy memo.

${buildPlannerJsonContract({ isThread: formatPreference === "thread" })}
  `.trim();
}

export interface BuildWriterInstructionArgs {
  plan: StrategyPlan;
  styleCard: VoiceStyleCard | null;
  topicAnchors: string[];
  referenceAnchorMode?: "historical_posts" | "reference_hints";
  activeConstraints: string[];
  recentHistory: string;
  activeDraft?: string;
  voiceTarget?: VoiceTarget | null;
  groundingPacket?: GroundingPacket | null;
  creatorProfileHints?: CreatorProfileHints | null;
  options?: {
    conversationState?: ConversationState;
    antiPatterns?: string[];
    maxCharacterLimit?: number;
    threadPostMaxCharacterLimit?: number;
    goal?: string;
    draftPreference?: DraftPreference;
    formatPreference?: DraftFormatPreference;
    sourceUserMessage?: string;
    threadFramingStyle?: ThreadFramingStyle | null;
    activePlan?: StrategyPlan | null;
    latestRefinementInstruction?: string | null;
    lastIdeationAngles?: string[];
  };
}

export function buildWriterInstruction(args: BuildWriterInstructionArgs): string {
  const isEditing = !!args.activeDraft;
  const conversationState = args.options?.conversationState || "draft_ready";
  const antiPatterns = args.options?.antiPatterns || [];
  const maxCharacterLimit = args.options?.maxCharacterLimit ?? 280;
  const threadPostMaxCharacterLimit = args.options?.threadPostMaxCharacterLimit ?? null;
  const goal = args.options?.goal || "audience growth";
  const draftPreference = args.options?.draftPreference || "balanced";
  const formatPreference =
    args.options?.formatPreference || args.plan.formatPreference || "shortform";
  const threadFramingStyle = args.options?.threadFramingStyle ?? null;
  const {
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
  const plainFactualProductBlock = buildPlainFactualProductBlock({
    sourceText: args.options?.sourceUserMessage || [args.plan.objective, args.plan.angle].join(" "),
    activeConstraints: args.activeConstraints,
  });
  const groundingPacketBlock = buildGroundingPacketBlock(args.groundingPacket);
  const safeFrameworkFallbackBlock = buildSafeFrameworkFallbackBlock(args.groundingPacket);
  const creatorHintsBlock = buildCreatorProfileHintsBlock(args.creatorProfileHints);
  const artifactContextBlock = buildArtifactContextBlock({
    activePlan: args.options?.activePlan || args.plan,
    activeDraft: args.activeDraft,
    latestRefinementInstruction: args.options?.latestRefinementInstruction || null,
    lastIdeationAngles: args.options?.lastIdeationAngles || [],
  });
  const referenceAnchorBlock =
    args.referenceAnchorMode === "reference_hints"
      ? `
SAFE REFERENCE HINTS (VOICE/SHAPE ONLY):
${args.topicAnchors.length > 0 ? args.topicAnchors.map((anchor) => `- ${anchor}`).join("\n") : "- None"}
Use these only for cadence, structure, and thematic fit.
Do NOT turn them into facts, product mechanics, timelines, anecdotes, or proof claims.
`.trim()
      : `
USER'S HISTORICAL POSTS (TWO-LANE REFERENCE POLICY):
${args.topicAnchors.join("\n---") || "None"}

VOICE ANCHORS (always safe): Use these posts to match the user's voice, pacing, sentence shape, vocabulary, and recurring thematic territory.

EVIDENCE ANCHORS (selective reuse): If a fact, metric, story, or claim from these posts is ALSO confirmed in the GROUNDING PACKET (durable facts, source materials, or allowed first-person claims), you MAY reuse it for specificity. If it is NOT confirmed in the grounding packet, treat it as voice-only and do NOT copy it as a factual claim.

This means: user-owned facts CAN make drafts more specific and "earned" when grounding confirms them. But unconfirmed details from old posts must stay out of the new draft.
`.trim();
  const threadCadenceBlock =
    formatPreference === "thread"
      ? buildThreadCadenceBlock({
          styleCard: args.styleCard,
          topicAnchors: args.topicAnchors,
          referenceAnchorMode: args.referenceAnchorMode,
          sourceUserMessage: args.options?.sourceUserMessage || "",
          voiceTarget: args.voiceTarget ?? null,
          threadFramingStyle,
        })
      : null;
  const factualTruthLayer = [
    concreteSceneBlock,
    hardGroundingBlock,
    groundingPacketBlock,
    safeFrameworkFallbackBlock,
    plainFactualProductBlock,
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n\n");
  // Build thread beat plan if available from the planner
  const threadBeatPlan = formatPreference === "thread" && "posts" in args.plan && Array.isArray((args.plan as Record<string, unknown>).posts)
    ? (args.plan as Record<string, unknown>).posts as Array<{
        role: string;
        objective: string;
        proofPoints: string[];
        transitionHint: string | null;
      }>
    : null;

  const threadBeatBlock = threadBeatPlan
    ? `\nTHREAD BEAT PLAN (draft each post from this structure):\n${threadBeatPlan
        .map(
          (post, index) =>
            `Post ${index + 1} [${post.role.toUpperCase()}]: ${post.objective}${
              post.proofPoints.length > 0
                ? `\n  Proof: ${post.proofPoints.join(" | ")}`
                : ""
            }${
              post.transitionHint
                ? `\n  → bridges to next: ${post.transitionHint}`
                : ""
            }`,
        )
        .join("\n")}\n\nDraft each post to fulfill its assigned role in order. Each post separated by ---.\nKeep the serialized post count aligned with this beat plan unless a factual or safety constraint makes one beat unusable.\nUse each post's proof points in that post instead of scattering them across the thread.\nIf a transition hint is present, make the handoff felt in the wording between those beats.\nDo NOT compress multiple beats into one post.\nDo NOT repeat the hook's framing in later posts.`
    : null;

  const strategyLayer = `
STRATEGIC DRAFT PLAN:
Objective: ${args.plan.objective}
Angle: ${args.plan.angle}
Target Lane: ${args.plan.targetLane}
Hook Type: ${args.plan.hookType}
Must Include: ${args.plan.mustInclude.join(" | ") || "None"}
Must Avoid: ${args.plan.mustAvoid.join(" | ") || "None"}
Active Session Constraints: ${args.activeConstraints.join(" | ") || "None"}
${creatorHintsBlock ? `\n${creatorHintsBlock}` : ""}
${threadBeatBlock ? `\n${threadBeatBlock}` : ""}
  `.trim();
  const voiceShapeLayer = `
VOICE / SHAPE LAYER:
${referenceAnchorBlock}

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

${threadCadenceBlock ? `${threadCadenceBlock}\n` : ""}
  `.trim();

  return `
You are an elite ghostwriter for X (Twitter).
${isEditing ? `Your task is to take a Strategy Plan and apply it to EDIT an existing draft.`
      : `Your task is to take a strict Strategy Plan and generate EXACTLY 1 focused, high-quality draft.`}

${buildConversationToneBlock("draft")}
${buildGoalHydrationBlock(goal, "draft")}
${buildStateHydrationBlock(conversationState, "draft")}
${buildDraftPreferenceBlock(draftPreference, "draft")}
${buildFormatPreferenceBlock(formatPreference, "draft")}
${buildVoiceHydrationBlock(args.styleCard, args.voiceTarget)}
${buildAntiPatternBlock(antiPatterns)}

${isEditing ? `EXISTING DRAFT TO EDIT (USE THIS AS YOUR BASELINE):\n${args.activeDraft}\n\n` : ""}
${artifactContextBlock ? `${artifactContextBlock}\n\n` : ""}

RECENT CHAT HISTORY (Provides context on what the user is replying to):
${args.recentHistory}

FACTUAL TRUTH LAYER:
${factualTruthLayer || "None"}

${strategyLayer}

${voiceShapeLayer}

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
5. If the user did not specify a concrete topic, stay inside the user's usual subject matter and angles from their historical signals/reference material instead of drifting into random generic business content.
6. Provide an idea for a "supportAsset" (image/video idea to attach).
7. ANTI-RECYCLING: If the chat history contains a previous draft, you MUST write a COMPLETELY DIFFERENT structure, hook, and framing for the new draft. Do NOT reuse the same template, phrasing patterns, or CTA. Every draft must feel fresh.
8. If the user gave negative feedback about a previous draft (e.g. "i don't like the emoji usage", "it's all over the place"), treat that as a HARD constraint for this draft.
9. HARD LENGTH CAP: The "draft" field must stay at or under ${maxCharacterLimit.toLocaleString()} weighted X characters. This is a maximum, not a target.
10. If this is shortform, stay tight and get to the payoff fast. If this is longform, you may use more room for setup and development, but keep it readable and sharp. If this is a thread, write 4-6 posts separated by a line containing only ---, keep every post within ${threadPostMaxCharacterLimit?.toLocaleString() || "the account's allowed"} weighted X character limit, and let each post carry a full beat instead of forcing everything into legacy 280-character tweet brevity. When the per-post limit is higher, use the room when it improves setup, proof, or transitions.${buildThreadFramingRequirement({ threadFramingStyle, mode: "draft" })}
10a. If this is NOT a thread, return exactly one standalone post. Do NOT use standalone --- separators, multi-post serialization, or thread formatting in the "draft" field.
11. ${buildVerificationProfessionalismRule("draft")}
12. If any Active Session Constraint starts with "Correction lock:" or "Topic grounding:", treat it as hard factual grounding. Preserve it exactly and do not drift back to the earlier assumption.
12a. If FACTUAL GROUNDING is present, build the post from those exact product facts. Do NOT widen them into adjacent mechanics, categories, or claims that sound plausible but were never stated.
12b. If FACTUAL GROUNDING is present, do NOT invent first-person product usage or testing claims such as "i tried", "i use", "i let it", or "we switched to it" unless the user explicitly said that in the chat.
12c. If PLAIN FACTUAL PRODUCT MODE is present, avoid inflated market contrast. Do NOT default to lines like "every tool...", "most tools...", "most people...", or "everyone..." unless the user explicitly asked for a comparison angle.
12d. If PLAIN FACTUAL PRODUCT MODE is present, do NOT invent launch framing, extra proof claims, or generic marketing CTA copy. Keep the product wording plain and grounded.
12e. If PLAIN FACTUAL PRODUCT MODE is present and the user's grounded wording is already clear, keep the core wording close to the user's phrasing instead of swapping in looser synonyms.
12f. If PLAIN FACTUAL PRODUCT MODE is present, do NOT prepend an invented pain-point or before-state setup unless the user explicitly gave it.
12g. If PLAIN FACTUAL PRODUCT MODE is present, do NOT duplicate the same benefit with a second paraphrase. One grounded phrasing is enough.
12h. If RECENT CHAT HISTORY includes an earlier assistant guess or rejected draft that conflicts with factual grounding, treat that earlier text as superseded and do NOT reuse it.
13. If GROUNDING PACKET says Allowed first-person claims is empty, do NOT write a lived story or personal proof post. Write a framework, opinion, or plain factual post instead.
13a. If SAFE FRAMEWORK FALLBACK MODE is present, prefer a framework, opinion, principle, or plain factual execution over a fake specific one.
14. Use CREATOR PROFILE HINTS to bias hook family, CTA style, and shape before you improvise.
14a. Precedence order: FACTUAL TRUTH LAYER overrides STRATEGIC DRAFT PLAN, and STRATEGIC DRAFT PLAN overrides VOICE / SHAPE LAYER.
14b. Never use VOICE / SHAPE LAYER material to invent facts, metrics, product mechanics, anecdotes, or proof claims.
14c. If the strategic angle conflicts with the factual truth layer, keep the factual truth and adjust the framing instead of widening the claim.
15. ${buildMarkdownStylingRule("draft")}
16. ${buildEngagementBaitRule("draft")}
17. The "draft" field must contain only the final X post text. Do NOT include speaker labels, chat transcript lines, quoted prompt text, UI chrome, usernames/handles from a mock composer, timestamps, character counters, button labels, or commentary like "I'll drop a draft", "looks good. write this version now.", or "tightened it so it reads fast."

${buildWriterJsonContract()}
  `.trim();
}

function buildThreadCadenceBlock(args: {
  styleCard: VoiceStyleCard | null;
  topicAnchors: string[];
  referenceAnchorMode?: "historical_posts" | "reference_hints";
  sourceUserMessage: string;
  voiceTarget?: VoiceTarget | null;
  threadFramingStyle: ThreadFramingStyle | null;
}): string | null {
  const styleSignals = [
    args.styleCard?.pacing || "",
    ...(args.styleCard?.formattingRules || []),
    ...(args.styleCard?.customGuidelines || []),
  ]
    .join(" | ")
    .toLowerCase();
  const normalizedSource = args.sourceUserMessage.trim().toLowerCase();
  const sampleAnchors =
    args.referenceAnchorMode === "historical_posts"
      ? args.topicAnchors.slice(0, 3)
      : [];
  const totalLines = sampleAnchors.reduce((count, anchor) => {
    return (
      count +
      anchor
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean).length
    );
  }, 0);
  const bulletLines = sampleAnchors.reduce((count, anchor) => {
    return (
      count +
      anchor
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => /^[-*•>]/.test(line)).length
    );
  }, 0);
  const blankLineAnchors = sampleAnchors.filter((anchor) => /\n\s*\n/.test(anchor)).length;
  const multiBeatAnchors = sampleAnchors.filter((anchor) => {
    const lines = anchor
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    return lines.length >= 4;
  }).length;
  const proseHeavyExamples = totalLines === 0 ? false : bulletLines / totalLines <= 0.2;
  const storyLikeRequest =
    args.voiceTarget?.hookStyle === "story" ||
    /\b(story|journey|narrative|what happened|how i|how we|how my|led to|behind the scenes)\b/i.test(
      normalizedSource,
    );
  const hints: string[] = [];

  if (storyLikeRequest) {
    hints.push(
      "- Treat this as a native narrative thread. Each post should carry one lived beat or turn, not a compressed summary of the entire story.",
    );
  }

  if (
    args.voiceTarget?.compression === "spacious" ||
    blankLineAnchors > 0 ||
    multiBeatAnchors > 0 ||
    styleSignals.includes("flowing") ||
    styleSignals.includes("paragraph") ||
    styleSignals.includes("line break")
  ) {
    hints.push(
      "- Match the creator's thread cadence with short paragraphs and breathing room. Blank lines are good when they improve rhythm.",
    );
  }

  if (storyLikeRequest || proseHeavyExamples) {
    hints.push(
      "- Keep the opener and early posts prose-first. Do not front-load them with bullet stacks, credential dumps, or mini-slide formatting.",
    );
  } else if (styleSignals.includes("bullet") || styleSignals.includes("scan")) {
    hints.push(
      "- Keep it scannable, but avoid turning every post into a bullet wall. Mix clean prose with structure.",
    );
  }

  if (
    sampleAnchors.some((anchor) => anchor.length > 280) ||
    args.voiceTarget?.compression !== "tight"
  ) {
    hints.push(
      "- A single thread post can hold more than one sentence or paragraph when the beat needs it. Do not artificially compress it to shortform-post length.",
    );
  }

  if (args.threadFramingStyle !== "numbered") {
    hints.push(
      "- Let the first post feel like a natural opener from the creator's feed, not a table of contents or headline card.",
    );
  }

  if (hints.length === 0) {
    return null;
  }

  return `THREAD CADENCE:\n${hints.join("\n")}`;
}
